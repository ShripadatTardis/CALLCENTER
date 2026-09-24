-- Session 4: Customer 360 Foundation
-- docs/CALL_CENTRE_SESSION4_CUSTOMER360_PLAN.md §20, amended per explicit
-- instruction to isolate all Call Centre objects in the AuditAI Supabase
-- project (dtbaczafdzgctkbqviod) under a dedicated `call_center` schema.
--
-- Access model: `call_center` is NOT added to PostgREST's exposed-schema
-- list (no MCP/tool access to that project setting from here, and this
-- is the more conservative default anyway). The ONLY access path is the
-- set of `public.call_center_*` SECURITY DEFINER functions below, each
-- individually re-granted to `service_role` only (revoked from
-- public/anon/authenticated). The application's Vercel functions call
-- these exclusively via supabase-js `.rpc()` with the service-role key
-- — the browser never reaches any of this, directly or via REST.

create schema if not exists call_center;
revoke all on schema call_center from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Tables (plan §20) — no cc_ prefix; the schema itself disambiguates.
-- ---------------------------------------------------------------------

create table if not exists call_center.customers (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  source_customer_ref text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  total_interactions int not null default 0,
  inbound_count int not null default 0,
  outbound_count int not null default 0,
  latest_intent text,
  latest_outcome text,
  latest_sentiment_label text,
  latest_sentiment_score numeric,
  escalation_count int not null default 0,
  channels text[] not null default '{}',
  latest_agent_id text,
  latest_agent_display_name text,
  auth_summary jsonb,
  aggregation_version int not null default 1,
  aggregated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists call_center.customer_contact_points (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references call_center.customers(id) on delete cascade,
  type text not null,
  raw_value text not null,
  normalized_value text not null,
  is_primary boolean not null default true,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_contact_points_type_normalized_unique unique (type, normalized_value)
);

create index if not exists customer_contact_points_customer_id_idx on call_center.customer_contact_points(customer_id);

create table if not exists call_center.customer360_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists call_center.customer360_category_agents (
  category_id uuid not null references call_center.customer360_categories(id) on delete cascade,
  agent_id text not null,
  primary key (category_id, agent_id)
);

create index if not exists customer360_category_agents_agent_id_idx on call_center.customer360_category_agents(agent_id);

create table if not exists call_center.customer_interactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references call_center.customers(id) on delete cascade,
  contact_point_id uuid references call_center.customer_contact_points(id) on delete set null,
  interaction_id text not null,
  channel text not null default 'voice',
  direction text,
  agent_id text,
  agent_display_name text,
  -- Denormalized display/performance cache ONLY. Never used for
  -- authorization decisions — resolved live in
  -- call_center_list_interactions / call_center_list_customers below.
  category_id uuid references call_center.customer360_categories(id) on delete set null,
  started_at timestamptz not null,
  duration_seconds int,
  intent text,
  outcome text,
  sentiment_score numeric,
  was_authenticated boolean,
  escalation_trigger text,
  campaign_name text,
  recording_available boolean not null default false,
  source text not null,
  ingested_at timestamptz not null default now(),
  constraint customer_interactions_source_interaction_unique unique (source, interaction_id)
);

create index if not exists customer_interactions_customer_id_started_at_idx on call_center.customer_interactions(customer_id, started_at desc);
create index if not exists customer_interactions_contact_point_id_idx on call_center.customer_interactions(contact_point_id);
create index if not exists customer_interactions_category_id_idx on call_center.customer_interactions(category_id);
create index if not exists customer_interactions_agent_id_idx on call_center.customer_interactions(agent_id);

create table if not exists call_center.role_customer360_categories (
  role text not null,
  category_id uuid not null references call_center.customer360_categories(id) on delete cascade,
  primary key (role, category_id)
);

create table if not exists call_center.role_customer360_access (
  role text primary key,
  all_categories boolean not null default false
);

