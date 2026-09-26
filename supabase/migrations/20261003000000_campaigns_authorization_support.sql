-- Session 9.2 — Campaign authorization support.
--
-- Adds exactly one new lookup RPC needed to safely authorize
-- retryTarget/scheduleFollowup (which take only a campaign_target id,
-- not a campaign id) against the existing category/role model, without
-- trusting a client-supplied campaignId. No table/column change.
--
-- Reuses the SAME authorization model already proven for Call Logs/Chat
-- Logs (docs/CALL_CENTRE_SESSION6_2_INTERACTION_CLASSIFICATION_PLAN.md):
-- interaction.agent_id -> customer360_category_agents -> role access.
-- Here, campaign.agent_id plays the same role agent_id already plays
-- for calls/chats.

create or replace function public.call_center_campaign_get_target_context(p_target_id uuid)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_row record;
begin
  select ct.id as target_id, ct.campaign_id, c.agent_id
    into v_row
    from call_center.campaign_targets ct
    join call_center.campaigns c on c.id = ct.campaign_id
   where ct.id = p_target_id;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'targetId', v_row.target_id,
    'campaignId', v_row.campaign_id,
    'agentId', v_row.agent_id
  );
end;
$$;

-- Re-apply the same lockdown as every prior campaign migration: every
-- call_center_campaign_* function, service_role only. Idempotent —
-- matches by name pattern, touches nothing else in AuditAI's public
-- schema.
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
