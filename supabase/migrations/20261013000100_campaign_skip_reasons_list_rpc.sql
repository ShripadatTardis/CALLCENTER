-- Session 12.7 continuation — the 12.7 migration created and seeded
-- call_center.campaign_skip_reasons but never added its read RPC (it
-- has classifications_list's counterpart missing). Same pattern as
-- call_center_campaign_classifications_list: fetched live, never
-- hardcoded in TypeScript.

create or replace function public.call_center_campaign_skip_reasons_list()
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.sort_order), '[]'::jsonb)
    from call_center.campaign_skip_reasons r where r.active;
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
