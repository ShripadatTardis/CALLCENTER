-- Session 15.3 — a single-execution lookup by interaction id (call_sid
-- for voice; chat has no campaign_executions concept), scoped to one
-- campaign for authorization (the existing requireAuthorizedCampaign
-- Agent Scope check in api/campaigns.ts). Exposes the already-persisted
-- request_payload_snapshot (the real deterministic Trigger Call payload,
-- including agent_inputs — the actual resolved input field values sent)
-- for display in Call Logs' interaction detail, where this data has
-- existed since Session 9.1 Phase 3/5/7 but was never surfaced anywhere.
--
-- Matches on EITHER call_sid or reconciled_interaction_id (both are set
-- to the same value once reconciled, but call_sid is stamped first, at
-- trigger time — matching on both covers an execution that was
-- triggered but not yet reconciled). Most recent match wins if more
-- than one execution row somehow shares the id (shouldn't happen in
-- practice — call_sid is effectively unique per real call — but this
-- is a read path, so "most recent" is the honest, deterministic
-- tie-break rather than an arbitrary/unordered one).
create or replace function public.call_center_campaign_get_execution_by_interaction(
  p_campaign_id uuid, p_interaction_id text
)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select to_jsonb(e)
    from call_center.campaign_executions e
    join call_center.campaign_targets t on t.id = e.campaign_target_id
    where t.campaign_id = p_campaign_id
      and (e.call_sid = p_interaction_id or e.reconciled_interaction_id = p_interaction_id)
    order by e.created_at desc
    limit 1;
$$;

revoke all on function public.call_center_campaign_get_execution_by_interaction(uuid, text) from public, anon, authenticated;
grant execute on function public.call_center_campaign_get_execution_by_interaction(uuid, text) to service_role;
