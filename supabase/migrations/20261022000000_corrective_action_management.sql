-- Session 16.5 — Corrective Action Management (CAM).
--
-- A reusable, source-independent operational capability: ANY authorized
-- source -> create a Corrective Action -> investigation/assignment ->
-- resolution -> verification -> closure. A CA is valid with zero QA/call/
-- interaction reference (manual creation). QA (Automated + Human) is the
-- FIRST source integration, wired entirely at the API/adapter layer
-- (api/admin.ts + src/services/correctiveActions) — this schema has no
-- QA-specific column, FK, or RPC branch. Future sources (manual
-- operational reporting, complaints, Interaction Trace, Campaign Ops,
-- monitoring, agent admin, external integrations) reuse the exact same
-- `corrective_actions_create` RPC and generic `source_type`/
-- `source_reference_id`/`source_context` columns — no schema change
-- needed to add a new source.
--
-- Same conventions as every prior migration in this schema: uuid PK,
-- timestamptz audit columns, snake_case, plain text + check (not enums),
-- deny-all RLS (no policies — all access via security definer RPCs),
-- RPCs under public.call_center_corrective_actions_*, grant execute to
-- service_role only. Ownership-gate pattern copied from Session 15's
-- action_items (`p_actor_has_manage_any`, computed by the API layer from
-- the caller's resolved permission set, RE-VALIDATED here, never trusted
-- blindly).
--
-- NOT applied automatically per this session's brief (do not apply
-- migrations automatically). Prepared here for review and manual
-- application.

-- =====================================================================
-- 1. Tables
-- =====================================================================

-- Trigram search needs pg_trgm — same extension used elsewhere in this
-- project for text search; idempotent if already present. Must be
-- created before any table/index below that references gin_trgm_ops.
create extension if not exists pg_trgm;