-- Seed: call_center_head is the only role with all-access by default
-- (plan §10). Every other existing role gets no category rows until an
-- administrator explicitly grants them — fail-closed.
insert into call_center.role_customer360_access (role, all_categories)
values ('call_center_head', true)
on conflict (role) do nothing;

create table if not exists call_center.customer_aggregation_state (
  id int primary key default 1,
  last_refreshed_through timestamptz,
  updated_at timestamptz not null default now(),
  constraint customer_aggregation_state_singleton check (id = 1)
);

-- Deny-all RLS on every table: defense in depth. The SECURITY DEFINER
-- functions below run as their owner (the migration role), which in
-- Supabase-managed Postgres has BYPASSRLS, so this does not block the
-- sanctioned access path — it blocks any other.
alter table call_center.customers enable row level security;
alter table call_center.customer_contact_points enable row level security;
alter table call_center.customer360_categories enable row level security;
alter table call_center.customer360_category_agents enable row level security;
alter table call_center.customer_interactions enable row level security;
alter table call_center.role_customer360_categories enable row level security;
alter table call_center.role_customer360_access enable row level security;
alter table call_center.customer_aggregation_state enable row level security;

-- ---------------------------------------------------------------------
-- Access functions (public schema, SECURITY DEFINER, service_role only)
-- ---------------------------------------------------------------------

create or replace function public.call_center_get_customer(p_id uuid)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select to_jsonb(c) from call_center.customers c where c.id = p_id;
$$;

create or replace function public.call_center_find_contact_point(p_type text, p_normalized text)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select to_jsonb(cp) from call_center.customer_contact_points cp
    where cp.type = p_type and cp.normalized_value = p_normalized limit 1;
$$;

create or replace function public.call_center_list_contact_points(p_customer_id uuid)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(cp)), '[]'::jsonb)
    from call_center.customer_contact_points cp where cp.customer_id = p_customer_id;
$$;

