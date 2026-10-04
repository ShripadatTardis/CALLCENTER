-- Session 14.1 — User Management, RBAC & Audit Foundation.
--
-- Architecture: Supabase Auth is the (replaceable) authentication/identity
-- provider only. This schema is the Call Centre's own, fully app-owned
-- authorization model — users/membership, roles, permissions, and audit —
-- deliberately decoupled from auth.users' own primary key via an
-- (identity_provider, identity_subject) bridge, so a future IdP swap never
-- requires redesigning roles/permissions. No table here references
-- auth.users directly.
--
-- Sequencing matches the approved plan: permissions first (derived from
-- real, already-implemented capabilities only), then roles, then the
-- role->permission matrix — never the reverse. Every role_permissions row
-- below is justified by the role's real intended capability, never granted
-- merely because the role's name implies it.
--
-- No personal email/identity appears anywhere in this file. Bootstrapping
-- the first Administrator is a separate, undocumented-in-source one-time
-- operational step performed after this migration applies.
--
-- Applied to the live AuditAI project (dtbaczafdzgctkbqviod) via the
-- Supabase MCP; this file mirrors that applied migration for repo history.

create table if not exists call_center.permissions (
  key text primary key,
  label text not null,
  description text,
  pillar text not null check (pillar in ('Observe','Control','Operationalize','Improve','Measure','Govern'))
);

create table if not exists call_center.roles (
  code text primary key,
  label text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists call_center.role_permissions (
  role_code text not null references call_center.roles(code) on delete cascade,
  permission_key text not null references call_center.permissions(key) on delete cascade,
  primary key (role_code, permission_key)
);

-- Provider-neutral Call Centre identity. id is this app's own uuid, never
-- auth.users.id directly -- the (identity_provider, identity_subject) pair
-- is the only link to whichever identity provider actually authenticated
-- the person.
create table if not exists call_center.user_profiles (
  id uuid primary key default gen_random_uuid(),
  identity_provider text not null default 'supabase_auth',
  identity_subject text not null,
  email text not null,
  display_name text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (identity_provider, identity_subject)
);

create table if not exists call_center.user_roles (
  user_id uuid not null references call_center.user_profiles(id) on delete cascade,
  role_code text not null references call_center.roles(code) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references call_center.user_profiles(id),
  primary key (user_id, role_code)
);

-- Cross-cutting security/RBAC audit log. Separate from the existing
-- domain-specific call_center.campaign_audit_events (Campaign History),
-- which is untouched -- Campaign lifecycle actions continue writing there
-- AND now also emit a corresponding row here for the same action.
create table if not exists call_center.audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('user','system','cron')),
  actor_user_id uuid references call_center.user_profiles(id),
  actor_label text,
  action text not null,
  resource_type text,
  resource_id text,
  result text not null check (result in ('success','denied','error')),
  metadata jsonb,
  request_id text,
  source text
);
create index if not exists audit_events_occurred_at_idx on call_center.audit_events (occurred_at desc);
create index if not exists audit_events_actor_user_idx on call_center.audit_events (actor_user_id);

alter table call_center.permissions enable row level security;
alter table call_center.roles enable row level security;
alter table call_center.role_permissions enable row level security;
alter table call_center.user_profiles enable row level security;
alter table call_center.user_roles enable row level security;
alter table call_center.audit_events enable row level security;

-- ===== Permission vocabulary (derived from real, already-implemented
-- capabilities confirmed during Session 14.1 discovery -- not speculative) =====
insert into call_center.permissions (key, label, description, pillar) values
  ('dashboard.view', 'View Dashboard', 'View the operational Dashboard home.', 'Observe'),
  ('live.view', 'View Live View', 'View real-time active call activity.', 'Observe'),
  ('calls.view', 'View Calls', 'View Call Logs and call detail.', 'Observe'),
  ('calls.recording.view', 'View Call Recordings', 'Access call recording audio.', 'Observe'),
  ('chat.view', 'View Chat', 'View Chat Logs and chat session detail.', 'Observe'),
  ('customers.view', 'View Customers', 'View Customer 360 profiles and interaction history.', 'Observe'),
  ('customers.activity.create', 'Create Customer Activity', 'Log a new Customer 360 activity/diary entry.', 'Control'),
  ('customers.activity.update', 'Update Customer Activity', 'Change the status of an existing Customer 360 activity.', 'Control'),
  ('calls.initiate', 'Initiate Call', 'Trigger an outbound AI call.', 'Control'),
  ('campaigns.view', 'View Campaigns', 'View Outbound Campaigns and their detail.', 'Operationalize'),
  ('campaigns.create', 'Create Campaign', 'Create a new outbound campaign.', 'Operationalize'),
  ('campaigns.edit', 'Edit Campaign Configuration', 'Create/update a campaign configuration version.', 'Operationalize'),
  ('campaigns.start', 'Start Campaign', 'Transition a campaign to running.', 'Operationalize'),
  ('campaigns.pause', 'Pause Campaign', 'Pause a running campaign.', 'Operationalize'),
  ('campaigns.resume', 'Resume Campaign', 'Resume a paused campaign.', 'Operationalize'),
  ('campaigns.stop', 'Stop Campaign', 'Stop a campaign.', 'Operationalize'),
  ('campaigns.targets.manage', 'Manage Campaign Targets', 'Add, amend, hold/release, skip, or retry campaign targets.', 'Operationalize'),
  ('agents.view', 'View AI Agents', 'View the AI Agents roster and agent detail.', 'Improve'),
  ('analytics.view', 'View Analytics', 'View Analytics dashboards.', 'Measure'),
  ('ratios.view', 'View Ratios', 'View Ratio Explorer and ratio population drill-down.', 'Measure'),
  ('users.view', 'View Users', 'View the User Management roster.', 'Govern'),
  ('users.manage', 'Manage Users', 'Change user status and role assignments.', 'Govern'),
  ('roles.view', 'View Roles', 'View the Role Management matrix.', 'Govern'),
  ('roles.manage', 'Manage Roles', 'Edit role/permission assignments.', 'Govern'),
  ('audit.view', 'View Audit Trail', 'View the security/operational audit trail.', 'Govern')
