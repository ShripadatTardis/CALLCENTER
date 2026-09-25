-- Session 5.1: Chat API enhancement — authoritative identity fields
-- docs/CALL_CENTRE_SESSION4_5_CHAT_PLAN.md §2/§5 (amended)
--
-- Extends call_center.chat_sessions with the newly-confirmed identity
-- fields from POST /api/v1/chat and GET /api/v1/chat/sessions[/{id}]
-- (Chat_Mode_API.docx, Chat_Sessions_API.docx, Chat_Transcript_API.docx).
-- Same access model as before: call_center stays un-exposed via
-- PostgREST; every operation goes through a call_center_chat_*
-- SECURITY DEFINER function granted to service_role only.
--
-- Naming note: `customer_id` (uuid, FK to call_center.customers) already
-- existed on chat_sessions from Session 4.5 and is reserved for THIS
-- app's own internal Customer 360 linkage (set only by chat ingestion,
-- §6 of the Session 5.1 prompt) — it is NOT the same thing as the
-- backend's own customer_id (a bank CIF string like "CIF003"). The
-- backend-supplied identity is stored separately as backend_customer_id /
-- backend_contact_id so the two concepts are never conflated.

alter table call_center.chat_sessions
  add column if not exists agent_name text,
  add column if not exists backend_customer_id text,
  add column if not exists backend_contact_id text,
  add column if not exists caller_name text,
  add column if not exists phone_number text,
  add column if not exists is_bank_customer boolean,
  add column if not exists upstream_status text,
  add column if not exists history_doc_id text;

-- ---------------------------------------------------------------------
-- Multi-source checkpoint state (was a hard id=1 singleton reserved
-- implicitly for voice; amended so Chat reconciliation can maintain its
-- own independent high-water-mark without interfering with Voice's).
-- ---------------------------------------------------------------------

alter table call_center.customer_aggregation_state
  drop constraint if exists customer_aggregation_state_singleton;

alter table call_center.customer_aggregation_state
  add column if not exists source text;

update call_center.customer_aggregation_state set source = 'voice' where source is null;

-- id was `int primary key default 1` (every row-less insert defaulted to
-- 1, which is what made it a singleton). Re-key the table on `source`
-- instead so a second, independent row ('chat') can exist without a PK
-- collision — `id` is dropped entirely since nothing outside this table
-- ever referenced it (only the two RPC functions below touch this
-- table, and neither used `id`).
alter table call_center.customer_aggregation_state
  drop constraint if exists customer_aggregation_state_pkey;

alter table call_center.customer_aggregation_state
  drop column if exists id;

alter table call_center.customer_aggregation_state
  alter column source set not null,
  alter column source set default 'voice';

alter table call_center.customer_aggregation_state
  add primary key (source);

insert into call_center.customer_aggregation_state (source, last_refreshed_through, updated_at)
values ('chat', null, now())
on conflict (source) do nothing;

create or replace function public.call_center_get_high_water_mark(p_source text default 'voice')
returns timestamptz language sql security definer set search_path = call_center, pg_temp as $$
  select last_refreshed_through from call_center.customer_aggregation_state where source = p_source;
$$;

create or replace function public.call_center_set_high_water_mark(p_iso timestamptz, p_source text default 'voice')
returns void language sql security definer set search_path = call_center, pg_temp as $$
  insert into call_center.customer_aggregation_state (source, last_refreshed_through, updated_at)
  values (p_source, p_iso, now())
  on conflict (source) do update set last_refreshed_through = excluded.last_refreshed_through, updated_at = now();
$$;

-- ---------------------------------------------------------------------
-- Chat session create/touch — extended to carry the newly-authoritative
-- identity fields. Backward-compatible: every new parameter defaults to
-- null, so an old caller passing only the original three still works.
-- Fields are refreshed non-destructively (coalesce onto the existing
-- value) so a later turn's null doesn't erase an earlier turn's known
-- value.
-- ---------------------------------------------------------------------

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
  p_history_doc_id text default null
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_session call_center.chat_sessions;
begin
  insert into call_center.chat_sessions (
    upstream_session_id, started_at, last_activity_at, status, created_by,
    agent_id, agent_name, backend_customer_id, backend_contact_id,
    caller_name, phone_number, is_bank_customer, upstream_status, history_doc_id
  ) values (
    p_upstream_session_id, p_now, p_now, 'active', p_created_by,
    p_agent_id, p_agent_name, p_backend_customer_id, p_backend_contact_id,
    p_caller_name, p_phone_number, p_is_bank_customer, p_upstream_status, p_history_doc_id
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
    history_doc_id = coalesce(excluded.history_doc_id, call_center.chat_sessions.history_doc_id)
  returning * into v_session;

  return to_jsonb(v_session);
end;
$$;

-- Refresh grants for every call_center_% function (idempotent — same
-- mechanism every prior migration in this schema used; a create-or-
-- replace with only appended defaulted params keeps the same OID and
-- its existing grants, but re-running this is a harmless no-op safety
-- net, not a sign anything actually changed).
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
