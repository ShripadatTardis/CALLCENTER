-- Session 15.3 fix — the original call_center_campaign_get_execution_by_
-- interaction(p_campaign_id, p_interaction_id) required the CALLER to
-- already know which campaign governed an interaction. In practice the
-- Voice/Calls API's own call record never carries a stable campaign id
-- (confirmed: src/services/calls/callsMapper.ts — "No stable campaign ID
-- is documented upstream — name only"), so Call Logs' interaction object
-- never has one to pass, making the original signature unusable from its
-- one real caller.
--
-- Replaced with an interaction-id-only lookup. Authorization moves to
-- the API layer (api/campaigns.ts), which now checks the RESOLVED
-- execution's own governing agent_id against the caller's Agent Scope
-- (isAgentAuthorized) after the fact — the same "resolve then authorize
-- the resolved record's own scope" shape already used by
-- requireAuthorizedCampaign, just without needing the campaign id
-- up front.
create or replace function public.call_center_campaign_get_execution_by_interaction(
  p_interaction_id text
)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select jsonb_build_object('execution', to_jsonb(e), 'agentId', c.agent_id)
    from call_center.campaign_executions e
    join call_center.campaign_targets t on t.id = e.campaign_target_id
    join call_center.campaigns c on c.id = t.campaign_id
    where (e.call_sid = p_interaction_id or e.reconciled_interaction_id = p_interaction_id)
    order by e.created_at desc
    limit 1;
$$;

drop function if exists public.call_center_campaign_get_execution_by_interaction(uuid, text);

revoke all on function public.call_center_campaign_get_execution_by_interaction(text) from public, anon, authenticated;
grant execute on function public.call_center_campaign_get_execution_by_interaction(text) to service_role;
