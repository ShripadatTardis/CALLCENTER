-- Session 12.7 — Campaign Administration, Configuration Versioning &
-- Target Controls.
--
-- Governing principle: Campaign configuration may evolve prospectively,
-- but every past execution must remain attributable to the exact
-- configuration and target data that governed it. Everything here is
-- additive — no existing column/table/function behavior is removed.
-- Legacy campaigns (no configuration_versions row) keep working exactly
-- as before: campaign_executions.configuration_version_id is nullable,
-- and every read path that needs "the governing configuration" falls
-- back to the campaign's own agent_contract_snapshot/
-- outcome_policy_snapshot columns (unchanged, Session 9.1/12.6) when no
-- version id is present — never fabricated/reconstructed history.

-- =====================================================================
-- 1. Campaign Configuration Version
-- =====================================================================
-- One row per prospective configuration change. A campaign keeps one
-- identity; "v1, v2, v3..." are rows here. Exactly one row per campaign
-- may be status='active' at a time (enforced by the partial unique
-- index below), which both is the natural "current configuration" read
-- path AND the concurrency guard for §20: a client proposing a new
-- version must name the version id it believes is currently active,
-- and the activation function rejects the change if that's gone stale.
create table if not exists call_center.campaign_configuration_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references call_center.campaigns(id),
  version_number integer not null,
  status text not null default 'active', -- 'active' | 'superseded'
  agent_id text not null,
  agent_name text,
  agent_contract_snapshot jsonb,
  outcome_policy_snapshot jsonb,
  created_at timestamptz not null default now(),
  created_by text,
  change_reason text,
  previous_version_id uuid references call_center.campaign_configuration_versions(id),
  unique (campaign_id, version_number)
);

create unique index if not exists campaign_configuration_versions_one_active
  on call_center.campaign_configuration_versions (campaign_id)
  where status = 'active';

-- Input mappings become per-version so a mapping edit is itself a
-- prospective change: existing rows (version_id null) belong to
-- whatever the campaign's un-versioned "current" state is (draft, or a
-- legacy campaign that has never been edited since 12.7). The existing
-- campaign_agent_input_mappings table/shape is reused unchanged, not
-- duplicated into jsonb.
alter table call_center.campaign_agent_input_mappings
  add column if not exists configuration_version_id uuid references call_center.campaign_configuration_versions(id);

-- Every execution is stamped with the configuration version active at
-- the moment it was created (campaign_executions insert time, in
-- call_center_campaign_create_execution below) — immutable thereafter,
-- exactly like call_sid. Null for every execution created before this
-- migration and for any execution of a campaign that has never been
-- versioned (first Start happened pre-12.7, never edited since).
alter table call_center.campaign_executions
  add column if not exists configuration_version_id uuid references call_center.campaign_configuration_versions(id);

-- =====================================================================
-- 2. Campaign audit history — one append-only table for every
-- administrative/operational event this session introduces (and the
-- version-lifecycle events above). Not full event sourcing — a plain
-- audit log, read-only after insert. event_type is free text (matches
-- this schema's existing convention for result_source/follow_up_type,
-- an internal technical log, not user-facing master vocabulary).
-- =====================================================================
create table if not exists call_center.campaign_audit_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references call_center.campaigns(id),
  event_type text not null,
  actor text,
  occurred_at timestamptz not null default now(),
  campaign_target_id uuid references call_center.campaign_targets(id),
  campaign_execution_id uuid references call_center.campaign_executions(id),
  configuration_version_id uuid references call_center.campaign_configuration_versions(id),
  reason text,
  comment text,
  detail jsonb
);

create index if not exists campaign_audit_events_campaign_idx on call_center.campaign_audit_events (campaign_id, occurred_at desc);

-- =====================================================================
-- 3. Skip Reason master — system-configured, same principle as
-- campaign_classifications (12.6): never a hardcoded TS enum.
-- `requires_comment` is DATA (true only for the seeded "Other" row),
-- so the "Other requires a comment" rule never hardcodes a hardcoded
-- 'OTHER' code comparison in business logic.
-- =====================================================================
create table if not exists call_center.campaign_skip_reasons (
  code text primary key,
  label text not null,
  description text,
  requires_comment boolean not null default false,
  sort_order integer not null,
  active boolean not null default true
);