on conflict (key) do nothing;

-- ===== Roles (defined only after the permission vocabulary above) =====
insert into call_center.roles (code, label, description) values
  ('administrator', 'Administrator', 'Full access, including User Management, Role Management, and the Audit Trail.'),
  ('supervisor', 'Supervisor', 'Full operational access (Observe, Control, Campaign lifecycle, Customer activities) plus read-only visibility into Users and Audit. Cannot manage users or roles.'),
  ('operator', 'Operator', 'Front-line access: Observe, initiate calls, log Customer 360 activities, view Campaigns. No campaign-mutation or administrative access.'),
  ('analyst', 'Analyst', 'Read-only access to Observe, Analytics, Ratios, and AI Agents. No mutations.'),
  ('qa_reviewer', 'QA Reviewer', 'Reviews calls, recordings, chat sessions, and AI Agents. No mutations.'),
  ('read_only', 'Read Only', 'Broad view-only access across Observe, Campaigns, AI Agents, and Measure. No recordings, no activity logging, no administrative access.')
on conflict (code) do nothing;

-- ===== role_permissions -- each row justified by real intended capability =====
insert into call_center.role_permissions (role_code, permission_key)
select 'administrator', key from call_center.permissions
on conflict do nothing;

insert into call_center.role_permissions (role_code, permission_key) values
  ('supervisor','dashboard.view'), ('supervisor','live.view'), ('supervisor','calls.view'),
  ('supervisor','calls.recording.view'), ('supervisor','chat.view'), ('supervisor','customers.view'),
  ('supervisor','customers.activity.create'), ('supervisor','customers.activity.update'), ('supervisor','calls.initiate'),
  ('supervisor','campaigns.view'), ('supervisor','campaigns.create'), ('supervisor','campaigns.edit'),
  ('supervisor','campaigns.start'), ('supervisor','campaigns.pause'), ('supervisor','campaigns.resume'),
  ('supervisor','campaigns.stop'), ('supervisor','campaigns.targets.manage'), ('supervisor','agents.view'),
  ('supervisor','analytics.view'), ('supervisor','ratios.view'), ('supervisor','users.view'), ('supervisor','audit.view'),

  ('operator','dashboard.view'), ('operator','live.view'), ('operator','calls.view'), ('operator','chat.view'),
  ('operator','customers.view'), ('operator','calls.initiate'), ('operator','customers.activity.create'),
  ('operator','customers.activity.update'), ('operator','campaigns.view'),

  ('analyst','dashboard.view'), ('analyst','live.view'), ('analyst','calls.view'), ('analyst','chat.view'),
  ('analyst','customers.view'), ('analyst','agents.view'), ('analyst','analytics.view'), ('analyst','ratios.view'),

  ('qa_reviewer','dashboard.view'), ('qa_reviewer','calls.view'), ('qa_reviewer','calls.recording.view'),
  ('qa_reviewer','chat.view'), ('qa_reviewer','agents.view'),

  ('read_only','dashboard.view'), ('read_only','live.view'), ('read_only','calls.view'), ('read_only','chat.view'),
  ('read_only','customers.view'), ('read_only','campaigns.view'), ('read_only','agents.view'),
  ('read_only','analytics.view'), ('read_only','ratios.view')
on conflict do nothing;

