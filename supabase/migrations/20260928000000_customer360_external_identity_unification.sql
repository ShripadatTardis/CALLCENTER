-- Session 5.2: Customer Identity Unification
-- docs/CALL_CENTRE_SESSION4_CUSTOMER360_PLAN.md (Session 5.2 addendum).
-- Adds an explicit external-identity model so Customer 360 can converge
-- Chat and Voice on the same customer when the backend supplies an
-- authoritative customer_id/CIF, per the Session 5.2 prompt's target
-- model. Same access pattern as every prior call_center migration:
-- SECURITY DEFINER functions under public.call_center_*, granted to
-- service_role only via the existing name-pattern grant loop.
--
-- Applied to the live AuditAI project (dtbaczafdzgctkbqviod) via the
-- Supabase MCP; this file mirrors that applied migration for repo
-- history, per the same convention as every prior call_center migration.

create table if not exists call_center.customer_external_identities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references call_center.customers(id) on delete cascade,
  source text not null,
  identity_type text not null,
  identity_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_external_identities_unique unique (source, identity_type, identity_value)
);

create index if not exists customer_external_identities_customer_id_idx
  on call_center.customer_external_identities(customer_id);

-- Minimal audit/provenance record for a customer merge (Session 5.2
-- requirement: "record enough provenance/audit information to explain
-- the merge"). No existing table fits this shape, so a small dedicated
-- table is added rather than overloading source_meta-style jsonb
-- elsewhere.
create table if not exists call_center.customer_merge_log (
  id uuid primary key default gen_random_uuid(),
  survivor_customer_id uuid not null,
  loser_customer_id uuid not null,
  reason text not null,
  interactions_moved int not null default 0,
  contact_points_moved int not null default 0,
  campaign_targets_moved int not null default 0,
  external_identities_moved int not null default 0,
  merged_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Access functions
-- ---------------------------------------------------------------------

create or replace function public.call_center_find_customer_by_external_identity(
  p_source text, p_identity_type text, p_identity_value text
) returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select to_jsonb(c) from call_center.customers c
    join call_center.customer_external_identities ei on ei.customer_id = c.id
    where ei.source = p_source and ei.identity_type = p_identity_type and ei.identity_value = p_identity_value
    limit 1;
$$;

-- Attaches an authoritative external identity to a customer, idempotently
-- (on conflict on the (source, identity_type, identity_value) unique
-- constraint does nothing — the identity is already attached to exactly
-- the right customer or, if it collides with a DIFFERENT customer, that
-- collision must be resolved by call_center_merge_customers first, never
-- silently overwritten here). For identity_type = 'customer_id', also
-- refreshes the existing customers.source_customer_ref denormalized
-- display/campaign field (already read by the UI and campaignRunner.ts)
-- so this session's fix requires no change to either of those call sites.
create or replace function public.call_center_attach_external_identity(
  p_customer_id uuid, p_source text, p_identity_type text, p_identity_value text, p_now timestamptz
) returns void language plpgsql security definer set search_path = call_center, pg_temp as $$
begin
  insert into call_center.customer_external_identities (customer_id, source, identity_type, identity_value, created_at, updated_at)
    values (p_customer_id, p_source, p_identity_type, p_identity_value, p_now, p_now)
  on conflict (source, identity_type, identity_value) do nothing;

  if p_identity_type = 'customer_id' then
    update call_center.customers set source_customer_ref = p_identity_value, updated_at = p_now where id = p_customer_id;
  end if;
end;
$$;

-- Adds an additional (non-primary) contact point to an EXISTING
-- customer — distinct from call_center_create_customer_with_contact_point,
-- which always creates a brand-new customer. Used when an authoritative
-- external identity resolves to a customer that doesn't yet have this
-- phone attached (Session 5.2 behavior 1/4: "multiple phones for one
-- customer"). on conflict is a defensive no-op only: normalized_value is
-- globally unique per type, so a genuine collision here would mean the
-- phone already belongs to a DIFFERENT customer, which the resolver must
-- catch and merge before calling this — never silently reassigned here.
create or replace function public.call_center_add_contact_point_to_customer(
  p_customer_id uuid, p_type text, p_raw text, p_normalized text, p_now timestamptz
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_contact call_center.customer_contact_points;
begin
  insert into call_center.customer_contact_points (customer_id, type, raw_value, normalized_value, is_primary, first_seen, last_seen)
    values (p_customer_id, p_type, p_raw, p_normalized, false, p_now, p_now)
  on conflict (type, normalized_value) do update set last_seen = excluded.last_seen
  returning * into v_contact;
  return to_jsonb(v_contact);
end;
$$;

-- Creates a bare customer row with no contact point yet — the edge case
-- where an authoritative external identity (CIF) arrives with no
-- phone_number at all (e.g. a chat session keyed by contact_id only).
create or replace function public.call_center_create_customer(p_now timestamptz)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_customer call_center.customers;
begin
  insert into call_center.customers (
    display_name, source_customer_ref, first_seen, last_seen, total_interactions,
    inbound_count, outbound_count, channels, escalation_count, aggregation_version, aggregated_at
  ) values (null, null, p_now, p_now, 0, 0, 0, '{}', 0, 1, p_now)
  returning * into v_customer;
  return to_jsonb(v_customer);
end;
$$;

-- Deterministic, atomic, all-or-nothing customer merge (Session 5.2
-- behavior 3). Moves interactions, contact points, campaign targets, and
-- external identities from the loser to the survivor, verifies zero
-- orphaned references remain, records a provenance row, and ONLY THEN
-- deletes the loser — inside the same transaction, so a failed
-- verification raises an exception and the entire merge rolls back
-- (nothing partially applied), satisfying "delete duplicate customer
-- only after verification" as strictly as possible. Does NOT recompute
-- the survivor's aggregate itself — the caller does that afterward via
-- the existing call_center_recompute_customer_aggregate, per the
-- session's instruction to reuse existing aggregation logic rather than
-- hand-rolling a second copy of it here.
create or replace function public.call_center_merge_customers(
  p_survivor_id uuid, p_loser_id uuid, p_now timestamptz, p_reason text
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_interactions_moved int;
  v_contacts_moved int;
  v_targets_moved int;
  v_identities_moved int;
  v_orphan_check int;
  v_customer call_center.customers;
begin
  if p_survivor_id = p_loser_id then
    raise exception 'call_center_merge_customers: survivor and loser are the same customer (%)', p_survivor_id;
  end if;

  update call_center.customer_interactions set customer_id = p_survivor_id where customer_id = p_loser_id;
  get diagnostics v_interactions_moved = row_count;

  update call_center.customer_contact_points set customer_id = p_survivor_id where customer_id = p_loser_id;
  get diagnostics v_contacts_moved = row_count;

  update call_center.campaign_targets set customer_id = p_survivor_id where customer_id = p_loser_id;
  get diagnostics v_targets_moved = row_count;

  update call_center.customer_external_identities ei
    set customer_id = p_survivor_id
    where ei.customer_id = p_loser_id
      and not exists (
        select 1 from call_center.customer_external_identities ei2
        where ei2.customer_id = p_survivor_id
          and ei2.source = ei.source and ei2.identity_type = ei.identity_type and ei2.identity_value = ei.identity_value
      );
  get diagnostics v_identities_moved = row_count;
  delete from call_center.customer_external_identities where customer_id = p_loser_id;

  select count(*) into v_orphan_check from (
    select 1 from call_center.customer_interactions where customer_id = p_loser_id
    union all
    select 1 from call_center.customer_contact_points where customer_id = p_loser_id
    union all
    select 1 from call_center.campaign_targets where customer_id = p_loser_id
    union all
    select 1 from call_center.customer_external_identities where customer_id = p_loser_id
  ) t;
  if v_orphan_check > 0 then
    raise exception 'call_center_merge_customers: % orphaned rows remain referencing loser % after move; aborting merge', v_orphan_check, p_loser_id;
  end if;

  insert into call_center.customer_merge_log (
    survivor_customer_id, loser_customer_id, reason, interactions_moved, contact_points_moved,
    campaign_targets_moved, external_identities_moved, merged_at
  ) values (p_survivor_id, p_loser_id, p_reason, v_interactions_moved, v_contacts_moved, v_targets_moved, v_identities_moved, p_now);

  delete from call_center.customers where id = p_loser_id;

  update call_center.customers set updated_at = p_now where id = p_survivor_id returning * into v_customer;

  return jsonb_build_object(
    'survivor', to_jsonb(v_customer),
    'interactionsMoved', v_interactions_moved,
    'contactPointsMoved', v_contacts_moved,
    'campaignTargetsMoved', v_targets_moved,
    'externalIdentitiesMoved', v_identities_moved
  );
end;
$$;

-- Re-run the existing lock-down loop so the new call_center_* functions
-- above get the same service_role-only grant as every prior one. Touches
-- nothing outside the call_center_% name pattern.
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
