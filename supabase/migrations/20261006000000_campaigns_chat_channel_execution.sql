-- Session 11.9A — Integrated Initiate Chat: smallest channel-neutral
-- extension to campaign_executions so a Chat-channel attempt against a
-- real campaign_target can be recorded with the SAME structural
-- guarantees a Voice attempt already gets (sequence numbering, target
-- attempt_count/last_action_at/status bump via the existing
-- call_center_campaign_create_execution function), without touching
-- Voice's own call_sid-keyed reconciliation pipeline at all.
--
-- Deliberately NOT included here: any attempt to run Chat responses
-- through campaign_result_rules / deriveCampaignResult. That matching
-- logic is configured against Voice call-data field names
-- (status/outcome/escalation_trigger) with no guarantee any existing
-- campaign's rules were authored with Chat's field vocabulary
-- (intent/confidence/authenticated/data_source) in mind — automatically
-- running Chat through it risks either silent no-ops or, worse, an
-- accidental field-name collision producing a result no one configured
-- for chat. That is a genuine product/engineering decision, flagged in
-- docs/SESSION_11_9A_INTEGRATED_INITIATE_CHAT.md rather than invented
-- here. A Chat execution's reconciliation_status therefore simply stays
-- at its existing default and is never picked up by
-- reconcileExecutions.ts (which queries by call_sid) — honest, not a
-- bug.

alter table call_center.campaign_executions
  add column if not exists channel text not null default 'voice' check (channel in ('voice', 'chat')),
  add column if not exists chat_session_id uuid references call_center.chat_sessions(id) on delete set null;

-- Backward-compatible: appends p_channel with a default, keeping every
-- existing 3-arg caller (campaignRunner.ts's Voice batch path) unchanged.
create or replace function public.call_center_campaign_create_execution(
  p_target_id uuid,
  p_now timestamptz,
  p_request_payload_snapshot jsonb default null,
  p_channel text default 'voice'
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_seq int; v_execution call_center.campaign_executions;
begin
  select coalesce(max(sequence), 0) + 1 into v_seq
    from call_center.campaign_executions where campaign_target_id = p_target_id;

  insert into call_center.campaign_executions (
    campaign_target_id, sequence, status, created_at, request_payload_snapshot, channel
  ) values (
    p_target_id, v_seq, 'triggering', p_now, p_request_payload_snapshot, coalesce(p_channel, 'voice')
  )
  returning * into v_execution;

  -- Unchanged from the existing Voice path — genuinely channel-agnostic
  -- already (keys only on campaign_target_id), so a Chat attempt
  -- correctly bumps attempt_count/last_action_at/status the same way a
  -- Voice attempt does. This is the one piece of real, load-bearing
  -- "preserve Campaign + Target + Customer context through initiation"
  -- this migration relies on rather than re-implements.
  update call_center.campaign_targets set
    status = 'in_progress', attempt_count = attempt_count + 1, last_action_at = p_now, updated_at = p_now
    where id = p_target_id;

  return to_jsonb(v_execution);
end;
$$;

-- Chat's analogue of call_center_campaign_mark_execution_triggered —
-- same shape, correlates by chat_session_id (the internal
-- chat_sessions.id) instead of call_sid, since Chat has no call_sid.
create or replace function public.call_center_campaign_mark_execution_chat_sent(
  p_execution_id uuid,
  p_chat_session_id uuid,
  p_now timestamptz
) returns void language sql security definer set search_path = call_center, pg_temp as $$
  update call_center.campaign_executions set status = 'triggered', chat_session_id = p_chat_session_id, triggered_at = p_now
    where id = p_execution_id;
$$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'call_center_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
