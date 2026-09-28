-- Historical reconstruction (Session 11.9E) — repository migration
-- history repair, not a new change. This migration was already applied
-- to production (schema_migrations version 20260926044511, name
-- "chat_customer360_selection_retention") but had no corresponding
-- file in this repository, discovered during the Session 11.9D
-- migration-readiness audit.
--
-- Reproduces exactly the two live production definitions discovered
-- and verified in 11.9D (fetched via pg_get_functiondef against the
-- live database, not reconstructed from memory or guessed):
--
--  1. call_center_chat_create_session extended from this repo's own
--     12-arg chat_enhancement_5_1.sql version to the live 13-arg
--     version, adding p_customer360_customer_id uuid default null —
--     the operator-selected Customer 360 linkage, written into the
--     chat_sessions.customer_id column that chat_foundation.sql
--     (20260925120000) already defines. This migration does not add
--     that column — it already exists in this repo's first Chat
--     migration; only the function's ability to WRITE to it via this
--     new parameter was missing from repository history.
--  2. call_center_chat_customer_links — a batch, read-only lookup used
--     by Chat Logs display (supabaseChatRepository.getCustomerLinks)
--     to resolve each session's linked Customer 360 customer. Confirmed
--     live but created by no repository migration at all before this
--     file.
--
-- This is a historical reconstruction, not a redesign — the SQL below
-- matches the verified live definitions exactly, including their
-- existing comments/formatting conventions where practical.

create or replace function public.call_center_chat_create_session(
  p_upstream_session_id text,
  p_now timestamptz,
  p_created_by text,
  p_agent_id text default null,
  p_agent_name text default null,
  p_backend_customer_id text default null,
  p_backend_contact_id text default null,
  p_caller_name text default null,
  p_phone_number text default null,
  p_is_bank_customer boolean default null,
  p_upstream_status text default null,
  p_history_doc_id text default null,
  p_customer360_customer_id uuid default null
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_session call_center.chat_sessions;
begin
  insert into call_center.chat_sessions (
    upstream_session_id, started_at, last_activity_at, status, created_by,
    agent_id, agent_name, backend_customer_id, backend_contact_id,
    caller_name, phone_number, is_bank_customer, upstream_status, history_doc_id,
    customer_id
  ) values (
    p_upstream_session_id, p_now, p_now, 'active', p_created_by,
    p_agent_id, p_agent_name, p_backend_customer_id, p_backend_contact_id,
    p_caller_name, p_phone_number, p_is_bank_customer, p_upstream_status, p_history_doc_id,
    p_customer360_customer_id
  )
  on conflict (upstream_session_id) do update set
    last_activity_at = excluded.last_activity_at,
    agent_id = coalesce(call_center.chat_sessions.agent_id, excluded.agent_id),
    agent_name = coalesce(call_center.chat_sessions.agent_name, excluded.agent_name),
    backend_customer_id = coalesce(excluded.backend_customer_id, call_center.chat_sessions.backend_customer_id),
    backend_contact_id = coalesce(excluded.backend_contact_id, call_center.chat_sessions.backend_contact_id),
    caller_name = coalesce(excluded.caller_name, call_center.chat_sessions.caller_name),
    phone_number = coalesce(excluded.phone_number, call_center.chat_sessions.phone_number),
    is_bank_customer = coalesce(excluded.is_bank_customer, call_center.chat_sessions.is_bank_customer),
    upstream_status = coalesce(excluded.upstream_status, call_center.chat_sessions.upstream_status),
    history_doc_id = coalesce(excluded.history_doc_id, call_center.chat_sessions.history_doc_id),
    -- Never null out a previously-recorded Customer 360 selection just
    -- because this touch call didn't carry one; never overwrite a
    -- stronger, already-resolved link with a weaker one either.
    customer_id = coalesce(call_center.chat_sessions.customer_id, excluded.customer_id)
  returning * into v_session;

  return to_jsonb(v_session);
end;
$$;

-- Batch, read-only lookup of each upstream session's linked Customer
-- 360 customer, for Chat Logs/Session Detail display resolution only —
-- never used for authorization, which stays keyed on
-- agent_id -> category -> role.
create or replace function public.call_center_chat_customer_links(p_upstream_session_ids text[])
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
    select
      s.upstream_session_id,
      c.id as customer_id,
      c.display_name,
      c.source_customer_ref,
      phone.primary_phone_masked
    from call_center.chat_sessions s
    join call_center.customers c on c.id = s.customer_id
    cross join lateral (
      select case
        when length(regexp_replace(cp.normalized_value, '[^0-9]', '', 'g')) >= 4
          then '••••' || right(regexp_replace(cp.normalized_value, '[^0-9]', '', 'g'), 4)
        else null
      end as primary_phone_masked
      from call_center.customer_contact_points cp
      where cp.customer_id = c.id and cp.type = 'phone'
      order by cp.is_primary desc, cp.last_seen desc
      limit 1
    ) phone
    where s.upstream_session_id = any(p_upstream_session_ids)
  ) t;
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
