-- Session 16.3 — Automated Qualitative Analysis, persistence foundation.
-- Parallel to, and structurally independent from, Human QA
-- (call_center.qa_reviews/qa_turn_reviews/qa_findings — Session 16.1).
-- Machine-generated observations must never appear human-authored
-- (brief §14) — separate tables, separate RPC namespace, separate
-- permissions. Same conventions as every prior session: uuid PK,
-- timestamptz audit columns, snake_case, plain text + check (not
-- enums), deny-all RLS, security definer RPCs under public.call_center_*,
-- grant execute to service_role only.

-- =====================================================================
-- 1. automated_qa_evaluations — one LLM evaluation run of one
--    interaction. Multiple evaluations of the same interaction are
--    allowed (brief §20 — reproducibility/history); each keeps its own
--    full provenance. A partial unique index blocks a second
--    queued/running evaluation of the same interaction from starting
--    concurrently (idempotent initiation, brief §13/§20) — it does NOT
--    block starting a brand-new evaluation once the prior one reached a
--    terminal state.
-- =====================================================================
create table if not exists call_center.automated_qa_evaluations (
  id uuid primary key default gen_random_uuid(),
  interaction_id text not null,
  channel text not null check (channel in ('voice', 'chat')),
  agent_id text not null,
  upstream_sid text,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'partial', 'failed')),
  initiated_by uuid not null references call_center.user_profiles(id),
  started_at timestamptz,
  completed_at timestamptz,
  model_id text,
  prompt_version text not null default 'v1',
  -- Pins the Measurement Contract version this evaluation was conducted
  -- under — same discipline as qa_reviews.contract_version, so a future
  -- contract revision never silently reinterprets a historical
  -- automated evaluation under a different definition.
  contract_version text not null default 'v1',
  schema_version text not null default 'v1',
  -- One request_id per LLM call; stored as a jsonb array since a long
  -- interaction may require multiple windowed calls (brief §12).
  request_ids jsonb not null default '[]',
  -- Immutable transcript snapshot (brief §11) — the exact ordered
  -- QaTurn[] this evaluation assessed, with the SAME turn ids Human QA
  -- would compute for the same transcript (src/lib/qaConversation.ts /
  -- qaTurnIdentity.ts, reused server-side — never a second id scheme).
  -- If the live transcript later changes, this evaluation stays bound
  -- to what it actually saw.
  transcript_snapshot jsonb not null,
  transcript_hash text not null,
  evaluated_turn_ids text[] not null default '{}',
  uncovered_turn_ids text[] not null default '{}',
  unassessable_parameters jsonb not null default '[]',
  evaluation_completeness text not null default 'COMPLETE' check (evaluation_completeness in ('COMPLETE', 'PARTIAL')),
  window_count int not null default 1,
  token_usage jsonb,
  latency_ms int,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists automated_qa_evaluations_one_inflight_per_interaction
  on call_center.automated_qa_evaluations (interaction_id, channel)
  where status in ('queued', 'running');

create index if not exists automated_qa_evaluations_interaction_idx on call_center.automated_qa_evaluations (interaction_id, channel);
create index if not exists automated_qa_evaluations_agent_idx on call_center.automated_qa_evaluations (agent_id);
create index if not exists automated_qa_evaluations_status_idx on call_center.automated_qa_evaluations (status, created_at desc);