insert into call_center.campaign_skip_reasons (code, label, description, requires_comment, sort_order, active)
values
  ('DUPLICATE_CONTACT', 'Duplicate contact', 'This contact already exists elsewhere in the audience.', false, 10, true),
  ('DO_NOT_CONTACT', 'Do not contact', 'The contact is on a do-not-contact list or has opted out.', false, 20, true),
  ('INCORRECT_CONTACT_DETAILS', 'Incorrect contact details', 'The phone number or other contact data is invalid.', false, 30, true),
  ('CUSTOMER_REQUEST', 'Customer request', 'The customer asked not to be included in this campaign.', false, 40, true),
  ('ALREADY_HANDLED', 'Already handled', 'This matter was already resolved through another channel.', false, 50, true),
  ('NOT_ELIGIBLE', 'Not eligible', 'The target does not meet this campaign''s eligibility criteria.', false, 60, true),
  ('INTERNAL_EXCLUSION', 'Internal exclusion', 'Excluded by internal policy or compliance review.', false, 70, true),
  ('OTHER', 'Other', 'Any other reason — a comment is required.', true, 80, true)
on conflict (code) do nothing;

-- =====================================================================
-- 4. Target-level columns for Skip / Hold / amendment provenance.
-- Full who/when/what-changed history lives in campaign_audit_events;
-- these are denormalized "current state" fields for cheap display.
-- =====================================================================
alter table call_center.campaign_targets
  add column if not exists skip_reason_code text references call_center.campaign_skip_reasons(code),
  add column if not exists skip_comment text,
  add column if not exists hold_reason text,
  add column if not exists hold_note text,
  -- Populated the first time a target is amended (backfilled from the
  -- then-current source_attributes if never captured before — see
  -- call_center_campaign_amend_target) or, going forward, at import
  -- time. NEVER modified after that first capture. source_attributes
  -- itself remains the mutable "effective" value the runner already
  -- resolves inputs from (triggerCallPayload.ts is unchanged).
  add column if not exists original_source_attributes jsonb,
  add column if not exists import_batch_id uuid;

