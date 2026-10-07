-- Session 16.1 — Manual QA Quality Framework, persistence foundation.
-- See docs/MANUAL_QA_QUALITY_FRAMEWORK.md and
-- docs/MANUAL_QA_MEASUREMENT_CONTRACT.md for the full concept/contract
-- this implements. Greenfield — no prior QA persistence existed
-- (confirmed by audit: no qa_review/turn_review/QualityObservation
-- table or migration anywhere in this schema before this one).
--
-- Three tables, same conventions as every prior session: uuid PK,
-- timestamptz audit columns, snake_case, plain text + check (not
-- enums), deny-all RLS, security definer RPCs under public.call_center_*,
-- grant execute to service_role only.

-- =====================================================================
-- 1. qa_reviews — one Human QA assessment of one interaction.
-- =====================================================================
create table if not exists call_center.qa_reviews (
  id uuid primary key default gen_random_uuid(),
  interaction_id text not null,
  channel text not null check (channel in ('voice', 'chat')),
  agent_id text not null,
  reviewer_user_id uuid not null references call_center.user_profiles(id),
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  request_completion text check (request_completion in ('YES', 'PARTIAL', 'NO', 'CANNOT_DETERMINE')),
  fcr text check (fcr in ('YES', 'NO', 'CANNOT_DETERMINE')),
  human_assistance_required text check (human_assistance_required in ('YES', 'NO', 'CANNOT_DETERMINE')),
  -- Deliberately NOT a check constraint — the brief requires preserving
  -- an agent's own legitimate business-outcome vocabulary where it
  -- differs from the default 5-value list (contract §6), so this is
  -- validated at the application layer against either the default list
  -- or the reviewed agent's own declared vocabulary, never hardcoded here.
  business_outcome text,
  reviewer_note text,
  -- Pins the Measurement Contract version this review was conducted
  -- under, so a future contract revision never silently reinterprets a
  -- historical review's findings under a different definition.
  contract_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One ACTIVE (in_progress) review per (interaction, channel, reviewer) —
-- resuming finds this row rather than creating a duplicate. A reviewer
-- may still start a NEW review of the same interaction after a prior
-- one was submitted (re-review), and a different reviewer may review
-- the same interaction independently (calibration) — neither is blocked.
create unique index if not exists qa_reviews_one_active_per_reviewer
  on call_center.qa_reviews (interaction_id, channel, reviewer_user_id)
  where status = 'in_progress';

create index if not exists qa_reviews_interaction_idx on call_center.qa_reviews (interaction_id, channel);
create index if not exists qa_reviews_agent_idx on call_center.qa_reviews (agent_id);
create index if not exists qa_reviews_reviewer_idx on call_center.qa_reviews (reviewer_user_id);

-- =====================================================================
-- 2. qa_turn_reviews — explicit per-turn review completion. Existence
--    of a row (and its status) is the ONLY signal of whether a human
--    looked at a turn — absence must never be read as PASS.
-- =====================================================================
create table if not exists call_center.qa_turn_reviews (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references call_center.qa_reviews(id) on delete cascade,
  -- Deterministic Call Centre turn id — src/lib/qaTurnIdentity.ts for
  -- voice (synthesized from interactionId+timestamp+speaker, never raw
  -- array position), ChatMessageRecord.id directly for chat.
  turn_id text not null,
  role text not null check (role in ('agent', 'customer')),
  status text not null default 'not_reviewed' check (status in ('not_reviewed', 'good', 'flagged', 'na')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_id, turn_id)
);

create index if not exists qa_turn_reviews_review_idx on call_center.qa_turn_reviews (review_id);

-- =====================================================================
-- 3. qa_findings — one evidenced quality observation. Parameter codes
--    are the SAME ids as the Ratio Explorer "Conversation Quality"
--    ratios (src/server/analytics/ratioRegistry.ts) — never a synonym,
--    per the Measurement Contract §0. Allowed values are parameter-
--    specific (PASS/FAIL, NO_ISSUE/ISSUE, GROUNDED/NOT_GROUNDED/
--    CANNOT_VERIFY, SUCCESSFUL/UNSUCCESSFUL, all with N_A) — validated
--    at the application layer (src/lib/qaParameters.ts) against the
--    exact per-parameter vocabulary, not a single flat DB check (9
--    different vocabularies don't fit one constraint cleanly, and the
--    canonical source of truth for "what's valid" is the shared TS
--    module both API and UI already import, not a second copy in SQL).
-- =====================================================================
create table if not exists call_center.qa_findings (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references call_center.qa_reviews(id) on delete cascade,
  parameter_code text not null,
  value text not null,
  primary_turn_id text not null,
  evidence_turn_ids text[] not null default '{}',
  reason_code text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists qa_findings_review_idx on call_center.qa_findings (review_id);
create index if not exists qa_findings_parameter_idx on call_center.qa_findings (parameter_code);

alter table call_center.qa_reviews enable row level security;
alter table call_center.qa_turn_reviews enable row level security;
alter table call_center.qa_findings enable row level security;
-- Deny-all RLS (no policies) — every access path is through the
-- security definer RPCs below, same convention as every prior table.

-- =====================================================================
-- 4. Permission vocabulary (additive to the 14.1 seed)
-- =====================================================================
insert into call_center.permissions (key, label, description, pillar) values
  ('qa.review', 'Conduct Human QA Review', 'Start, resume, and submit a Human QA review of a Call or Chat interaction, within Business Data Scope.', 'Improve')
on conflict (key) do nothing;

insert into call_center.role_permissions (role_code, permission_key)
select role_code, 'qa.review' from (values ('administrator'), ('supervisor'), ('qa_reviewer')) as r(role_code)
on conflict do nothing;

-- =====================================================================
-- 5. RPCs — public.call_center_qa_*
-- =====================================================================

-- Start-or-resume: returns the caller's existing in_progress review for
-- this (interaction, channel) if one exists, otherwise creates a new
-- one. agent_id is supplied by the caller (the API route re-validates
-- it against the caller's Agent Scope before ever reaching this RPC —
-- see api/admin.ts's qa resource branch) and stamped onto the review so
-- every subsequent read of this review carries its own scope without a
-- second lookup.
create or replace function public.call_center_qa_review_start(
  p_interaction_id text, p_channel text, p_agent_id text, p_reviewer_user_id uuid, p_now timestamptz
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_review call_center.qa_reviews;
begin
  select * into v_review from call_center.qa_reviews
    where interaction_id = p_interaction_id and channel = p_channel
      and reviewer_user_id = p_reviewer_user_id and status = 'in_progress';

  if v_review.id is null then
    insert into call_center.qa_reviews (interaction_id, channel, agent_id, reviewer_user_id, started_at)
      values (p_interaction_id, p_channel, p_agent_id, p_reviewer_user_id, p_now)
      returning * into v_review;
  end if;

  return to_jsonb(v_review);
end;
$$;

-- Full state for displaying/resuming a review: the review row plus
-- every turn_review and finding recorded so far.
create or replace function public.call_center_qa_review_get(p_review_id uuid)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_review jsonb; v_turns jsonb; v_findings jsonb;
begin
  select to_jsonb(r) into v_review from call_center.qa_reviews r where r.id = p_review_id;
  if v_review is null then
    return null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb) into v_turns
    from call_center.qa_turn_reviews t where t.review_id = p_review_id;

  select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at), '[]'::jsonb) into v_findings
    from call_center.qa_findings f where f.review_id = p_review_id;

  return v_review || jsonb_build_object('turnReviews', v_turns, 'findings', v_findings);
end;
$$;

-- One turn's review submission (Good+Next, Flag, or N/A), findings
-- included atomically. Replaces any prior findings this review had for
-- this exact turn_id (a reviewer revisiting a turn before final
-- submission overwrites their own earlier call on it, never
-- accumulates duplicates) — submitted reviews are immutable (checked
-- below), so this replace-on-write behavior only ever applies to an
-- in_progress review.
create or replace function public.call_center_qa_turn_submit(
  p_review_id uuid, p_turn_id text, p_role text, p_status text, p_findings jsonb, p_now timestamptz
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_status text;
  v_finding jsonb;
begin
  select status into v_status from call_center.qa_reviews where id = p_review_id;
  if v_status is null then
    raise exception 'qa_review_not_found';
  end if;
  if v_status = 'submitted' then
    raise exception 'qa_review_already_submitted';
  end if;

  insert into call_center.qa_turn_reviews (review_id, turn_id, role, status, reviewed_at)
    values (p_review_id, p_turn_id, p_role, p_status, p_now)
    on conflict (review_id, turn_id) do update set status = excluded.status, reviewed_at = excluded.reviewed_at, updated_at = p_now;

  delete from call_center.qa_findings where review_id = p_review_id and primary_turn_id = p_turn_id;

  if p_findings is not null then
    for v_finding in select * from jsonb_array_elements(p_findings) loop
      insert into call_center.qa_findings (
        review_id, parameter_code, value, primary_turn_id, evidence_turn_ids, reason_code, note, created_at
      ) values (
        p_review_id,
        v_finding->>'parameterCode',
        v_finding->>'value',
        p_turn_id,
        coalesce((select array_agg(x) from jsonb_array_elements_text(v_finding->'evidenceTurnIds') x), '{}'),
        v_finding->>'reasonCode',
        v_finding->>'note',
        p_now
      );
    end loop;
  end if;

  update call_center.qa_reviews set updated_at = p_now where id = p_review_id;

  return public.call_center_qa_review_get(p_review_id);
end;
$$;

-- Interaction-level conclusions (independent of turn review).
create or replace function public.call_center_qa_review_set_conclusions(
  p_review_id uuid, p_request_completion text, p_fcr text, p_human_assistance_required text,
  p_business_outcome text, p_reviewer_note text, p_now timestamptz
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_status text;
begin
  select status into v_status from call_center.qa_reviews where id = p_review_id;
  if v_status is null then
    raise exception 'qa_review_not_found';
  end if;
  if v_status = 'submitted' then
    raise exception 'qa_review_already_submitted';
  end if;

  update call_center.qa_reviews set
    request_completion = p_request_completion,
    fcr = p_fcr,
    human_assistance_required = p_human_assistance_required,
    business_outcome = p_business_outcome,
    reviewer_note = p_reviewer_note,
    updated_at = p_now
  where id = p_review_id;

  return public.call_center_qa_review_get(p_review_id);
end;
$$;

-- Submission — immutable afterward (brief §20: "Do not silently modify
-- it"). Completeness gate: every turn_review for this review must have
-- moved off 'not_reviewed' (an unreviewed turn blocks submission,
-- preventing exactly the "accidental submission of an incomplete
-- review" the brief names) — the caller is expected to have created a
-- qa_turn_reviews row for every reviewable turn up front (see
-- call_center_qa_review_init_turns below) so this count is meaningful.
create or replace function public.call_center_qa_review_submit(p_review_id uuid, p_now timestamptz)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_status text;
  v_unreviewed_count int;
begin
  select status into v_status from call_center.qa_reviews where id = p_review_id;
  if v_status is null then
    raise exception 'qa_review_not_found';
  end if;
  if v_status = 'submitted' then
    raise exception 'qa_review_already_submitted';
  end if;

  select count(*) into v_unreviewed_count from call_center.qa_turn_reviews
    where review_id = p_review_id and status = 'not_reviewed';
  if v_unreviewed_count > 0 then
    raise exception 'qa_review_incomplete: % turn(s) not yet reviewed', v_unreviewed_count;
  end if;

  update call_center.qa_reviews set status = 'submitted', submitted_at = p_now, updated_at = p_now
    where id = p_review_id;

  return public.call_center_qa_review_get(p_review_id);
end;
$$;

-- Initializes one NOT_REVIEWED row per reviewable turn the first time a
-- review is opened, so "N unreviewed remaining" (brief §17) and the
-- submission completeness gate above both have a real, known
-- denominator from the start rather than inferring it from the live
-- transcript fetch every time.
create or replace function public.call_center_qa_review_init_turns(
  p_review_id uuid, p_turns jsonb, p_now timestamptz
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_turn jsonb;
begin
  for v_turn in select * from jsonb_array_elements(p_turns) loop
    insert into call_center.qa_turn_reviews (review_id, turn_id, role, status)
      values (p_review_id, v_turn->>'turnId', v_turn->>'role', 'not_reviewed')
      on conflict (review_id, turn_id) do nothing;
  end loop;
  return public.call_center_qa_review_get(p_review_id);
end;
$$;

-- Review history for one interaction (QAReview.tsx list — "has this
-- call already been reviewed, by whom, what status").
create or replace function public.call_center_qa_review_list_for_interaction(
  p_interaction_id text, p_channel text
)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc), '[]'::jsonb)
    from call_center.qa_reviews r where r.interaction_id = p_interaction_id and r.channel = p_channel;
$$;

-- All findings across submitted reviews within Agent Scope, for Human
-- QA ratio calculation (src/lib/qaRatios.ts consumes this shape
-- directly). p_authorized_agent_ids/p_all_agents follow the same
-- Agent Scope predicate convention established in Session 14.3.
create or replace function public.call_center_qa_findings_list(
  p_authorized_agent_ids text[], p_all_agents boolean, p_limit int default 5000
)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb)
    from call_center.qa_findings f
    join call_center.qa_reviews r on r.id = f.review_id
    where r.status = 'submitted'
      and (p_all_agents or r.agent_id = any(p_authorized_agent_ids))
    limit p_limit;
$$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'call_center_qa_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
