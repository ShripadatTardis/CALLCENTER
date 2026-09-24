-- Session 4: Customer 360 Foundation
-- docs/CALL_CENTRE_SESSION4_CUSTOMER360_PLAN.md §20
--
-- All tables are accessed ONLY via the service-role key from
-- src/server/customer360/supabaseCustomerRepository.ts (Vercel functions
-- under api/customers/*). The browser never queries these tables
-- directly (plan §14) — RLS below is deny-all defense in depth, not the
-- access-control mechanism itself.

create table if not exists customers (
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

create table if not exists customer_contact_points (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
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

create index if not exists customer_contact_points_customer_id_idx on customer_contact_points(customer_id);

create table if not exists customer360_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customer360_category_agents (
  category_id uuid not null references customer360_categories(id) on delete cascade,
  agent_id text not null,
  primary key (category_id, agent_id)
);

create index if not exists customer360_category_agents_agent_id_idx on customer360_category_agents(agent_id);

create table if not exists customer_interactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  contact_point_id uuid references customer_contact_points(id) on delete set null,
  interaction_id text not null,
  channel text not null default 'voice',
  direction text,
  agent_id text,
  agent_display_name text,
  -- Denormalized display/performance cache ONLY. Never used for
  -- authorization decisions — see src/server/customer360/authorizationService.ts.
  category_id uuid references customer360_categories(id) on delete set null,
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

create index if not exists customer_interactions_customer_id_started_at_idx on customer_interactions(customer_id, started_at desc);
create index if not exists customer_interactions_contact_point_id_idx on customer_interactions(contact_point_id);
create index if not exists customer_interactions_category_id_idx on customer_interactions(category_id);
create index if not exists customer_interactions_agent_id_idx on customer_interactions(agent_id);

create table if not exists role_customer360_categories (
  role text not null,
  category_id uuid not null references customer360_categories(id) on delete cascade,
  primary key (role, category_id)
);

create table if not exists role_customer360_access (
  role text primary key,
  all_categories boolean not null default false
);

-- Seed: call_center_head is the only role with all-access by default
-- (plan §10). Every other existing role gets no category rows until an
-- administrator explicitly grants them — fail-closed.
insert into role_customer360_access (role, all_categories)
values ('call_center_head', true)
on conflict (role) do nothing;

create table if not exists customer_aggregation_state (
  id int primary key default 1,
  last_refreshed_through timestamptz,
  updated_at timestamptz not null default now(),
  constraint customer_aggregation_state_singleton check (id = 1)
);

-- Deny-all RLS on every new table: these are accessed exclusively via
-- the service-role key, which bypasses RLS by design. This is defense
-- in depth against the anon key ever touching these tables by mistake,
-- not the access-control mechanism (plan §14/§20).
alter table customers enable row level security;
alter table customer_contact_points enable row level security;
alter table customer360_categories enable row level security;
alter table customer360_category_agents enable row level security;
alter table customer_interactions enable row level security;
alter table role_customer360_categories enable row level security;
alter table role_customer360_access enable row level security;
alter table customer_aggregation_state enable row level security;