create or replace function public.call_center_create_customer_with_contact_point(
  p_type text, p_raw text, p_normalized text, p_display_name text, p_now timestamptz
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_customer call_center.customers;
  v_contact call_center.customer_contact_points;
begin
  insert into call_center.customers (
    display_name, source_customer_ref, first_seen, last_seen, total_interactions,
    inbound_count, outbound_count, channels, escalation_count, aggregation_version, aggregated_at
  ) values (p_display_name, null, p_now, p_now, 0, 0, 0, '{}', 0, 1, p_now)
  returning * into v_customer;

  insert into call_center.customer_contact_points (
    customer_id, type, raw_value, normalized_value, is_primary, first_seen, last_seen
  ) values (v_customer.id, p_type, p_raw, p_normalized, true, p_now, p_now)
  returning * into v_contact;

  return jsonb_build_object('customer', to_jsonb(v_customer), 'contactPoint', to_jsonb(v_contact));
end;
$$;

create or replace function public.call_center_touch_contact_point(p_id uuid, p_seen_at timestamptz)
returns void language sql security definer set search_path = call_center, pg_temp as $$
  update call_center.customer_contact_points
    set last_seen = p_seen_at, updated_at = now() where id = p_id;
$$;

create or replace function public.call_center_upsert_interaction(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_existing_id uuid;
  v_category_id uuid;
  v_new_id uuid;
  v_agent_id text := p_payload->>'agentId';
begin
  select id into v_existing_id from call_center.customer_interactions
    where source = p_payload->>'source' and interaction_id = p_payload->>'interactionId';
  if v_existing_id is not null then
    return jsonb_build_object('inserted', false, 'id', v_existing_id);
  end if;

  if v_agent_id is not null then
    select category_id into v_category_id
      from call_center.customer360_category_agents where agent_id = v_agent_id limit 1;
  end if;

  insert into call_center.customer_interactions (
    customer_id, contact_point_id, interaction_id, channel, direction, agent_id, agent_display_name,
    category_id, started_at, duration_seconds, intent, outcome, sentiment_score, was_authenticated,
    escalation_trigger, campaign_name, recording_available, source
  ) values (
    (p_payload->>'customerId')::uuid,
    nullif(p_payload->>'contactPointId', '')::uuid,
    p_payload->>'interactionId',
    coalesce(p_payload->>'channel', 'voice'),
    p_payload->>'direction',
    v_agent_id,
    p_payload->>'agentDisplayName',
    v_category_id,
    (p_payload->>'startedAt')::timestamptz,
    nullif(p_payload->>'durationSeconds', '')::int,
    p_payload->>'intent',
    p_payload->>'outcome',
    nullif(p_payload->>'sentimentScore', '')::numeric,
    (p_payload->>'wasAuthenticated')::boolean,
    p_payload->>'escalationTrigger',
    p_payload->>'campaignName',
    coalesce((p_payload->>'recordingAvailable')::boolean, false),
    p_payload->>'source'
  ) returning id into v_new_id;

  return jsonb_build_object('inserted', true, 'id', v_new_id);
end;
$$;

create or replace function public.call_center_list_interactions(
  p_customer_id uuid, p_page int, p_page_size int, p_agent_ids text[], p_all boolean
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_total int; v_rows jsonb;
begin
  select count(*) into v_total from call_center.customer_interactions ci
    where ci.customer_id = p_customer_id and (p_all or ci.agent_id = any(p_agent_ids));

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows from (
    select * from call_center.customer_interactions ci
      where ci.customer_id = p_customer_id and (p_all or ci.agent_id = any(p_agent_ids))
      order by ci.started_at desc
      limit p_page_size offset (p_page - 1) * p_page_size
  ) t;

  return jsonb_build_object('rows', v_rows, 'totalCount', v_total);
end;
$$;

create or replace function public.call_center_list_all_interactions(
  p_customer_id uuid, p_agent_ids text[], p_all boolean
) returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(ci)), '[]'::jsonb) from call_center.customer_interactions ci
    where ci.customer_id = p_customer_id and (p_all or ci.agent_id = any(p_agent_ids));
$$;

create or replace function public.call_center_recompute_customer_aggregate(p_customer_id uuid, p_now timestamptz)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_customer call_center.customers;
  v_first timestamptz; v_last timestamptz; v_total int; v_inbound int; v_outbound int; v_escalation int;
  v_channels text[];
  v_latest record;
  v_ever_auth boolean; v_last_auth timestamptz; v_version int;
begin
  select min(started_at), max(started_at), count(*),
         count(*) filter (where direction = 'inbound'),
         count(*) filter (where direction = 'outbound'),
         count(*) filter (where escalation_trigger is not null),
         coalesce(array_agg(distinct channel), '{}')
    into v_first, v_last, v_total, v_inbound, v_outbound, v_escalation, v_channels
    from call_center.customer_interactions where customer_id = p_customer_id;

  select intent, outcome, sentiment_score, agent_id, agent_display_name into v_latest
    from call_center.customer_interactions
    where customer_id = p_customer_id
    order by started_at desc limit 1;

  select bool_or(was_authenticated is true) into v_ever_auth
    from call_center.customer_interactions where customer_id = p_customer_id;

  select max(started_at) into v_last_auth
    from call_center.customer_interactions
    where customer_id = p_customer_id and was_authenticated is true;

  select aggregation_version into v_version from call_center.customers where id = p_customer_id;

  update call_center.customers set
    first_seen = coalesce(v_first, p_now),
    last_seen = coalesce(v_last, p_now),
    total_interactions = coalesce(v_total, 0),
    inbound_count = coalesce(v_inbound, 0),
    outbound_count = coalesce(v_outbound, 0),
    latest_intent = v_latest.intent,
    latest_outcome = v_latest.outcome,
    latest_sentiment_score = v_latest.sentiment_score,
    escalation_count = coalesce(v_escalation, 0),
    channels = coalesce(v_channels, '{}'),
    latest_agent_id = v_latest.agent_id,
    latest_agent_display_name = v_latest.agent_display_name,
    auth_summary = jsonb_build_object('everAuthenticated', coalesce(v_ever_auth, false), 'lastAuthenticatedAt', v_last_auth),
    aggregation_version = coalesce(v_version, 0) + 1,
    aggregated_at = p_now,
    updated_at = p_now
  where id = p_customer_id
  returning * into v_customer;

  return to_jsonb(v_customer);
end;
$$;

create or replace function public.call_center_list_customers(
  p_search text, p_agent_ids text[], p_all boolean, p_page int, p_page_size int
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_total int; v_rows jsonb; v_visible uuid[];
begin
  if not p_all then
    select coalesce(array_agg(distinct customer_id), '{}') into v_visible
      from call_center.customer_interactions where agent_id = any(p_agent_ids);
    if v_visible is null or array_length(v_visible, 1) is null then
      return jsonb_build_object('rows', '[]'::jsonb, 'totalCount', 0);
    end if;
  end if;

  select count(*) into v_total from call_center.customers c
    where (p_all or c.id = any(v_visible))
      and (p_search is null or c.display_name ilike '%' || p_search || '%');

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows from (
    select * from call_center.customers c
      where (p_all or c.id = any(v_visible))
        and (p_search is null or c.display_name ilike '%' || p_search || '%')
      order by c.last_seen desc
      limit p_page_size offset (p_page - 1) * p_page_size
  ) t;

  return jsonb_build_object('rows', v_rows, 'totalCount', v_total);
end;
$$;

create or replace function public.call_center_list_categories()
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.name), '[]'::jsonb) from call_center.customer360_categories t;
$$;