create table if not exists call_center.corrective_action_groups (
  id uuid primary key default gen_random_uuid(),
  group_number bigint generated always as identity,
  title text not null,
  description text,
  -- Shared across every linked member CA (brief §4.2) — never copied
  -- into or overwriting an individual CA's own description/evidence.
  root_cause text,
  proposed_correction text,
  implemented_correction text,
  assigned_investigator uuid references call_center.user_profiles(id) on delete set null,
  assigned_fixer uuid references call_center.user_profiles(id) on delete set null,
  assigned_verifier uuid references call_center.user_profiles(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'pending_verification', 'closed', 'reopened', 'cancelled')),
  created_by uuid references call_center.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists call_center.corrective_actions (
  id uuid primary key default gen_random_uuid(),
  ca_number bigint generated always as identity,
  title text not null check (length(trim(title)) > 0),
  description text not null check (length(trim(description)) > 0),
  -- Business-rule vocabulary (plan default; adjustable centrally later,
  -- same "not an enum" convention as every other table in this schema).
  category text not null check (category in ('agent_behavior', 'knowledge_base', 'campaign_configuration', 'process', 'technical', 'other')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'pending_verification', 'closed', 'reopened', 'cancelled')),

  -- SOURCE INDEPENDENCE (brief §4.1). source_type identifies the origin
  -- without the CA domain depending on any source-specific field.
  -- source_reference_id is a plain, optional, un-FK'd pointer (a QA
  -- observation/finding id, a future interaction/campaign id, etc. —
  -- never required). source_context is small, bounded, structured
  -- metadata (NOT an unrestricted JSON dumping ground) — capped at 4000
  -- bytes, object-shaped only; deeper per-source-type validation lives
  -- in the API-layer adapter, not here.
  source_type text not null default 'manual' check (source_type in ('manual', 'automated_qa_observation', 'human_qa_finding')),
  source_reference_id text,
  source_context jsonb check (source_context is null or (jsonb_typeof(source_context) = 'object' and pg_column_size(source_context) <= 4000)),

  -- Snapshot, nullable, scope-enforcement dimension (same "no agent_id
  -- means visible to everyone scoped" rule as Session 15's action_items —
  -- a manually-created CA with no agent reference is not hidden from
  -- anyone by this dimension).
  agent_id text,

  created_by uuid references call_center.user_profiles(id) on delete set null,
  assigned_to uuid references call_center.user_profiles(id) on delete set null,
  verifier_id uuid references call_center.user_profiles(id) on delete set null,

  due_at timestamptz,
  resolved_at timestamptz,
  verified_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,

  resolution_summary text,
  verification_result text check (verification_result in ('passed', 'failed')),

  group_id uuid references call_center.corrective_action_groups(id) on delete set null,

  -- Idempotency (brief §6 — "avoid duplicate creation on repeated
  -- submissions"). A caller-supplied request identity; a repeated
  -- submission with the same key returns the already-created row
  -- instead of inserting a second one. Optional — manual UI creation
  -- without a pre-generated key is still fully supported.
  idempotency_key text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists corrective_actions_idempotency_key_idx
  on call_center.corrective_actions (idempotency_key) where idempotency_key is not null;
create index if not exists corrective_actions_status_created_idx on call_center.corrective_actions (status, created_at desc);
create index if not exists corrective_actions_assigned_to_idx on call_center.corrective_actions (assigned_to);
create index if not exists corrective_actions_group_idx on call_center.corrective_actions (group_id);
create index if not exists corrective_actions_agent_idx on call_center.corrective_actions (agent_id);
create index if not exists corrective_actions_source_idx on call_center.corrective_actions (source_type, source_reference_id);
-- Supports brief §8 "same text search across appropriate indexed
-- business fields" without a separate search-engine dependency.
create index if not exists corrective_actions_title_trgm_idx on call_center.corrective_actions using gin (title gin_trgm_ops);
create index if not exists corrective_actions_description_trgm_idx on call_center.corrective_actions using gin (description gin_trgm_ops);

-- One recorded verification per attempt, individually traceable even
-- under a bulk/common-test operation (brief §10B — "every selected CA
-- must receive its own recorded verification... closure event").
-- group_id here tags which common bulk-verification run (if any)
-- produced this row — purely informational, never a bypass of the
-- per-CA transition rule enforced in the RPCs below.
create table if not exists call_center.corrective_action_verifications (
  id uuid primary key default gen_random_uuid(),
  corrective_action_id uuid not null references call_center.corrective_actions(id) on delete cascade,
  group_id uuid references call_center.corrective_action_groups(id) on delete set null,
  verifier_id uuid references call_center.user_profiles(id) on delete set null,
  test_description text,
  result text not null check (result in ('passed', 'failed')),
  evidence_ref text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists corrective_action_verifications_ca_idx on call_center.corrective_action_verifications (corrective_action_id, created_at desc);

-- Append-only activity history (brief §4.3) — never updated/deleted by
-- any RPC below. Exactly one of corrective_action_id/group_id is
-- required to be non-null (a CA-level or a group-level event); both may
-- be set together for an event that is logged against a CA as a
-- consequence of a group-level operation (e.g. bulk verification),
-- preserving the "traceable relationship to affected individual CAs"
-- requirement (brief §4.3 final line) without a separate junction table.
create table if not exists call_center.corrective_action_activities (
  id uuid primary key default gen_random_uuid(),
  corrective_action_id uuid references call_center.corrective_actions(id) on delete cascade,
  group_id uuid references call_center.corrective_action_groups(id) on delete cascade,
  actor_user_id uuid references call_center.user_profiles(id) on delete set null,
  event_type text not null check (event_type in (
    'created', 'assigned', 'verifier_assigned', 'priority_changed', 'details_updated',
    'status_changed', 'linked', 'unlinked', 'investigation_note', 'root_cause_updated',
    'correction_recorded', 'verification_recorded', 'closed', 'reopened', 'cancelled',
    'group_created', 'group_updated', 'bulk_verification', 'bulk_closure'
  )),
  before_value jsonb,
  after_value jsonb,
  comment text,
  evidence_ref text,
  created_at timestamptz not null default now(),
  check (corrective_action_id is not null or group_id is not null)
);

create index if not exists corrective_action_activities_ca_idx on call_center.corrective_action_activities (corrective_action_id, created_at desc);
create index if not exists corrective_action_activities_group_idx on call_center.corrective_action_activities (group_id, created_at desc);

alter table call_center.corrective_action_groups enable row level security;
alter table call_center.corrective_actions enable row level security;
alter table call_center.corrective_action_verifications enable row level security;
alter table call_center.corrective_action_activities enable row level security;
-- Deny-all RLS (no policies) — every access path is through the
-- security definer RPCs below, same convention as every other table.

-- =====================================================================
-- 2. Permission vocabulary (additive to the 14.1 seed)
-- =====================================================================
insert into call_center.permissions (key, label, description, pillar) values
  ('corrective_actions.view', 'View Corrective Actions', 'View the Corrective Action register and detail, within Business Data Scope.', 'Improve'),
  ('corrective_actions.create', 'Create Corrective Actions', 'Create a Corrective Action manually or from a QA finding.', 'Improve'),
  ('corrective_actions.edit', 'Edit Corrective Actions', 'Edit a Corrective Action''s title/description/category/priority/due date.', 'Improve'),
  ('corrective_actions.assign', 'Assign Corrective Actions', 'Assign/reassign any in-scope Corrective Action or group, regardless of current ownership.', 'Improve'),
  ('corrective_actions.link', 'Link Corrective Action Groups', 'Create/update Corrective Action groups and link/unlink member CAs.', 'Improve'),
  ('corrective_actions.resolve', 'Record Corrective Action Correction', 'Record corrective work performed; take ownership of unassigned CAs.', 'Improve'),
  ('corrective_actions.verify', 'Verify Corrective Actions', 'Record verification outcomes and close eligible CAs (individually or in bulk).', 'Improve'),
  ('corrective_actions.reopen_cancel', 'Reopen/Cancel Corrective Actions', 'Reopen a closed Corrective Action, or cancel an open one with a reason.', 'Improve')
on conflict (key) do nothing;

insert into call_center.role_permissions (role_code, permission_key)
select 'administrator', key from call_center.permissions where key like 'corrective_actions.%'
on conflict do nothing;

insert into call_center.role_permissions (role_code, permission_key)
select 'supervisor', key from call_center.permissions where key like 'corrective_actions.%'
on conflict do nothing;

insert into call_center.role_permissions (role_code, permission_key) values
  ('operator', 'corrective_actions.view'), ('operator', 'corrective_actions.create'), ('operator', 'corrective_actions.resolve'),
  ('qa_reviewer', 'corrective_actions.view'), ('qa_reviewer', 'corrective_actions.create'),
  ('analyst', 'corrective_actions.view')
on conflict do nothing;

-- =====================================================================
-- 3. Helpers
-- =====================================================================

create or replace function public.call_center_corrective_actions_to_json(p_ca call_center.corrective_actions)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select jsonb_build_object(
    'id', p_ca.id,
    'caNumber', p_ca.ca_number,
    'title', p_ca.title,
    'description', p_ca.description,
    'category', p_ca.category,
    'priority', p_ca.priority,
    'status', p_ca.status,
    'sourceType', p_ca.source_type,
    'sourceReferenceId', p_ca.source_reference_id,
    'sourceContext', p_ca.source_context,
    'agentId', p_ca.agent_id,
    'createdBy', p_ca.created_by,
    'createdByName', (select coalesce(display_name, email) from call_center.user_profiles where id = p_ca.created_by),
    'assignedTo', p_ca.assigned_to,
    'assignedToName', (select coalesce(display_name, email) from call_center.user_profiles where id = p_ca.assigned_to),
    'verifierId', p_ca.verifier_id,
    'verifierName', (select coalesce(display_name, email) from call_center.user_profiles where id = p_ca.verifier_id),
    'dueAt', p_ca.due_at,
    'resolvedAt', p_ca.resolved_at,
    'verifiedAt', p_ca.verified_at,
    'closedAt', p_ca.closed_at,
    'cancelledAt', p_ca.cancelled_at,
    'cancelReason', p_ca.cancel_reason,
    'resolutionSummary', p_ca.resolution_summary,
    'verificationResult', p_ca.verification_result,
    'groupId', p_ca.group_id,
    'createdAt', p_ca.created_at,
    'updatedAt', p_ca.updated_at
  );
$$;

create or replace function public.call_center_corrective_action_groups_to_json(p_group call_center.corrective_action_groups)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select jsonb_build_object(
    'id', p_group.id,
    'groupNumber', p_group.group_number,
    'title', p_group.title,
    'description', p_group.description,
    'rootCause', p_group.root_cause,
    'proposedCorrection', p_group.proposed_correction,
    'implementedCorrection', p_group.implemented_correction,
    'assignedInvestigator', p_group.assigned_investigator,
    'assignedFixer', p_group.assigned_fixer,
    'assignedVerifier', p_group.assigned_verifier,
    'status', p_group.status,
    'createdBy', p_group.created_by,
    'createdAt', p_group.created_at,
    'updatedAt', p_group.updated_at
  );
$$;

-- Agent Scope predicate, identical in shape to Session 15's
-- action_items (no agent_id => visible to everyone scoped).
create or replace function public.call_center_corrective_action_in_scope(
  p_agent_id text, p_all_agents boolean, p_authorized_agent_ids text[]
) returns boolean language sql immutable as $$
  select p_all_agents or p_agent_id is null or p_agent_id = any(coalesce(p_authorized_agent_ids, array[]::text[]));
$$;

create or replace function public.call_center_corrective_actions_activity_log(
  p_corrective_action_id uuid, p_group_id uuid, p_actor_user_id uuid, p_event_type text,
  p_before jsonb, p_after jsonb, p_comment text, p_evidence_ref text
) returns void language plpgsql security definer set search_path = call_center, pg_temp as $$
begin
  insert into call_center.corrective_action_activities (
    corrective_action_id, group_id, actor_user_id, event_type, before_value, after_value, comment, evidence_ref
  ) values (
    p_corrective_action_id, p_group_id, p_actor_user_id, p_event_type, p_before, p_after, p_comment, p_evidence_ref
  );
end;
$$;

-- =====================================================================
-- 4. CA creation — the generic, source-independent service (brief §6)
-- =====================================================================

-- p_input: { title, description, category, priority?, agentId?,
--   sourceType?, sourceReferenceId?, sourceContext?, dueAt?, assignedTo? }
-- Actor/tenant identity is NEVER read from p_input — only from
-- p_actor_user_id, resolved server-side by the caller from the
-- authenticated session (brief §6 — "never trust a client-supplied
-- created_by"). Idempotent: a repeated call with the same
-- p_idempotency_key returns the existing row rather than inserting a
-- second one.
create or replace function public.call_center_corrective_actions_create(
  p_input jsonb, p_actor_user_id uuid, p_idempotency_key text,
  p_all_agents boolean, p_authorized_agent_ids text[]
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_existing call_center.corrective_actions;
  v_ca call_center.corrective_actions;
  v_title text := trim(coalesce(p_input->>'title', ''));
  v_description text := trim(coalesce(p_input->>'description', ''));
  v_category text := coalesce(p_input->>'category', 'other');
  v_priority text := coalesce(p_input->>'priority', 'medium');
  v_source_type text := coalesce(p_input->>'sourceType', 'manual');
  v_source_context jsonb := p_input->'sourceContext';
  v_agent_id text := nullif(p_input->>'agentId', '');
begin
  if p_idempotency_key is not null then
    select * into v_existing from call_center.corrective_actions where idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return public.call_center_corrective_actions_to_json(v_existing);
    end if;
  end if;

  if v_title = '' or v_description = '' then
    raise exception 'title_and_description_required';
  end if;

  -- Business Data Scope isolation AT CREATION (brief §15 — "enforce
  -- tenant isolation in all reads and writes"). Without this check, a
  -- scope-restricted actor could create a CA attributed to an
  -- out-of-scope agent_id and, as its owner (created_by), gain durable
  -- mutation rights over it for the rest of its lifecycle — the
  -- ownership gate used by every other mutating RPC does not itself
  -- consider agent scope.
  if v_agent_id is not null and not public.call_center_corrective_action_in_scope(v_agent_id, p_all_agents, p_authorized_agent_ids) then
    raise exception 'agent_out_of_scope';
  end if;

  -- ON CONFLICT DO NOTHING + fallback select, rather than
  -- select-then-insert: closes the race where two concurrent requests
  -- carrying the same idempotency key both pass the earlier existence
  -- check and both attempt to insert — with the prior select-then-insert
  -- shape, the loser would raise a raw unique_violation instead of
  -- calmly returning the winner's row.
  insert into call_center.corrective_actions (
    title, description, category, priority, source_type, source_reference_id, source_context,
    agent_id, created_by, assigned_to, due_at, idempotency_key
  ) values (
    v_title, v_description, v_category, v_priority, v_source_type,
    nullif(p_input->>'sourceReferenceId', ''), v_source_context,
    v_agent_id, p_actor_user_id,
    case when coalesce(p_input->>'assignedTo', '') = '' then null else (p_input->>'assignedTo')::uuid end,
    case when coalesce(p_input->>'dueAt', '') = '' then null else (p_input->>'dueAt')::timestamptz end,
    p_idempotency_key
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning * into v_ca;

  if v_ca is null then
    -- Lost the race (or, in practice, hit the earlier select-hit path
    -- above) — the winning row is the correct response either way.
    select * into v_ca from call_center.corrective_actions where idempotency_key = p_idempotency_key;
    return public.call_center_corrective_actions_to_json(v_ca);
  end if;

  perform public.call_center_corrective_actions_activity_log(
    v_ca.id, null, p_actor_user_id, 'created', null,
    jsonb_build_object('status', v_ca.status, 'sourceType', v_ca.source_type), null, null
  );

  perform call_center.audit_events_insert_helper(
    'user', p_actor_user_id, 'corrective_action.created', 'corrective_action', v_ca.id::text, 'success',
    jsonb_build_object('sourceType', v_ca.source_type, 'category', v_ca.category, 'priority', v_ca.priority)
  );

  return public.call_center_corrective_actions_to_json(v_ca);
end;
$$;

-- =====================================================================
-- 5. List / get / discover
-- =====================================================================

create or replace function public.call_center_corrective_actions_list(
  p_status text, p_priority text, p_category text, p_source_type text,
  p_assigned_to uuid, p_agent_id text, p_group_id uuid, p_search text,
  p_all_agents boolean, p_authorized_agent_ids text[], p_limit int, p_offset int
) returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(public.call_center_corrective_actions_to_json(ca) order by ca.created_at desc), '[]'::jsonb)
  from (
    select * from call_center.corrective_actions ca
    where (p_status is null or ca.status = p_status)
      and (p_priority is null or ca.priority = p_priority)
      and (p_category is null or ca.category = p_category)
      and (p_source_type is null or ca.source_type = p_source_type)
      and (p_assigned_to is null or ca.assigned_to = p_assigned_to)
      and (p_agent_id is null or ca.agent_id = p_agent_id)
      and (p_group_id is null or ca.group_id = p_group_id)
      and (p_search is null or ca.title ilike '%' || p_search || '%' or ca.description ilike '%' || p_search || '%' or ca.ca_number::text = p_search)
      and public.call_center_corrective_action_in_scope(ca.agent_id, p_all_agents, p_authorized_agent_ids)
    order by ca.created_at desc
    limit coalesce(p_limit, 100) offset coalesce(p_offset, 0)
  ) ca;
$$;

create or replace function public.call_center_corrective_actions_get(
  p_id uuid, p_all_agents boolean, p_authorized_agent_ids text[]
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_ca call_center.corrective_actions;
begin
  select * into v_ca from call_center.corrective_actions where id = p_id;
  if v_ca is null then
    return null;
  end if;
  if not public.call_center_corrective_action_in_scope(v_ca.agent_id, p_all_agents, p_authorized_agent_ids) then
    return null;
  end if;
  return public.call_center_corrective_actions_to_json(v_ca);
end;
$$;

-- Discovery (brief §8) — a search/filter mechanism only, never an
-- automatic assertion of shared root cause. Matches by same agent and/or
-- same category and/or same QA parameter code (read from source_context
-- if present), excluding the CA itself and anything already grouped.
create or replace function public.call_center_corrective_actions_candidates(
  p_exclude_id uuid, p_agent_id text, p_category text, p_parameter_code text,
  p_all_agents boolean, p_authorized_agent_ids text[], p_limit int
) returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(public.call_center_corrective_actions_to_json(ca) order by ca.created_at desc), '[]'::jsonb)
  from (
    select * from call_center.corrective_actions ca
    where ca.id <> p_exclude_id
      and ca.group_id is null
      and (
        (p_agent_id is not null and ca.agent_id = p_agent_id)
        or (p_category is not null and ca.category = p_category)
        or (p_parameter_code is not null and ca.source_context->>'parameterCode' = p_parameter_code)
      )
      and public.call_center_corrective_action_in_scope(ca.agent_id, p_all_agents, p_authorized_agent_ids)
    order by ca.created_at desc
    limit coalesce(p_limit, 20)
  ) ca;
$$;

-- =====================================================================
-- 6. Edit / assign / status transitions
-- =====================================================================

-- Ownership gate shared by every mutating RPC below (brief §15 + the
-- Session 15 precedent): p_actor_has_manage_any is the caller's
-- `corrective_actions.assign` permission, computed by the API layer and
-- RE-VALIDATED here (never trusted blindly, consistent with every prior
-- security-definer RPC in this schema).
create or replace function public.call_center_corrective_action_owns(
  p_created_by uuid, p_assigned_to uuid, p_actor_user_id uuid, p_actor_has_manage_any boolean
) returns boolean language sql immutable as $$
  -- coalesce(..., false) is load-bearing, not decorative: when the CA is
  -- unassigned (p_assigned_to is null), `p_assigned_to = p_actor_user_id`
  -- evaluates to SQL NULL, not false, so `false OR false OR NULL` is
  -- NULL — and plpgsql's `if not owns(...) then raise ...` treats a NULL
  -- condition as falsy (skips the branch) rather than erroring, which
  -- silently let an unrelated, non-manage-any actor edit/resolve/transition
  -- any UNASSIGNED CA. Caught by this session's own acceptance test
  -- before activation — see corrective_actions_acceptance_test.sql §I.
  select coalesce(p_actor_has_manage_any or p_created_by = p_actor_user_id or p_assigned_to = p_actor_user_id, false);
$$;

create or replace function public.call_center_corrective_actions_update(
  p_id uuid, p_patch jsonb, p_actor_user_id uuid, p_actor_has_manage_any boolean,
  p_all_agents boolean, p_authorized_agent_ids text[]
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_ca call_center.corrective_actions; v_before jsonb; v_after jsonb;
begin
  select * into v_ca from call_center.corrective_actions where id = p_id for update;
  if v_ca is null then raise exception 'corrective_action_not_found'; end if;
  -- Scope check BEFORE ownership (and reported identically to "not
  -- found", not a distinct 403) so an out-of-scope CA's existence is
  -- never revealed to a caller who cannot see it via list/get either.
  if not public.call_center_corrective_action_in_scope(v_ca.agent_id, p_all_agents, p_authorized_agent_ids) then
    raise exception 'corrective_action_not_found';
  end if;
  if not public.call_center_corrective_action_owns(v_ca.created_by, v_ca.assigned_to, p_actor_user_id, p_actor_has_manage_any) then
    raise exception 'ownership_required';
  end if;

  v_before := jsonb_build_object('title', v_ca.title, 'description', v_ca.description, 'category', v_ca.category, 'priority', v_ca.priority, 'dueAt', v_ca.due_at);

  update call_center.corrective_actions set
    title = coalesce(nullif(trim(p_patch->>'title'), ''), title),
    description = coalesce(nullif(trim(p_patch->>'description'), ''), description),
    category = coalesce(p_patch->>'category', category),
    priority = coalesce(p_patch->>'priority', priority),
    due_at = case when p_patch ? 'dueAt' then (case when coalesce(p_patch->>'dueAt', '') = '' then null else (p_patch->>'dueAt')::timestamptz end) else due_at end,
    updated_at = now()
  where id = p_id
  returning * into v_ca;

  v_after := jsonb_build_object('title', v_ca.title, 'description', v_ca.description, 'category', v_ca.category, 'priority', v_ca.priority, 'dueAt', v_ca.due_at);

  perform public.call_center_corrective_actions_activity_log(
    p_id, null, p_actor_user_id,
    case when v_before->>'priority' is distinct from v_after->>'priority' then 'priority_changed' else 'details_updated' end,
    v_before, v_after, null, null
  );

  return public.call_center_corrective_actions_to_json(v_ca);
end;
$$;

-- Eligible people (assignee OR verifier — same eligibility criteria:
-- active + in Agent Scope). Mirrors Session 15's
-- call_center_action_items_eligible_assignees exactly.
create or replace function public.call_center_corrective_actions_eligible_people(p_id uuid)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_ca call_center.corrective_actions;
begin
  select * into v_ca from call_center.corrective_actions where id = p_id;
  if v_ca is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'email', p.email, 'displayName', p.display_name) order by coalesce(p.display_name, p.email))
    from call_center.user_profiles p
    where p.status = 'active'
      and exists (
        select 1 from call_center.user_roles ur
        where ur.user_id = p.id
          and (
            v_ca.agent_id is null
            or exists (select 1 from call_center.role_agent_scope ras where ras.role_code = ur.role_code and ras.all_agents)
            or exists (select 1 from call_center.role_agent_scope_items rasi where rasi.role_code = ur.role_code and rasi.agent_id = v_ca.agent_id)
          )
      )
  ), '[]'::jsonb);
end;
$$;

-- p_role: 'assignee' | 'verifier'. Re-validates eligibility against the
-- SAME function the picker UI calls, inside the same transaction as the
-- update — closes the direct-write-bypass class of bug from day one.
create or replace function public.call_center_corrective_actions_assign(
  p_id uuid, p_role text, p_person_user_id uuid, p_actor_user_id uuid, p_actor_has_manage_any boolean,
  p_all_agents boolean, p_authorized_agent_ids text[]
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_ca call_center.corrective_actions;
  v_person call_center.user_profiles;
  v_eligible jsonb;
  v_previous uuid;
begin
  if p_role not in ('assignee', 'verifier') then
    raise exception 'invalid_role';
  end if;

  select * into v_ca from call_center.corrective_actions where id = p_id for update;
  if v_ca is null then raise exception 'corrective_action_not_found'; end if;
  if not public.call_center_corrective_action_in_scope(v_ca.agent_id, p_all_agents, p_authorized_agent_ids) then
    raise exception 'corrective_action_not_found';
  end if;

  v_previous := case when p_role = 'assignee' then v_ca.assigned_to else v_ca.verifier_id end;

  -- Manage-any can (re)assign to anyone. Otherwise, a holder of the
  -- relevant permission may only take ownership of a currently-UNASSIGNED
  -- slot for themselves (self-assign), never assign to someone else or
  -- reassign an already-owned slot.
  if not p_actor_has_manage_any and not (p_person_user_id = p_actor_user_id and v_previous is null) then
    raise exception 'assignment_not_permitted';
  end if;

  select * into v_person from call_center.user_profiles where id = p_person_user_id;
  if v_person is null or v_person.status <> 'active' then
    raise exception 'assignee_inactive_or_not_found';
  end if;

  select public.call_center_corrective_actions_eligible_people(p_id) into v_eligible;
  if not exists (select 1 from jsonb_array_elements(v_eligible) e where (e->>'id')::uuid = p_person_user_id) then
    raise exception 'assignee_out_of_scope';
  end if;

  if p_role = 'assignee' then
    update call_center.corrective_actions set assigned_to = p_person_user_id, updated_at = now() where id = p_id;
  else
    update call_center.corrective_actions set verifier_id = p_person_user_id, updated_at = now() where id = p_id;
  end if;

  perform public.call_center_corrective_actions_activity_log(
    p_id, null, p_actor_user_id, case when p_role = 'assignee' then 'assigned' else 'verifier_assigned' end,
    jsonb_build_object('previous', v_previous), jsonb_build_object('current', p_person_user_id), null, null
  );

  perform call_center.audit_events_insert_helper(
    'user', p_actor_user_id,
    case when p_role = 'assignee' then (case when v_previous is null then 'corrective_action.assigned' else 'corrective_action.reassigned' end)
         else 'corrective_action.verifier_assigned' end,
    'corrective_action', p_id::text, 'success', jsonb_build_object('role', p_role, 'previous', v_previous, 'current', p_person_user_id)
  );

  return public.call_center_corrective_actions_get(p_id, true, array[]::text[]);
end;
$$;

-- Centrally-defined, server-enforced transition table (brief §5 — "do
-- not rely on disabled UI buttons for integrity"). Closure-to-'closed'
-- here is the explicit ADMINISTRATIVE disposition path (requires
-- manage-any + a reason) — ordinary verified closure goes through
-- record_verification/bulk_verify below instead, which requires an
-- actual recorded test result.
create or replace function public.call_center_corrective_action_transition_allowed(p_from text, p_to text)
returns boolean language sql immutable as $$
  select (p_from, p_to) in (
    ('open', 'in_progress'), ('open', 'cancelled'),
    ('in_progress', 'pending_verification'), ('in_progress', 'cancelled'),
    ('pending_verification', 'in_progress'), ('pending_verification', 'cancelled'), ('pending_verification', 'closed'),
    ('closed', 'reopened'),
    ('reopened', 'in_progress'), ('reopened', 'cancelled')
  );
$$;

create or replace function public.call_center_corrective_actions_set_status(
  p_id uuid, p_status text, p_actor_user_id uuid, p_actor_has_manage_any boolean, p_reason text,
  p_all_agents boolean, p_authorized_agent_ids text[]
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_ca call_center.corrective_actions;
begin
  select * into v_ca from call_center.corrective_actions where id = p_id for update;
  if v_ca is null then raise exception 'corrective_action_not_found'; end if;
  if not public.call_center_corrective_action_in_scope(v_ca.agent_id, p_all_agents, p_authorized_agent_ids) then
    raise exception 'corrective_action_not_found';
  end if;

  if not public.call_center_corrective_action_transition_allowed(v_ca.status, p_status) then
    raise exception 'invalid_status_transition';
  end if;

  if p_status = 'cancelled' and coalesce(trim(p_reason), '') = '' then
    raise exception 'cancellation_reason_required';
  end if;

  if p_status = 'closed' then
    -- Administrative disposition only — requires manage-any AND a reason
    -- (brief §5 — "closure must carry verification evidence OR an
    -- explicit authorized administrative disposition").
    if not p_actor_has_manage_any then raise exception 'ownership_required'; end if;
    if coalesce(trim(p_reason), '') = '' then raise exception 'administrative_closure_reason_required'; end if;
  elsif p_status = 'reopened' then
    if not public.call_center_corrective_action_owns(v_ca.created_by, v_ca.assigned_to, p_actor_user_id, p_actor_has_manage_any) then
      raise exception 'ownership_required';
    end if;
  else
    if not public.call_center_corrective_action_owns(v_ca.created_by, v_ca.assigned_to, p_actor_user_id, p_actor_has_manage_any) then
      raise exception 'ownership_required';
    end if;
  end if;

  update call_center.corrective_actions set
    status = p_status,
    cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
    cancel_reason = case when p_status = 'cancelled' then p_reason else cancel_reason end,
    closed_at = case when p_status = 'closed' then now() else closed_at end,
    updated_at = now()
  where id = p_id;

  perform public.call_center_corrective_actions_activity_log(
    p_id, null, p_actor_user_id,
    case p_status when 'cancelled' then 'cancelled' when 'reopened' then 'reopened' when 'closed' then 'closed' else 'status_changed' end,
    jsonb_build_object('status', v_ca.status), jsonb_build_object('status', p_status), p_reason, null
  );

  perform call_center.audit_events_insert_helper(
    'user', p_actor_user_id, 'corrective_action.status_changed', 'corrective_action', p_id::text, 'success',
    jsonb_build_object('from', v_ca.status, 'to', p_status, 'reason', p_reason)
  );

  return public.call_center_corrective_actions_get(p_id, true, array[]::text[]);
end;
$$;

-- Resolution: a record of work performed. Does NOT change status on its
-- own (brief §10A). Gated by ownership (manage-any OR assigned_to=actor).
create or replace function public.call_center_corrective_actions_record_correction(
  p_id uuid, p_resolution_summary text, p_actor_user_id uuid, p_actor_has_manage_any boolean,
  p_all_agents boolean, p_authorized_agent_ids text[]
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_ca call_center.corrective_actions;
begin
  select * into v_ca from call_center.corrective_actions where id = p_id for update;
  if v_ca is null then raise exception 'corrective_action_not_found'; end if;
  if not public.call_center_corrective_action_in_scope(v_ca.agent_id, p_all_agents, p_authorized_agent_ids) then
    raise exception 'corrective_action_not_found';
  end if;
  if not public.call_center_corrective_action_owns(v_ca.created_by, v_ca.assigned_to, p_actor_user_id, p_actor_has_manage_any) then
    raise exception 'ownership_required';
  end if;
  if coalesce(trim(p_resolution_summary), '') = '' then
    raise exception 'resolution_summary_required';
  end if;

  update call_center.corrective_actions set
    resolution_summary = p_resolution_summary,
    resolved_at = coalesce(resolved_at, now()),
    updated_at = now()
  where id = p_id;

  perform public.call_center_corrective_actions_activity_log(
    p_id, null, p_actor_user_id, 'correction_recorded', null, jsonb_build_object('resolutionSummary', p_resolution_summary), null, null
  );

  perform call_center.audit_events_insert_helper(
    'user', p_actor_user_id, 'corrective_action.correction_recorded', 'corrective_action', p_id::text, 'success', '{}'::jsonb
  );

  return public.call_center_corrective_actions_get(p_id, true, array[]::text[]);
end;
$$;

-- =====================================================================
-- 7. Verification (single + bulk) — one shared internal code path so
--    bulk can never diverge from single-item behaviour (brief §10B —
--    "do not allow a group status change to bypass individual CA
--    transition rules").
-- =====================================================================

create or replace function public.call_center_corrective_action_verify_one(
  p_id uuid, p_result text, p_test_description text, p_evidence_ref text, p_notes text,
  p_actor_user_id uuid, p_actor_has_manage_any boolean, p_group_id uuid,
  p_all_agents boolean, p_authorized_agent_ids text[]
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_ca call_center.corrective_actions;
begin
  if p_result not in ('passed', 'failed') then
    raise exception 'invalid_verification_result';
  end if;

  select * into v_ca from call_center.corrective_actions where id = p_id for update;
  if v_ca is null then raise exception 'corrective_action_not_found'; end if;
  if not public.call_center_corrective_action_in_scope(v_ca.agent_id, p_all_agents, p_authorized_agent_ids) then
    raise exception 'corrective_action_not_found';
  end if;

  if v_ca.status not in ('pending_verification', 'in_progress') then
    raise exception 'not_eligible_for_verification';
  end if;

  -- Verifier eligibility: manage-any, OR already the designated
  -- verifier, OR the slot is unassigned (self-assign-as-verifier,
  -- mirroring the take-ownership rule used for assignment).
  if not (p_actor_has_manage_any or v_ca.verifier_id = p_actor_user_id or v_ca.verifier_id is null) then
    raise exception 'ownership_required';
  end if;

  insert into call_center.corrective_action_verifications (
    corrective_action_id, group_id, verifier_id, test_description, result, evidence_ref, notes
  ) values (p_id, p_group_id, p_actor_user_id, p_test_description, p_result, p_evidence_ref, p_notes);

  update call_center.corrective_actions set
    verifier_id = coalesce(verifier_id, p_actor_user_id),
    verification_result = p_result,
    verified_at = now(),
    -- A failed verification NEVER closes the CA (brief §10B). It stays
    -- exactly where it was so a human decides the next step (typically
    -- sending it back to in_progress via set_status).
    status = case when p_result = 'passed' then 'closed' else v_ca.status end,
    closed_at = case when p_result = 'passed' then now() else closed_at end,
    updated_at = now()
  where id = p_id;

  perform public.call_center_corrective_actions_activity_log(
    p_id, p_group_id, p_actor_user_id, 'verification_recorded', jsonb_build_object('status', v_ca.status),
    jsonb_build_object('result', p_result), p_notes, p_evidence_ref
  );
  if p_result = 'passed' then
    perform public.call_center_corrective_actions_activity_log(
      p_id, p_group_id, p_actor_user_id, 'closed', jsonb_build_object('status', v_ca.status), jsonb_build_object('status', 'closed'), null, null
    );
  end if;

  perform call_center.audit_events_insert_helper(
    'user', p_actor_user_id, 'corrective_action.verification_recorded', 'corrective_action', p_id::text, 'success',
    jsonb_build_object('result', p_result, 'groupId', p_group_id)
  );

  return public.call_center_corrective_actions_get(p_id, true, array[]::text[]);
end;
$$;

create or replace function public.call_center_corrective_actions_record_verification(
  p_id uuid, p_result text, p_test_description text, p_evidence_ref text, p_notes text,
  p_actor_user_id uuid, p_actor_has_manage_any boolean,
  p_all_agents boolean, p_authorized_agent_ids text[]
) returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select public.call_center_corrective_action_verify_one(p_id, p_result, p_test_description, p_evidence_ref, p_notes, p_actor_user_id, p_actor_has_manage_any, null, p_all_agents, p_authorized_agent_ids);
$$;

-- Each selected id is independently re-validated and re-processed
-- through the exact same single-item function — a common test result
-- may support closing several CAs, but every CA still receives its own
-- verification row, its own closure (or non-closure), and its own
-- activity events. Ineligible/out-of-scope ids are reported, never
-- silently skipped or silently forced through.
create or replace function public.call_center_corrective_actions_bulk_verify(
  p_ids uuid[], p_result text, p_test_description text, p_evidence_ref text, p_notes text,
  p_actor_user_id uuid, p_actor_has_manage_any boolean, p_group_id uuid,
  p_all_agents boolean, p_authorized_agent_ids text[]
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_id uuid;
  v_ca call_center.corrective_actions;
  v_results jsonb := '[]'::jsonb;
  v_succeeded int := 0;
  v_failed int := 0;
begin
  foreach v_id in array coalesce(p_ids, array[]::uuid[])
  loop
    select * into v_ca from call_center.corrective_actions where id = v_id;
    if v_ca is null or not public.call_center_corrective_action_in_scope(v_ca.agent_id, p_all_agents, p_authorized_agent_ids) then
      v_results := v_results || jsonb_build_object('id', v_id, 'success', false, 'error', 'corrective_action_not_found');
      v_failed := v_failed + 1;
      continue;
    end if;

    begin
      perform public.call_center_corrective_action_verify_one(
        v_id, p_result, p_test_description, p_evidence_ref, p_notes, p_actor_user_id, p_actor_has_manage_any, p_group_id,
        p_all_agents, p_authorized_agent_ids
      );
      v_results := v_results || jsonb_build_object('id', v_id, 'success', true);
      v_succeeded := v_succeeded + 1;
    exception when others then
      v_results := v_results || jsonb_build_object('id', v_id, 'success', false, 'error', sqlerrm);
      v_failed := v_failed + 1;
    end;
  end loop;

  perform call_center.audit_events_insert_helper(
    'user', p_actor_user_id, 'corrective_action.bulk_verification', 'corrective_action', null, 'success',
    jsonb_build_object('result', p_result, 'succeeded', v_succeeded, 'failed', v_failed, 'groupId', p_group_id)
  );

  return jsonb_build_object('results', v_results, 'succeeded', v_succeeded, 'failed', v_failed);
end;
$$;

-- =====================================================================
-- 8. Activity history (read-only)
-- =====================================================================

create or replace function public.call_center_corrective_actions_activity(p_corrective_action_id uuid, p_group_id uuid)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'correctiveActionId', a.corrective_action_id, 'groupId', a.group_id,
    'actorUserId', a.actor_user_id,
    'actorName', (select coalesce(display_name, email) from call_center.user_profiles where id = a.actor_user_id),
    'eventType', a.event_type, 'beforeValue', a.before_value, 'afterValue', a.after_value,
    'comment', a.comment, 'evidenceRef', a.evidence_ref, 'createdAt', a.created_at
  ) order by a.created_at asc), '[]'::jsonb)
  from call_center.corrective_action_activities a
  where (p_corrective_action_id is not null and a.corrective_action_id = p_corrective_action_id)
     or (p_group_id is not null and a.group_id = p_group_id);
$$;

-- =====================================================================
-- 9. Group management
-- =====================================================================

create or replace function public.call_center_corrective_action_groups_create(
  p_title text, p_description text, p_actor_user_id uuid
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_group call_center.corrective_action_groups;
begin
  if coalesce(trim(p_title), '') = '' then raise exception 'title_required'; end if;
  insert into call_center.corrective_action_groups (title, description, created_by)
  values (trim(p_title), p_description, p_actor_user_id)
  returning * into v_group;

  perform public.call_center_corrective_actions_activity_log(null, v_group.id, p_actor_user_id, 'group_created', null, jsonb_build_object('title', v_group.title), null, null);
  perform call_center.audit_events_insert_helper('user', p_actor_user_id, 'corrective_action_group.created', 'corrective_action_group', v_group.id::text, 'success', '{}'::jsonb);

  return public.call_center_corrective_action_groups_to_json(v_group);
end;
$$;

create or replace function public.call_center_corrective_action_groups_get(p_id uuid)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select public.call_center_corrective_action_groups_to_json(g) from call_center.corrective_action_groups g where g.id = p_id;
$$;

create or replace function public.call_center_corrective_action_groups_list(p_status text, p_limit int, p_offset int)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(public.call_center_corrective_action_groups_to_json(g) order by g.created_at desc), '[]'::jsonb)
  from (
    select * from call_center.corrective_action_groups g
    where p_status is null or g.status = p_status
    order by g.created_at desc
    limit coalesce(p_limit, 100) offset coalesce(p_offset, 0)
  ) g;
$$;

-- Scope-filtered member list (brief §9.8 — "review all linked member
-- CAs"), same predicate as the main list RPC.
create or replace function public.call_center_corrective_action_groups_members(
  p_group_id uuid, p_all_agents boolean, p_authorized_agent_ids text[]
) returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(public.call_center_corrective_actions_to_json(ca) order by ca.created_at asc), '[]'::jsonb)
  from call_center.corrective_actions ca
  where ca.group_id = p_group_id
    and public.call_center_corrective_action_in_scope(ca.agent_id, p_all_agents, p_authorized_agent_ids);
$$;

create or replace function public.call_center_corrective_action_groups_update(
  p_id uuid, p_patch jsonb, p_actor_user_id uuid, p_actor_has_manage_any boolean
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_group call_center.corrective_action_groups; v_before jsonb; v_after jsonb;
begin
  select * into v_group from call_center.corrective_action_groups where id = p_id for update;
  if v_group is null then raise exception 'corrective_action_group_not_found'; end if;
  -- corrective_actions.link is the floor permission for all group
  -- mutation (checked by the API layer); no per-group ownership gate
  -- beyond that — groups are a cross-cutting management surface, not a
  -- single-owner resource.

  v_before := jsonb_build_object(
    'title', v_group.title, 'description', v_group.description, 'rootCause', v_group.root_cause,
    'proposedCorrection', v_group.proposed_correction, 'implementedCorrection', v_group.implemented_correction,
    'assignedInvestigator', v_group.assigned_investigator, 'assignedFixer', v_group.assigned_fixer,
    'assignedVerifier', v_group.assigned_verifier, 'status', v_group.status
  );

  update call_center.corrective_action_groups set
    title = coalesce(nullif(trim(p_patch->>'title'), ''), title),
    description = coalesce(p_patch->>'description', description),
    root_cause = coalesce(p_patch->>'rootCause', root_cause),
    proposed_correction = coalesce(p_patch->>'proposedCorrection', proposed_correction),
    implemented_correction = coalesce(p_patch->>'implementedCorrection', implemented_correction),
    assigned_investigator = case when p_patch ? 'assignedInvestigator' then nullif(p_patch->>'assignedInvestigator', '')::uuid else assigned_investigator end,
    assigned_fixer = case when p_patch ? 'assignedFixer' then nullif(p_patch->>'assignedFixer', '')::uuid else assigned_fixer end,
    assigned_verifier = case when p_patch ? 'assignedVerifier' then nullif(p_patch->>'assignedVerifier', '')::uuid else assigned_verifier end,
    status = coalesce(p_patch->>'status', status),
    updated_at = now()
  where id = p_id
  returning * into v_group;

  v_after := jsonb_build_object(
    'title', v_group.title, 'description', v_group.description, 'rootCause', v_group.root_cause,
    'proposedCorrection', v_group.proposed_correction, 'implementedCorrection', v_group.implemented_correction,
    'assignedInvestigator', v_group.assigned_investigator, 'assignedFixer', v_group.assigned_fixer,
    'assignedVerifier', v_group.assigned_verifier, 'status', v_group.status
  );

  perform public.call_center_corrective_actions_activity_log(null, p_id, p_actor_user_id, 'group_updated', v_before, v_after, null, null);

  return public.call_center_corrective_action_groups_to_json(v_group);
end;
$$;

-- Transactional link (brief §9 — validated fully before anything is
-- written; if ANY id fails validation, nothing is linked). Enforces
-- "one CA may belong to at most one active CA group" and cross-tenant
-- (Business Data Scope) rejection.
create or replace function public.call_center_corrective_action_groups_link(
  p_group_id uuid, p_ca_ids uuid[], p_actor_user_id uuid,
  p_all_agents boolean, p_authorized_agent_ids text[]
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_group call_center.corrective_action_groups;
  v_id uuid;
  v_ca call_center.corrective_actions;
begin
  select * into v_group from call_center.corrective_action_groups where id = p_group_id for update;
  if v_group is null then raise exception 'corrective_action_group_not_found'; end if;

  -- Validate every id BEFORE writing any of them (true transactionality
  -- — the whole call aborts together with a specific reason if any id
  -- is invalid).
  foreach v_id in array coalesce(p_ca_ids, array[]::uuid[])
  loop
    select * into v_ca from call_center.corrective_actions where id = v_id;
    if v_ca is null then raise exception 'corrective_action_not_found: %', v_id; end if;
    if not public.call_center_corrective_action_in_scope(v_ca.agent_id, p_all_agents, p_authorized_agent_ids) then
      raise exception 'cross_tenant_link_rejected: %', v_id;
    end if;
    if v_ca.group_id is not null and v_ca.group_id <> p_group_id then
      raise exception 'already_in_another_group: %', v_id;
    end if;
  end loop;

  foreach v_id in array coalesce(p_ca_ids, array[]::uuid[])
  loop
    update call_center.corrective_actions set group_id = p_group_id, updated_at = now() where id = v_id and group_id is distinct from p_group_id;
    -- Only log 'linked' when the row actually changed — an idempotent
    -- re-link of an already-member CA must not spam the append-only
    -- activity history with a no-op event.
    if found then
      perform public.call_center_corrective_actions_activity_log(v_id, p_group_id, p_actor_user_id, 'linked', jsonb_build_object('groupId', null), jsonb_build_object('groupId', p_group_id), null, null);
    end if;
  end loop;

  return public.call_center_corrective_action_groups_members(p_group_id, true, array[]::text[]);
end;
$$;

create or replace function public.call_center_corrective_action_groups_unlink(
  p_group_id uuid, p_ca_id uuid, p_actor_user_id uuid
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_ca call_center.corrective_actions;
begin
  select * into v_ca from call_center.corrective_actions where id = p_ca_id for update;
  if v_ca is null then raise exception 'corrective_action_not_found'; end if;
  if v_ca.group_id is distinct from p_group_id then raise exception 'not_a_member_of_group'; end if;

  update call_center.corrective_actions set group_id = null, updated_at = now() where id = p_ca_id;
  perform public.call_center_corrective_actions_activity_log(p_ca_id, p_group_id, p_actor_user_id, 'unlinked', jsonb_build_object('groupId', p_group_id), jsonb_build_object('groupId', null), null, null);

  return public.call_center_corrective_actions_get(p_ca_id, true, array[]::text[]);
end;
$$;

-- =====================================================================
-- 10. Grants — service_role only, wildcard pattern (same as Session
--     16.4.4's attempt-diagnostics migration), nothing granted to
--     public/anon/authenticated.
-- =====================================================================
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and (
        p.proname like 'call_center_corrective_action%'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
