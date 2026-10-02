-- Session 12.7 continuation — two small additive helpers the TypeScript
-- layer needs that the prior 12.7 migration didn't provide:
--
-- 1. A single-configuration-version lookup by id, for
--    reconcileExecutions.ts to resolve the EXACT version that governed
--    a given execution (execution.configuration_version_id) rather than
--    always re-deriving from the campaign's current/live snapshot —
--    the §16/§17 provenance requirement. list_configuration_versions
--    (12.7's original migration) only returns a whole campaign's list;
--    this is the targeted single-row equivalent.
--
-- 2. A batch-stamp helper for "Add Targets to an existing campaign"
--    (§12). The existing call_center_campaign_import_targets_batch
--    (12.7's original migration) wraps the OLD phone-only bulk import
--    function, not the identity-resolved per-row path TypeScript
--    actually uses for CSV import (call_center_campaign_insert_resolved_target,
--    one call per row via identityResolver.ts — see importTargets in
--    supabaseCampaignRepository.ts and its doc comment). Add Targets
--    reuses that SAME proven per-row path, then calls this function
--    once with the exact target ids it just created to stamp
--    import_batch_id and record one audit event — precise, not a
--    timestamp-heuristic match.

create or replace function public.call_center_campaign_get_configuration_version(p_version_id uuid)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select to_jsonb(v) from call_center.campaign_configuration_versions v where v.id = p_version_id;
$$;

create or replace function public.call_center_campaign_stamp_import_batch(
  p_campaign_id uuid, p_target_ids uuid[], p_batch_id uuid, p_now timestamptz, p_actor text
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_count int;
begin
  update call_center.campaign_targets set import_batch_id = p_batch_id
    where campaign_id = p_campaign_id and id = any(p_target_ids);
  get diagnostics v_count = row_count;

  insert into call_center.campaign_audit_events (campaign_id, event_type, actor, occurred_at, detail)
    values (p_campaign_id, 'targets_added', p_actor, p_now, jsonb_build_object('batchId', p_batch_id, 'targetCount', v_count));

  return jsonb_build_object('batchId', p_batch_id, 'targetCount', v_count);
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