create or replace function public.call_center_get_category_agent_map()
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_object_agg(agent_id, category_id), '{}'::jsonb)
    from call_center.customer360_category_agents;
$$;

create or replace function public.call_center_upsert_category_for_agent(p_agent_id text, p_category_name text)
returns void language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_cat_id uuid;
begin
  if exists (select 1 from call_center.customer360_category_agents where agent_id = p_agent_id) then
    return;
  end if;
  insert into call_center.customer360_categories (name, description, active)
    values (p_category_name, null, true) returning id into v_cat_id;
  insert into call_center.customer360_category_agents (category_id, agent_id) values (v_cat_id, p_agent_id);
end;
$$;

create or replace function public.call_center_get_role_access(p_role text)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_all boolean; v_ids uuid[];
begin
  select all_categories into v_all from call_center.role_customer360_access where role = p_role;
  if coalesce(v_all, false) then
    return jsonb_build_object('role', p_role, 'allCategories', true, 'categoryIds', '[]'::jsonb);
  end if;
  select coalesce(array_agg(category_id), '{}') into v_ids
    from call_center.role_customer360_categories where role = p_role;
  return jsonb_build_object('role', p_role, 'allCategories', false, 'categoryIds', to_jsonb(v_ids));
end;
$$;

create or replace function public.call_center_get_high_water_mark()
returns timestamptz language sql security definer set search_path = call_center, pg_temp as $$
  select last_refreshed_through from call_center.customer_aggregation_state where id = 1;
$$;

create or replace function public.call_center_set_high_water_mark(p_iso timestamptz)
returns void language sql security definer set search_path = call_center, pg_temp as $$
  insert into call_center.customer_aggregation_state (id, last_refreshed_through, updated_at)
  values (1, p_iso, now())
  on conflict (id) do update set last_refreshed_through = excluded.last_refreshed_through, updated_at = now();
$$;

create or replace function public.call_center_refresh_interaction_category_cache(p_agent_id text, p_category_id uuid)
returns int language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_count int;
begin
  update call_center.customer_interactions set category_id = p_category_id where agent_id = p_agent_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Lock down every call_center_* function to service_role only. Runs
-- last, after all functions above exist, and touches nothing outside
-- this exact name pattern — never anything else in AuditAI's public
-- schema.
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
