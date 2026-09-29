-- Session 12.3 UI verification finding — call_center_campaign_get's stats
-- object has always built its jsonb_build_object with camelCase keys
-- ('targetCount', 'triggeredCount', 'classifiedCount', 'successCount'),
-- while the TypeScript mapper (mapStats() in supabaseCampaignRepository.ts)
-- reads snake_case (row.target_count, etc.) — the same convention
-- call_center_campaign_list's own stats subquery already correctly uses.
-- Result: every Campaign Detail page has always shown 0 for every stat
-- regardless of the real count (confirmed live: the RPC itself correctly
-- computes targetCount=1 for a real 1-target campaign, but the TS mapper
-- silently falls back to `?? 0` on every field since none of the
-- expected snake_case keys are present in the returned JSON).
--
-- Fix: rename the JSON keys to snake_case to match
-- call_center_campaign_list's established convention — zero TypeScript
-- changes needed, and the two sibling stats sources become consistent
-- with each other for the first time. The underlying COUNT/JOIN logic is
-- byte-for-byte unchanged; only the four key names change.

create or replace function public.call_center_campaign_get(p_id uuid)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_campaign jsonb; v_rules jsonb; v_stats jsonb; v_mappings jsonb;
begin
  select to_jsonb(c) into v_campaign from call_center.campaigns c where c.id = p_id;
  if v_campaign is null then
    return null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.priority), '[]'::jsonb) into v_rules
    from call_center.campaign_result_rules r where r.campaign_id = p_id;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.agent_input_field_code), '[]'::jsonb) into v_mappings
    from call_center.campaign_agent_input_mappings m where m.campaign_id = p_id;

  select jsonb_build_object(
    'target_count', count(distinct t.id),
    'triggered_count', count(distinct e.id) filter (where e.status = 'triggered'),
    'classified_count', count(distinct t.id) filter (where t.effective_result_id is not null and res.is_success is not null),
    'success_count', count(distinct t.id) filter (where t.effective_result_id is not null and res.is_success = true)
  ) into v_stats
  from call_center.campaign_targets t
  left join call_center.campaign_executions e on e.campaign_target_id = t.id
  left join call_center.campaign_results res on res.id = t.effective_result_id
  where t.campaign_id = p_id;

  return v_campaign || jsonb_build_object('rules', v_rules, 'mappings', v_mappings, 'stats', v_stats);
end;
$$;