-- =====================================================================
-- 2. automated_qa_observations — one LLM-produced quality observation.
--    Stores BOTH clean (value = a parameter's cleanValue, e.g. PASS)
--    and exception observations (brief §9: "do not store only
--    exceptions, otherwise automated denominators cannot be calculated
--    correctly") — no separate "is clean" flag needed; `value` alone
--    already carries that, exactly mirroring qa_findings' own shape.
--    parameter_code/value/reason_code vocabulary is validated at the
--    application layer against src/lib/qaParameters.ts — the SAME
--    canonical module Human QA uses, never a second copy (brief §8).
-- =====================================================================
create table if not exists call_center.automated_qa_observations (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references call_center.automated_qa_evaluations(id) on delete cascade,
  parameter_code text not null,
  value text not null,
  primary_turn_id text not null,
  evidence_turn_ids text[] not null default '{}',
  reason_code text,
  explanation text,
  created_at timestamptz not null default now()
);

create index if not exists automated_qa_observations_evaluation_idx on call_center.automated_qa_observations (evaluation_id);
create index if not exists automated_qa_observations_parameter_idx on call_center.automated_qa_observations (parameter_code);

alter table call_center.automated_qa_evaluations enable row level security;
alter table call_center.automated_qa_observations enable row level security;
-- Deny-all RLS (no policies) — every access path is through the
-- security definer RPCs below, same convention as every prior table.

-- =====================================================================
-- 3. Permission vocabulary. Per brief §19: "Do not automatically grant
--    automated-result access to every Human QA reviewer" — qa_reviewer
--    deliberately does NOT get either permission by default, mirroring
--    the same restrictive default already applied to qa.analytics.view
--    in Session 16.2.
-- =====================================================================
insert into call_center.permissions (key, label, description, pillar) values
  ('qa.automated.run', 'Run Automated QA', 'Initiate an Automated QA evaluation of a Call or Chat interaction via the Generic Local LLM, within Business Data Scope.', 'Improve'),
  ('qa.automated.view', 'View Automated QA Results', 'Inspect completed Automated QA evaluations, their observations, and provenance, within Business Data Scope.', 'Improve')
on conflict (key) do nothing;

insert into call_center.role_permissions (role_code, permission_key)
select role_code, permission_key from (
  values ('administrator', 'qa.automated.run'), ('administrator', 'qa.automated.view'),
         ('supervisor', 'qa.automated.run'), ('supervisor', 'qa.automated.view')
) as r(role_code, permission_key)
on conflict do nothing;

-- =====================================================================
-- 4. RPCs — public.call_center_automated_qa_*
-- =====================================================================

-- Idempotent create: if an evaluation is already queued/running for
-- this (interaction, channel), returns that existing row instead of
-- starting a second one (brief §13/§20 — idempotent initiation, no
-- duplicate writes from a repeated request).
create or replace function public.call_center_automated_qa_create(
  p_interaction_id text, p_channel text, p_agent_id text, p_upstream_sid text,
  p_initiated_by uuid, p_prompt_version text, p_contract_version text, p_schema_version text,
  p_transcript_snapshot jsonb, p_transcript_hash text, p_now timestamptz
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_existing call_center.automated_qa_evaluations;
  v_row call_center.automated_qa_evaluations;
begin
  select * into v_existing from call_center.automated_qa_evaluations
    where interaction_id = p_interaction_id and channel = p_channel and status in ('queued', 'running');
  if v_existing.id is not null then
    return to_jsonb(v_existing) || jsonb_build_object('alreadyInFlight', true);
  end if;

  insert into call_center.automated_qa_evaluations (
    interaction_id, channel, agent_id, upstream_sid, initiated_by,
    prompt_version, contract_version, schema_version,
    transcript_snapshot, transcript_hash, status, created_at, updated_at
  ) values (
    p_interaction_id, p_channel, p_agent_id, p_upstream_sid, p_initiated_by,
    p_prompt_version, p_contract_version, p_schema_version,
    p_transcript_snapshot, p_transcript_hash, 'queued', p_now, p_now
  ) returning * into v_row;

  return to_jsonb(v_row) || jsonb_build_object('alreadyInFlight', false);
end;
$$;

create or replace function public.call_center_automated_qa_set_running(p_evaluation_id uuid, p_now timestamptz)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  update call_center.automated_qa_evaluations
    set status = 'running', started_at = p_now, updated_at = p_now
    where id = p_evaluation_id and status = 'queued'
    returning to_jsonb(automated_qa_evaluations.*);
$$;

-- Atomic terminal-success write: persists every observation plus the
-- evaluation's final coverage/provenance fields in one transaction, so
-- a completed/partial evaluation is never readable half-written.
create or replace function public.call_center_automated_qa_complete(
  p_evaluation_id uuid, p_status text, p_model_id text, p_request_ids jsonb,
  p_evaluated_turn_ids text[], p_uncovered_turn_ids text[], p_unassessable_parameters jsonb,
  p_evaluation_completeness text, p_window_count int, p_token_usage jsonb, p_latency_ms int,
  p_observations jsonb, p_now timestamptz
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_obs jsonb;
begin
  if p_status not in ('completed', 'partial') then
    raise exception 'invalid_terminal_status: %', p_status;
  end if;

  delete from call_center.automated_qa_observations where evaluation_id = p_evaluation_id;

  if p_observations is not null then
    for v_obs in select * from jsonb_array_elements(p_observations) loop
      insert into call_center.automated_qa_observations (
        evaluation_id, parameter_code, value, primary_turn_id, evidence_turn_ids, reason_code, explanation, created_at
      ) values (
        p_evaluation_id,
        v_obs->>'parameterCode',
        v_obs->>'value',
        v_obs->>'primaryTurnId',
        coalesce((select array_agg(x) from jsonb_array_elements_text(v_obs->'evidenceTurnIds') x), '{}'),
        v_obs->>'reasonCode',
        v_obs->>'explanation',
        p_now
      );
    end loop;
  end if;

  update call_center.automated_qa_evaluations set
    status = p_status, model_id = p_model_id, request_ids = p_request_ids,
    evaluated_turn_ids = p_evaluated_turn_ids, uncovered_turn_ids = p_uncovered_turn_ids,
    unassessable_parameters = p_unassessable_parameters, evaluation_completeness = p_evaluation_completeness,
    window_count = p_window_count, token_usage = p_token_usage, latency_ms = p_latency_ms,
    completed_at = p_now, updated_at = p_now
    where id = p_evaluation_id;

  return public.call_center_automated_qa_get(p_evaluation_id);
end;
$$;

create or replace function public.call_center_automated_qa_fail(
  p_evaluation_id uuid, p_error_code text, p_error_message text, p_request_ids jsonb, p_now timestamptz
)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  update call_center.automated_qa_evaluations
    set status = 'failed', error_code = p_error_code, error_message = p_error_message,
        request_ids = p_request_ids, completed_at = p_now, updated_at = p_now
    where id = p_evaluation_id
    returning to_jsonb(automated_qa_evaluations.*);
$$;

create or replace function public.call_center_automated_qa_get(p_evaluation_id uuid)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_eval jsonb; v_obs jsonb;
begin
  select to_jsonb(e) into v_eval from call_center.automated_qa_evaluations e where e.id = p_evaluation_id;
  if v_eval is null then
    return null;
  end if;
  select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at), '[]'::jsonb) into v_obs
    from call_center.automated_qa_observations o where o.evaluation_id = p_evaluation_id;
  return v_eval || jsonb_build_object('observations', v_obs);
end;
$$;

create or replace function public.call_center_automated_qa_list_for_interaction(
  p_interaction_id text, p_channel text
)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb)
    from call_center.automated_qa_evaluations e
    where e.interaction_id = p_interaction_id and e.channel = p_channel;
$$;

-- Scoped browse list for the Automated QA Inspector landing surface —
-- same Agent Scope predicate convention as every other QA RPC.
create or replace function public.call_center_automated_qa_list(
  p_authorized_agent_ids text[], p_all_agents boolean, p_status text, p_limit int default 200
)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb)
    from call_center.automated_qa_evaluations e
    where (p_all_agents or e.agent_id = any(p_authorized_agent_ids))
      and (p_status is null or e.status = p_status)
    limit p_limit;
$$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'call_center_automated_qa_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