-- =====================================================================
-- 5. call_center_campaign_create_execution — now stamps the campaign's
-- current active configuration_version_id (if any) onto the new
-- execution row. Everything else byte-for-byte unchanged; a campaign
-- with no active version row (legacy, never edited since 12.7) simply
-- gets configuration_version_id = null, exactly as every execution did
-- before this migration.
-- =====================================================================
create or replace function public.call_center_campaign_create_execution(
  p_target_id uuid, p_now timestamptz, p_request_payload_snapshot jsonb default null
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_seq int;
  v_execution call_center.campaign_executions;
  v_campaign_id uuid;
  v_version_id uuid;
begin
  select campaign_id into v_campaign_id from call_center.campaign_targets where id = p_target_id;
  select id into v_version_id from call_center.campaign_configuration_versions
    where campaign_id = v_campaign_id and status = 'active';

  select coalesce(max(sequence), 0) + 1 into v_seq
    from call_center.campaign_executions where campaign_target_id = p_target_id;

  insert into call_center.campaign_executions (campaign_target_id, sequence, status, created_at, request_payload_snapshot, configuration_version_id)
    values (p_target_id, v_seq, 'triggering', p_now, p_request_payload_snapshot, v_version_id)
    returning * into v_execution;

  update call_center.campaign_targets set
    status = 'in_progress', attempt_count = attempt_count + 1, last_action_at = p_now, updated_at = p_now
    where id = p_target_id;

  return to_jsonb(v_execution);
end;
$$;

-- =====================================================================
-- 6. Status transition with audit + automatic v1 creation on first
-- Start. Wraps the existing call_center_campaign_update_status logic
-- (unchanged, still callable directly for any internal caller that
-- doesn't need the audit trail) with: an audit_events insert, and —
-- only the very first time a campaign transitions into 'running' while
-- it has no configuration_versions row yet — creation of "v1", an
-- immutable snapshot of the campaign's current agent/contract/policy/
-- mappings at that moment. A campaign edited and re-versioned before
-- this migration landed, or a legacy campaign already running, simply
-- never gets this v1 backfilled — it stays in the pre-12.7
-- "campaigns-table-is-the-only-source-of-truth" state until/unless an
-- operator actually edits its configuration post-12.7 (see §7 below,
-- which creates v1 on demand for exactly that case too).
-- =====================================================================
create or replace function public.call_center_campaign_set_status_audited(
  p_id uuid, p_status text, p_now timestamptz, p_actor text, p_reason text
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_campaign call_center.campaigns;
  v_prev_status text;
  v_existing_version_id uuid;
  v_new_version_id uuid;
  v_mapping record;
begin
  select status into v_prev_status from call_center.campaigns where id = p_id;

  update call_center.campaigns set
    status = p_status,
    updated_at = p_now,
    started_at = case when p_status = 'running' and started_at is null then p_now else started_at end,
    completed_at = case when p_status in ('completed', 'stopped', 'failed') then p_now else completed_at end
  where id = p_id
  returning * into v_campaign;

  if p_status = 'running' and v_prev_status is distinct from 'running' then
    select id into v_existing_version_id from call_center.campaign_configuration_versions
      where campaign_id = p_id and status = 'active';

    if v_existing_version_id is null then
      insert into call_center.campaign_configuration_versions (
        campaign_id, version_number, status, agent_id, agent_name,
        agent_contract_snapshot, outcome_policy_snapshot, created_at, created_by
      ) values (
        p_id, 1, 'active', v_campaign.agent_id, v_campaign.agent_name,
        v_campaign.agent_contract_snapshot, v_campaign.outcome_policy_snapshot, p_now, p_actor
      ) returning id into v_new_version_id;

      update call_center.campaign_agent_input_mappings set configuration_version_id = v_new_version_id
        where campaign_id = p_id and configuration_version_id is null;

      insert into call_center.campaign_audit_events (campaign_id, event_type, actor, occurred_at, configuration_version_id, detail)
        values (p_id, 'configuration_version_created', p_actor, p_now, v_new_version_id, jsonb_build_object('versionNumber', 1, 'reason', 'first_start'));
      insert into call_center.campaign_audit_events (campaign_id, event_type, actor, occurred_at, configuration_version_id)
        values (p_id, 'configuration_version_activated', p_actor, p_now, v_new_version_id);
    end if;
  end if;

  insert into call_center.campaign_audit_events (campaign_id, event_type, actor, occurred_at, reason, detail)
    values (p_id, 'campaign_status_changed', p_actor, p_now, p_reason, jsonb_build_object('from', v_prev_status, 'to', p_status));

  return to_jsonb(v_campaign);
end;
$$;

-- =====================================================================
-- 7. Create a new prospective configuration version — the ONLY path
-- for changing outcome policy, input mapping, or agent on a
-- launched/paused/running campaign. Optimistic-concurrency guarded by
-- p_expected_current_version_id (§20): if the campaign has never been
-- versioned yet (legacy, still on its original campaigns-table
-- snapshot), p_expected_current_version_id must be NULL and this
-- function synthesizes "v1" from the campaign's current columns first
-- (same snapshot logic as the auto-v1-on-Start path above), then
-- immediately creates v2 with the requested change — so editing a
-- never-versioned running legacy campaign is itself what brings it
-- into the versioned model, exactly once, non-destructively.
-- =====================================================================
create or replace function public.call_center_campaign_create_configuration_version(
  p_campaign_id uuid, p_expected_current_version_id uuid, p_now timestamptz, p_actor text, p_reason text,
  p_agent_id text default null, p_agent_name text default null,
  p_agent_contract_snapshot jsonb default null, p_outcome_policy_snapshot jsonb default null,
  p_mappings jsonb default null, p_event_type text default 'outcome_mapping_changed'
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_campaign call_center.campaigns;
  v_current_version_id uuid;
  v_base_version call_center.campaign_configuration_versions;
  v_next_number int;
  v_new_version_id uuid;
  v_mapping jsonb;
  v_final_agent_id text;
  v_final_agent_name text;
  v_final_contract jsonb;
  v_final_policy jsonb;
begin
  select * into v_campaign from call_center.campaigns where id = p_campaign_id;
  if v_campaign.id is null then
    raise exception 'Campaign % not found', p_campaign_id;
  end if;

  select id into v_current_version_id from call_center.campaign_configuration_versions
    where campaign_id = p_campaign_id and status = 'active';

  -- Concurrency guard (§20): the caller must agree with us about what
  -- is currently active (including "nothing yet", i.e. both null).
  if v_current_version_id is distinct from p_expected_current_version_id then
    raise exception 'stale_configuration_version: expected % but active is %', p_expected_current_version_id, v_current_version_id
      using errcode = '40001';
  end if;

  if v_current_version_id is null then
    -- Never-versioned legacy/running campaign: synthesize v1 from the
    -- campaign's own current columns before layering the real edit on
    -- top, so nothing about its pre-12.7 history is lost or guessed.
    insert into call_center.campaign_configuration_versions (
      campaign_id, version_number, status, agent_id, agent_name,
      agent_contract_snapshot, outcome_policy_snapshot, created_at, created_by, change_reason
    ) values (
      p_campaign_id, 1, 'superseded', v_campaign.agent_id, v_campaign.agent_name,
      v_campaign.agent_contract_snapshot, v_campaign.outcome_policy_snapshot, p_now, p_actor, 'synthesized_on_first_edit'
    ) returning * into v_base_version;

    update call_center.campaign_agent_input_mappings set configuration_version_id = v_base_version.id
      where campaign_id = p_campaign_id and configuration_version_id is null;

    v_next_number := 2;
  else
    select * into v_base_version from call_center.campaign_configuration_versions where id = v_current_version_id;
    update call_center.campaign_configuration_versions set status = 'superseded' where id = v_current_version_id;
    select max(version_number) + 1 into v_next_number from call_center.campaign_configuration_versions where campaign_id = p_campaign_id;
  end if;

  v_final_agent_id := coalesce(p_agent_id, v_base_version.agent_id);
  v_final_agent_name := coalesce(p_agent_name, v_base_version.agent_name);
  v_final_contract := coalesce(p_agent_contract_snapshot, v_base_version.agent_contract_snapshot);
  v_final_policy := coalesce(p_outcome_policy_snapshot, v_base_version.outcome_policy_snapshot);

  insert into call_center.campaign_configuration_versions (
    campaign_id, version_number, status, agent_id, agent_name,
    agent_contract_snapshot, outcome_policy_snapshot, created_at, created_by, change_reason, previous_version_id
  ) values (
    p_campaign_id, v_next_number, 'active', v_final_agent_id, v_final_agent_name,
    v_final_contract, v_final_policy, p_now, p_actor, p_reason, v_base_version.id
  ) returning id into v_new_version_id;

  if p_mappings is not null then
    for v_mapping in select * from jsonb_array_elements(p_mappings) loop
      insert into call_center.campaign_agent_input_mappings (
        campaign_id, configuration_version_id, agent_input_field_code, source_type, source_field, required, data_type, created_at, updated_at
      ) values (
        p_campaign_id, v_new_version_id, v_mapping->>'agentInputFieldCode', v_mapping->>'sourceType', v_mapping->>'sourceField',
        coalesce((v_mapping->>'required')::boolean, false), v_mapping->>'dataType', p_now, p_now
      );
    end loop;
  else
    -- No new mapping set supplied: carry the base version's mappings
    -- forward unchanged (e.g. an outcome-policy-only edit shouldn't
    -- silently lose input mapping).
    insert into call_center.campaign_agent_input_mappings (
      campaign_id, configuration_version_id, agent_input_field_code, source_type, source_field, required, data_type, created_at, updated_at
    )
    select campaign_id, v_new_version_id, agent_input_field_code, source_type, source_field, required, data_type, p_now, p_now
      from call_center.campaign_agent_input_mappings where configuration_version_id = v_base_version.id;
  end if;

  update call_center.campaigns set
    agent_id = v_final_agent_id, agent_name = v_final_agent_name,
    agent_contract_snapshot = v_final_contract, outcome_policy_snapshot = v_final_policy,
    updated_at = p_now
  where id = p_campaign_id;

  insert into call_center.campaign_audit_events (campaign_id, event_type, actor, occurred_at, configuration_version_id, reason, detail)
    values (p_campaign_id, p_event_type, p_actor, p_now, v_new_version_id,
      p_reason, jsonb_build_object('versionNumber', v_next_number, 'previousVersionId', v_base_version.id));
  insert into call_center.campaign_audit_events (campaign_id, event_type, actor, occurred_at, configuration_version_id)
    values (p_campaign_id, 'configuration_version_activated', p_actor, p_now, v_new_version_id);

  return jsonb_build_object('versionId', v_new_version_id, 'versionNumber', v_next_number);
end;
$$;

-- =====================================================================
-- 8. Skip Target — real operator intervention, semantically distinct
-- from any Voice Agent outcome or Campaign Classification. Never
-- selected again by the runner because 'skipped' (already a long-
-- standing, previously-unused CampaignTargetStatus value) is not in
-- call_center_campaign_select_runnable_targets's status filter —
-- unchanged, no edit needed to that function.
-- =====================================================================
create or replace function public.call_center_campaign_skip_target(
  p_target_id uuid, p_reason_code text, p_comment text, p_now timestamptz, p_actor text
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_target call_center.campaign_targets;
  v_requires_comment boolean;
  v_prev_status text;
begin
  select requires_comment into v_requires_comment from call_center.campaign_skip_reasons where code = p_reason_code and active;
  if v_requires_comment is null then
    raise exception 'Unknown or inactive skip reason code: %', p_reason_code;
  end if;
  if v_requires_comment and (p_comment is null or length(trim(p_comment)) = 0) then
    raise exception 'A comment is required for skip reason %', p_reason_code;
  end if;

  select status into v_prev_status from call_center.campaign_targets where id = p_target_id;
  if v_prev_status is null then
    raise exception 'Target % not found', p_target_id;
  end if;

  update call_center.campaign_targets set
    status = 'skipped', skip_reason_code = p_reason_code, skip_comment = p_comment, updated_at = p_now
    where id = p_target_id
    returning * into v_target;

  insert into call_center.campaign_audit_events (campaign_id, event_type, actor, occurred_at, campaign_target_id, reason, comment, detail)
    values (v_target.campaign_id, 'target_skipped', p_actor, p_now, p_target_id, p_reason_code, p_comment, jsonb_build_object('priorStatus', v_prev_status));

  return to_jsonb(v_target);
end;
$$;

-- =====================================================================
-- 9. Hold / Release Hold — target-level, distinct from campaign-level
-- Pause. No resume-date scheduling (no genuine execution path exists
-- for it — see Session 12.6's identical finding for campaign_followups).
-- =====================================================================
create or replace function public.call_center_campaign_hold_target(
  p_target_id uuid, p_reason text, p_note text, p_now timestamptz, p_actor text
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_target call_center.campaign_targets; v_prev_status text;
begin
  select status into v_prev_status from call_center.campaign_targets where id = p_target_id;
  if v_prev_status is null then
    raise exception 'Target % not found', p_target_id;
  end if;
  if v_prev_status not in ('pending', 'ready', 'follow_up_due') then
    raise exception 'Target % is not eligible to be held (status=%)', p_target_id, v_prev_status;
  end if;

  update call_center.campaign_targets set
    status = 'held', hold_reason = p_reason, hold_note = p_note, updated_at = p_now
    where id = p_target_id
    returning * into v_target;

  insert into call_center.campaign_audit_events (campaign_id, event_type, actor, occurred_at, campaign_target_id, reason, comment, detail)
    values (v_target.campaign_id, 'target_held', p_actor, p_now, p_target_id, p_reason, p_note, jsonb_build_object('priorStatus', v_prev_status));

  return to_jsonb(v_target);
end;
$$;

create or replace function public.call_center_campaign_release_hold(
  p_target_id uuid, p_now timestamptz, p_actor text
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_target call_center.campaign_targets; v_prev_status text; v_prior_reason text;
begin
  select status, hold_reason into v_prev_status, v_prior_reason from call_center.campaign_targets where id = p_target_id;
  if v_prev_status is null then
    raise exception 'Target % not found', p_target_id;
  end if;
  if v_prev_status is distinct from 'held' then
    raise exception 'Target % is not currently held (status=%)', p_target_id, v_prev_status;
  end if;

  update call_center.campaign_targets set
    status = 'ready', hold_reason = null, hold_note = null, updated_at = p_now
    where id = p_target_id
    returning * into v_target;

  insert into call_center.campaign_audit_events (campaign_id, event_type, actor, occurred_at, campaign_target_id, reason)
    values (v_target.campaign_id, 'hold_released', p_actor, p_now, p_target_id, v_prior_reason);

  return to_jsonb(v_target);
end;
$$;

-- =====================================================================
-- 10. Target data amendment — corrects the EFFECTIVE source_attributes
-- (what future executions resolve inputs from, exactly as
-- triggerCallPayload.ts already reads target.sourceAttributes — no
-- change needed there) while preserving original_source_attributes.
-- What each PAST execution actually used remains answerable from that
-- execution's own existing request_payload_snapshot (Session 9.1 Phase
-- 3/5/7) — audited and confirmed adequate, no redundant per-execution
-- input copy introduced.
-- =====================================================================
create or replace function public.call_center_campaign_amend_target(
  p_target_id uuid, p_source_attributes jsonb, p_now timestamptz, p_actor text, p_reason text
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_target call_center.campaign_targets; v_before jsonb;
begin
  select * into v_target from call_center.campaign_targets where id = p_target_id;
  if v_target.id is null then
    raise exception 'Target % not found', p_target_id;
  end if;
  v_before := v_target.source_attributes;

  update call_center.campaign_targets set
    source_attributes = coalesce(v_target.source_attributes, '{}'::jsonb) || p_source_attributes,
    original_source_attributes = coalesce(v_target.original_source_attributes, v_target.source_attributes),
    updated_at = p_now
    where id = p_target_id
    returning * into v_target;

  insert into call_center.campaign_audit_events (campaign_id, event_type, actor, occurred_at, campaign_target_id, reason, detail)
    values (v_target.campaign_id, 'target_amended', p_actor, p_now, p_target_id, p_reason, jsonb_build_object('before', v_before, 'after', v_target.source_attributes));

  return to_jsonb(v_target);
end;
$$;

-- =====================================================================
-- 11. Retry with optional audited reason — same eligibility/transition
-- as the existing call_center_campaign_retry_target (status must be
-- 'failed' or 'follow_up_due' -> 'ready'); this overload additionally
-- records the audit event. The next runCampaignBatch pass creates a
-- genuinely new campaign_executions row via the function in §5 above,
-- which independently stamps whatever configuration version is active
-- at THAT moment — a retry automatically gets its own provenance with
-- no retry-specific version logic needed.
-- =====================================================================
-- The original function was (uuid, timestamptz) with no defaulted
-- params; CREATE OR REPLACE cannot widen a signature in place without
-- creating an ambiguous second overload (Postgres resolves named-arg
-- RPC calls by matching parameter names across ALL overloads, and a
-- call passing only p_target_id/p_now would then match both). Drop the
-- old exact signature first so there is exactly one overload.
drop function if exists public.call_center_campaign_retry_target(uuid, timestamptz);

create or replace function public.call_center_campaign_retry_target(
  p_target_id uuid, p_now timestamptz, p_actor text default null, p_reason text default null
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_status text; v_campaign_id uuid;
begin
  select status, campaign_id into v_status, v_campaign_id from call_center.campaign_targets where id = p_target_id;
  if v_status not in ('failed', 'follow_up_due') then
    raise exception 'Target % is not eligible for retry (status=%)', p_target_id, v_status;
  end if;
  update call_center.campaign_targets set status = 'ready', next_action_at = null, updated_at = p_now where id = p_target_id;

  insert into call_center.campaign_audit_events (campaign_id, event_type, actor, occurred_at, campaign_target_id, reason)
    values (v_campaign_id, 'manual_retry_requested', p_actor, p_now, p_target_id, p_reason);

  return jsonb_build_object('targetId', p_target_id, 'status', 'ready');
end;
$$;

-- =====================================================================
-- 12. Add Targets to an existing campaign — thin audited wrapper
-- around the existing call_center_campaign_import_targets (unchanged:
-- still the only place dedupe-via-contact-point-matching and
-- customer/contact-point creation happens), now also stamping
-- import_batch_id on every created row and recording one audit event
-- per batch.
-- =====================================================================
create or replace function public.call_center_campaign_import_targets_batch(
  p_campaign_id uuid, p_rows jsonb, p_now timestamptz, p_actor text, p_batch_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_result jsonb; v_batch_id uuid; v_before_count int; v_after_count int;
begin
  v_batch_id := coalesce(p_batch_id, gen_random_uuid());
  select count(*) into v_before_count from call_center.campaign_targets where campaign_id = p_campaign_id;

  v_result := public.call_center_campaign_import_targets(p_campaign_id, p_rows, p_now);

  update call_center.campaign_targets set import_batch_id = v_batch_id
    where campaign_id = p_campaign_id and import_batch_id is null
      and created_at = p_now; -- only the rows this exact call just inserted

  select count(*) into v_after_count from call_center.campaign_targets where campaign_id = p_campaign_id;

  insert into call_center.campaign_audit_events (campaign_id, event_type, actor, occurred_at, detail)
    values (p_campaign_id, 'targets_added', p_actor, p_now,
      v_result || jsonb_build_object('batchId', v_batch_id, 'targetCountBefore', v_before_count, 'targetCountAfter', v_after_count));

  return v_result || jsonb_build_object('batchId', v_batch_id);
end;
$$;

-- =====================================================================
-- 13. Read paths — list targets gains the new columns; list audit
-- events for Campaign History; get a campaign's configuration-version
-- list; get the full detail (including provenance) for one execution.
-- =====================================================================
create or replace function public.call_center_campaign_list_targets(p_campaign_id uuid, p_page integer, p_page_size integer)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_total int; v_rows jsonb;
begin
  select count(*) into v_total from call_center.campaign_targets where campaign_id = p_campaign_id;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_rows from (
    select
      tg.*,
      cp.raw_value as contact_raw_value,
      cu.display_name as customer_display_name,
      res.campaign_result_code, res.campaign_result_label, res.is_success as result_is_success,
      res.next_action as result_next_action,
      res.actual_outcome_code as result_actual_outcome_code,
      res.actual_outcome_name as result_actual_outcome_name,
      res.structured_outputs as result_structured_outputs,
      res.campaign_classification_code as result_classification_code,
      res.classification_contract_drift as result_classification_contract_drift,
      res.classification_next_action_type as result_classification_next_action_type,
      le.status as latest_execution_status, le.reconciliation_status as latest_reconciliation_status,
      le.reconciled_interaction_id as latest_reconciled_interaction_id,
      le.configuration_version_id as latest_configuration_version_id
    from call_center.campaign_targets tg
    join call_center.customer_contact_points cp on cp.id = tg.contact_point_id
    join call_center.customers cu on cu.id = tg.customer_id
    left join call_center.campaign_results res on res.id = tg.effective_result_id
    left join lateral (
      select e.* from call_center.campaign_executions e
        where e.campaign_target_id = tg.id order by e.sequence desc limit 1
    ) le on true
    where tg.campaign_id = p_campaign_id
    order by tg.created_at asc
    limit p_page_size offset (p_page - 1) * p_page_size
  ) t;

  return jsonb_build_object('rows', v_rows, 'totalCount', v_total);
end;
$$;

create or replace function public.call_center_campaign_list_audit_events(p_campaign_id uuid, p_limit integer default 200)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(e) order by e.occurred_at desc), '[]'::jsonb)
    from (
      select * from call_center.campaign_audit_events where campaign_id = p_campaign_id order by occurred_at desc limit p_limit
    ) e;
$$;

create or replace function public.call_center_campaign_list_configuration_versions(p_campaign_id uuid)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(v) order by v.version_number desc), '[]'::jsonb)
    from call_center.campaign_configuration_versions v where v.campaign_id = p_campaign_id;
$$;

-- =====================================================================
-- 14. Lock down every new/replaced function to service_role, same
-- established wildcard pattern (re-run over the full call_center_campaign_%
-- family — behavior-neutral for anything already correctly granted).
-- =====================================================================
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'call_center_campaign_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