-- Legacy-compatibility bridge (documented, not a security boundary): the
-- existing advisory x-user-role / role_customer360_access read-filtering
-- system is preserved as-is this session (see plan amendment #8). Seed an
-- 'administrator' row mirroring the existing 'call_center_head' row so a
-- newly-provisioned real Administrator isn't silently locked out of
-- Customer360 reads. Follow-up (documented in the session doc, not done
-- here): replace this client-claimed header with server-derived
-- category/access context computed from the verified authenticated user.
insert into call_center.role_customer360_access (role, all_categories)
values ('administrator', true)
on conflict (role) do nothing;

-- ===== Audited RPCs (mirrors the existing campaigns "audited RPC" pattern) =====

create or replace function call_center.record_audit_event(
  p_actor_type text,
  p_actor_user_id uuid,
  p_actor_label text,
  p_action text,
  p_resource_type text,
  p_resource_id text,
  p_result text,
  p_metadata jsonb,
  p_request_id text,
  p_source text
) returns uuid
language sql
security definer
set search_path = call_center, pg_temp
as $$
  insert into call_center.audit_events (
    actor_type, actor_user_id, actor_label, action, resource_type, resource_id, result, metadata, request_id, source
  ) values (
    p_actor_type, p_actor_user_id, p_actor_label, p_action, p_resource_type, p_resource_id, p_result, p_metadata, p_request_id, p_source
  )
  returning id;
$$;

create or replace function call_center.get_user_by_identity(p_provider text, p_subject text)
returns call_center.user_profiles
language sql
security definer
set search_path = call_center, pg_temp
as $$
  select * from call_center.user_profiles
  where identity_provider = p_provider and identity_subject = p_subject
  limit 1;
$$;

create or replace function call_center.get_user_roles(p_user_id uuid)
returns setof text
language sql
security definer
set search_path = call_center, pg_temp
as $$
  select role_code from call_center.user_roles where user_id = p_user_id;
$$;

create or replace function call_center.get_effective_permissions(p_user_id uuid)
returns setof text
language sql
security definer
set search_path = call_center, pg_temp
as $$
  select distinct rp.permission_key
  from call_center.user_roles ur
  join call_center.role_permissions rp on rp.role_code = ur.role_code
  where ur.user_id = p_user_id;
$$;

create or replace function call_center.assign_role(p_user_id uuid, p_role_code text, p_actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = call_center, pg_temp
as $$
begin
  insert into call_center.user_roles (user_id, role_code, assigned_by)
  values (p_user_id, p_role_code, p_actor_user_id)
  on conflict (user_id, role_code) do nothing;

  perform call_center.record_audit_event(
    'user', p_actor_user_id, null, 'role.assigned', 'user', p_user_id::text,
    'success', jsonb_build_object('role_code', p_role_code), null, null
  );
end;
$$;

create or replace function call_center.remove_role(p_user_id uuid, p_role_code text, p_actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = call_center, pg_temp
as $$
begin
  delete from call_center.user_roles where user_id = p_user_id and role_code = p_role_code;

  perform call_center.record_audit_event(
    'user', p_actor_user_id, null, 'role.removed', 'user', p_user_id::text,
    'success', jsonb_build_object('role_code', p_role_code), null, null
  );
end;
$$;

create or replace function call_center.set_user_status(p_user_id uuid, p_status text, p_actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = call_center, pg_temp
as $$
begin
  update call_center.user_profiles set status = p_status, updated_at = now() where id = p_user_id;

  perform call_center.record_audit_event(
    'user', p_actor_user_id, null, 'user.status_changed', 'user', p_user_id::text,
    'success', jsonb_build_object('status', p_status), null, null
  );
end;
$$;

revoke all on function call_center.record_audit_event(text, uuid, text, text, text, text, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function call_center.get_user_by_identity(text, text) from public, anon, authenticated;
revoke all on function call_center.get_user_roles(uuid) from public, anon, authenticated;
revoke all on function call_center.get_effective_permissions(uuid) from public, anon, authenticated;
revoke all on function call_center.assign_role(uuid, text, uuid) from public, anon, authenticated;
revoke all on function call_center.remove_role(uuid, text, uuid) from public, anon, authenticated;
revoke all on function call_center.set_user_status(uuid, text, uuid) from public, anon, authenticated;

grant execute on function call_center.record_audit_event(text, uuid, text, text, text, text, text, jsonb, text, text) to service_role;
grant execute on function call_center.get_user_by_identity(text, text) to service_role;
grant execute on function call_center.get_user_roles(uuid) to service_role;
grant execute on function call_center.get_effective_permissions(uuid) to service_role;
grant execute on function call_center.assign_role(uuid, text, uuid) to service_role;
grant execute on function call_center.remove_role(uuid, text, uuid) to service_role;
grant execute on function call_center.set_user_status(uuid, text, uuid) to service_role;
