-- Session 12.5 — Structured Campaign Outcomes Integration.
--
-- The Voice API has begun populating agent-specific outcome/structured-
-- output fields on GET /api/v1/call-data (actual_outcome_code,
-- actual_outcome_name, structured_outputs) — confirmed live on
-- 2026-10-01 on new calls only; historical calls remain null, with no
-- backfill. This migration is purely additive:
--
--   * campaign_results.structured_outputs already existed (added
--     Session 9.1 Phase 7, always written null until now) — unchanged
--     shape, now genuinely populated when the backend supplies it.
--   * campaign_results gains actual_outcome_code / actual_outcome_name
--     (new columns, nullable, no default) to hold the agent-specific
--     business outcome SEPARATELY from the existing generic
--     campaign_result_code/campaign_result_label (which remain driven
--     by the existing campaign_result_rules matching on call-level
--     fields — status/outcome/escalation_trigger/intent — and are not
--     reinterpreted by this migration).
--
-- Nothing here changes the authoritative correlation
-- (campaign_execution.call_sid == call_data.call_id) or touches
-- existing rows — every new column is nullable and every existing
-- insert path (call_center_campaign_update_reconciliation_status)
-- keeps working unchanged for a null p_result or a result with no
-- actual-outcome fields set.

alter table call_center.campaign_results
  add column if not exists actual_outcome_code text,
  add column if not exists actual_outcome_name text;

-- Unchanged signature/behavior except the insert list now also carries
-- actual_outcome_code/actual_outcome_name (read from the same p_result
-- jsonb payload the caller already builds) alongside the
-- already-wired, previously-always-null structured_outputs — the
-- caller (reconcileExecutions.ts) now supplies real backend values for
-- all three only when the authoritatively matched call-data row
-- actually has them; a legacy/historical call with everything null
-- produces byte-for-byte the same row shape as before this migration.
create or replace function public.call_center_campaign_update_reconciliation_status(
  p_execution_id uuid, p_status text, p_reconciled_interaction_id text,
  p_candidate jsonb, p_now timestamptz, p_result jsonb
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_target_id uuid;
  v_result call_center.campaign_results;
begin
  update call_center.campaign_executions set
    reconciliation_status = p_status,
    reconciled_interaction_id = case when p_status = 'reconciled' then p_reconciled_interaction_id else reconciled_interaction_id end,
    reconciliation_candidate = coalesce(p_candidate, reconciliation_candidate),
    reconciled_at = case when p_status = 'reconciled' then p_now else reconciled_at end
    where id = p_execution_id
    returning campaign_target_id into v_target_id;

  if p_status = 'reconciled' and p_result is not null then
    insert into call_center.campaign_results (
      campaign_execution_id, campaign_target_id, call_status, call_outcome, intent,
      campaign_result_code, campaign_result_label, is_success, result_detail, result_source,
      result_recorded_at, next_action, agent_id, agent_name, structured_outputs,
      actual_outcome_code, actual_outcome_name
    ) values (
      p_execution_id, v_target_id,
      p_result->>'callStatus', p_result->>'callOutcome', p_result->>'intent',
      p_result->>'resultCode', p_result->>'resultLabel', (p_result->>'isSuccess')::boolean,
      p_result->'resultDetail', coalesce(p_result->>'resultSource', 'rule_match'),
      p_now, p_result->>'nextAction',
      p_result->>'agentId', p_result->>'agentName', p_result->'structuredOutputs',
      p_result->>'actualOutcomeCode', p_result->>'actualOutcomeName'
    ) returning * into v_result;

    update call_center.campaign_targets set
      effective_result_id = v_result.id,
      status = case when p_result->>'nextActionType' in ('retry', 'follow_up') then 'follow_up_due' else 'completed' end,
      updated_at = p_now
      where id = v_target_id;
  elsif p_status = 'unresolved' then
    update call_center.campaign_targets set status = 'follow_up_due', updated_at = p_now where id = v_target_id;
  end if;

  return jsonb_build_object('targetId', v_target_id, 'resultId', v_result.id);
end;
$$;

-- Unchanged shape/behavior except the returned rows now also carry the
-- three new/newly-meaningful result columns, so Campaign Detail can
-- render an agent-specific outcome alongside the existing generic one
-- without a second round trip.
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
      le.status as latest_execution_status, le.reconciliation_status as latest_reconciliation_status,
      le.reconciled_interaction_id as latest_reconciled_interaction_id
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

-- New — Session 12.5 §7's idempotent enrichment path. Deliberately a
-- narrow UPDATE-only operation, never an insert: it only ever touches a
-- campaign_results row that already exists (i.e. the execution was
-- already authoritatively reconciled through the normal path above),
-- and only ever fills in the three actual-outcome columns when they
-- are CURRENTLY null and a non-null value is being supplied — it never
-- overwrites a value this function or the reconciliation path already
-- recorded, so calling it twice with the same (or even different)
-- inputs after the first successful enrichment is a safe no-op, not a
-- second write. It never touches call_status/call_outcome/
-- campaign_result_code/is_success/next_action — the existing generic
-- call-level result stays exactly as originally reconciled.
create or replace function public.call_center_campaign_enrich_actual_outcome(
  p_execution_id uuid, p_actual_outcome_code text, p_actual_outcome_name text,
  p_structured_outputs jsonb, p_now timestamptz
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_result call_center.campaign_results;
begin
  select * into v_result from call_center.campaign_results where campaign_execution_id = p_execution_id;

  if v_result.id is null then
    return jsonb_build_object('resultId', null, 'enriched', false, 'reason', 'no_reconciled_result');
  end if;

  if v_result.actual_outcome_code is not null then
    return jsonb_build_object('resultId', v_result.id, 'enriched', false, 'reason', 'already_enriched');
  end if;

  if p_actual_outcome_code is null then
    return jsonb_build_object('resultId', v_result.id, 'enriched', false, 'reason', 'nothing_to_enrich');
  end if;

  update call_center.campaign_results set
    actual_outcome_code = p_actual_outcome_code,
    actual_outcome_name = p_actual_outcome_name,
    structured_outputs = coalesce(p_structured_outputs, structured_outputs)
    where id = v_result.id;

  return jsonb_build_object('resultId', v_result.id, 'enriched', true, 'reason', null);
end;
$$;

-- New — the candidate set for the enrichment path: executions already
-- authoritatively reconciled (reconciliation_status = 'reconciled',
-- reconciled_interaction_id present — i.e. call_sid == call_id was
-- already proven for this row) whose stored result has no
-- actual_outcome_code yet. Deliberately excludes every execution the
-- normal pending-reconciliation path already handles (that path only
-- ever selects reconciliation_status = 'pending') and never revisits a
-- row once it has been enriched (actual_outcome_code is no longer
-- null, so the where clause stops returning it).
create or replace function public.call_center_campaign_list_reconciled_missing_actual_outcome(p_limit integer)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
    select e.*, tg.customer_id, tg.campaign_id, cp.raw_value as contact_raw_value
      from call_center.campaign_executions e
      join call_center.campaign_targets tg on tg.id = e.campaign_target_id
      join call_center.customer_contact_points cp on cp.id = tg.contact_point_id
      join call_center.campaign_results res on res.campaign_execution_id = e.id
      where e.reconciliation_status = 'reconciled'
        and e.reconciled_interaction_id is not null
        and res.actual_outcome_code is null
      order by e.reconciled_at asc nulls last
      limit p_limit
  ) t;
$$;
