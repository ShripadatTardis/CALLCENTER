-- Session 12.7 continuation — Campaign Settings/Edit for a DRAFT
-- campaign. §4: "Draft campaigns remain normally editable" / item 1 of
-- the deterministic test list: "Draft campaign editable without
-- unnecessary version creation." A draft has no configuration_versions
-- row yet (v1 is only ever synthesized on first Start or first post-
-- launch edit — see the 12.7 migration) — this function updates the
-- campaign's own columns directly, the same way they were set at
-- creation, and ONLY while status = 'draft'. It never touches
-- campaign_configuration_versions and never fires the optimistic-
-- concurrency guard create_configuration_version enforces, because a
-- draft has no concurrent "in production" state to protect yet.

create or replace function public.call_center_campaign_update_draft_configuration(
  p_campaign_id uuid, p_now timestamptz, p_actor text,
  p_agent_id text default null, p_agent_name text default null,
  p_agent_contract_snapshot jsonb default null, p_outcome_policy_snapshot jsonb default null,
  p_mappings jsonb default null
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_campaign call_center.campaigns;
  v_mapping jsonb;
begin
  select * into v_campaign from call_center.campaigns where id = p_campaign_id;
  if v_campaign.id is null then
    raise exception 'Campaign % not found', p_campaign_id;
  end if;
  if v_campaign.status is distinct from 'draft' then
    raise exception 'Campaign % is not a draft (status=%) — use createConfigurationVersion instead', p_campaign_id, v_campaign.status;
  end if;

  update call_center.campaigns set
    agent_id = coalesce(p_agent_id, agent_id),
    agent_name = coalesce(p_agent_name, agent_name),
    agent_contract_snapshot = coalesce(p_agent_contract_snapshot, agent_contract_snapshot),
    outcome_policy_snapshot = coalesce(p_outcome_policy_snapshot, outcome_policy_snapshot),
    updated_at = p_now
  where id = p_campaign_id
  returning * into v_campaign;

  if p_mappings is not null then
    delete from call_center.campaign_agent_input_mappings where campaign_id = p_campaign_id and configuration_version_id is null;
    for v_mapping in select * from jsonb_array_elements(p_mappings) loop
      insert into call_center.campaign_agent_input_mappings (
        campaign_id, configuration_version_id, agent_input_field_code, source_type, source_field, required, data_type, created_at, updated_at
      ) values (
        p_campaign_id, null, v_mapping->>'agentInputFieldCode', v_mapping->>'sourceType', v_mapping->>'sourceField',
        coalesce((v_mapping->>'required')::boolean, false), v_mapping->>'dataType', p_now, p_now
      );
    end loop;
  end if;

  insert into call_center.campaign_audit_events (campaign_id, event_type, actor, occurred_at, detail)
    values (p_campaign_id, 'draft_configuration_updated', p_actor, p_now, jsonb_build_object('agentId', v_campaign.agent_id));

  return to_jsonb(v_campaign);
end;
$$;

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
