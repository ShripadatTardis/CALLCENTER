-- Session 4.5: Chat Console / Text Interaction Foundation
-- docs/CALL_CENTRE_SESSION4_5_CHAT_PLAN.md §5, §17
--
-- Extends the existing call_center schema (Session 4) with purpose-built
-- Chat persistence. Same access model as Customer 360: call_center stays
-- un-exposed via PostgREST; the only access path is a set of
-- public.call_center_chat_* SECURITY DEFINER functions, each granted to
-- service_role only.

create table if not exists call_center.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  upstream_session_id text not null unique,
  started_at timestamptz not null,
  last_activity_at timestamptz not null,
  status text not null default 'active',
  customer_id uuid references call_center.customers(id),
  agent_id text,
  created_by text,
  message_count int not null default 0,
  latest_intent text,
  latest_confidence numeric,
  latest_authenticated boolean,
  latest_data_source text,
  latest_detection_method text,
  latest_latency_ms int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_sessions_last_activity_at_idx on call_center.chat_sessions(last_activity_at desc);

create table if not exists call_center.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_session_id uuid not null references call_center.chat_sessions(id) on delete cascade,
  sequence int not null,
  role text not null,
  raw_text text not null,
  intent text,
  confidence numeric,
  authenticated boolean,
  data_source text,
  detection_method text,
  latency_ms int,
  created_at timestamptz not null default now(),
  constraint chat_messages_session_sequence_unique unique (chat_session_id, sequence)
);

create index if not exists chat_messages_chat_session_id_sequence_idx on call_center.chat_messages(chat_session_id, sequence);

alter table call_center.chat_sessions enable row level security;
alter table call_center.chat_messages enable row level security;

-- ---------------------------------------------------------------------
-- Access functions (public schema, SECURITY DEFINER, service_role only)
-- ---------------------------------------------------------------------

create or replace function public.call_center_chat_create_session(
  p_upstream_session_id text, p_now timestamptz, p_created_by text
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_session call_center.chat_sessions;
begin
  insert into call_center.chat_sessions (
    upstream_session_id, started_at, last_activity_at, status, created_by
  ) values (
    p_upstream_session_id, p_now, p_now, 'active', p_created_by
  )
  on conflict (upstream_session_id) do update set last_activity_at = excluded.last_activity_at
  returning * into v_session;

  return to_jsonb(v_session);
end;
$$;

create or replace function public.call_center_chat_get_session_by_upstream_id(p_upstream_session_id text)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select to_jsonb(s) from call_center.chat_sessions s where s.upstream_session_id = p_upstream_session_id;
$$;

create or replace function public.call_center_chat_get_session(p_id uuid)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select to_jsonb(s) from call_center.chat_sessions s where s.id = p_id;
$$;

create or replace function public.call_center_chat_append_message(
  p_session_id uuid, p_role text, p_raw_text text, p_now timestamptz,
  p_intent text, p_confidence numeric, p_authenticated boolean,
  p_data_source text, p_detection_method text, p_latency_ms int
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_seq int;
  v_message call_center.chat_messages;
  v_count int;
begin
  select coalesce(max(sequence), 0) + 1 into v_seq
    from call_center.chat_messages where chat_session_id = p_session_id;

  insert into call_center.chat_messages (
    chat_session_id, sequence, role, raw_text, created_at,
    intent, confidence, authenticated, data_source, detection_method, latency_ms
  ) values (
    p_session_id, v_seq, p_role, p_raw_text, p_now,
    p_intent, p_confidence, p_authenticated, p_data_source, p_detection_method, p_latency_ms
  ) returning * into v_message;

  select count(*) into v_count from call_center.chat_messages where chat_session_id = p_session_id;

  update call_center.chat_sessions set
    message_count = v_count,
    last_activity_at = p_now,
    updated_at = p_now,
    latest_intent = case when p_role = 'ai' then p_intent else latest_intent end,
    latest_confidence = case when p_role = 'ai' then p_confidence else latest_confidence end,
    latest_authenticated = case when p_role = 'ai' then p_authenticated else latest_authenticated end,
    latest_data_source = case when p_role = 'ai' then p_data_source else latest_data_source end,
    latest_detection_method = case when p_role = 'ai' then p_detection_method else latest_detection_method end,
    latest_latency_ms = case when p_role = 'ai' then p_latency_ms else latest_latency_ms end
  where id = p_session_id;

  return to_jsonb(v_message);
end;
$$;

create or replace function public.call_center_chat_close_session(p_session_id uuid)
returns void language sql security definer set search_path = call_center, pg_temp as $$
  update call_center.chat_sessions set status = 'closed', updated_at = now() where id = p_session_id;
$$;

create or replace function public.call_center_chat_list_sessions(p_page int, p_page_size int)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_total int; v_rows jsonb;
begin
  select count(*) into v_total from call_center.chat_sessions;

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows from (
    select * from call_center.chat_sessions
      order by last_activity_at desc
      limit p_page_size offset (p_page - 1) * p_page_size
  ) t;

  return jsonb_build_object('rows', v_rows, 'totalCount', v_total);
end;
$$;

create or replace function public.call_center_chat_list_messages(p_session_id uuid)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(m) order by m.sequence), '[]'::jsonb)
    from call_center.chat_messages m where m.chat_session_id = p_session_id;
$$;

-- Lock down every new call_center_chat_* function to service_role only.
-- Same mechanism as the Customer 360 migration; matches by name pattern
-- only, touches nothing else in AuditAI's public schema.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'call_center_chat_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
