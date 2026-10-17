-- =====================================================================
-- Session CMA-1B — minimal extension of CMA-1A's reconciliation
-- capability: ID-level + tracked-mutable-fact reconciliation (brief
-- §5), on top of CMA-1A's already-applied, count-only
-- call_center_cma_interaction_population_count().
--
-- Why a NEW migration file rather than revising the CMA-1A migration in
-- place (CMA-1A.1/1A.3's own precedent): the CMA-1A migration
-- (20261024000000_cma_interaction_base_facts.sql) has already been
-- APPLIED to production (Session CMA-1A.4) — it is no longer an
-- unapplied, freely-revisable file. This migration is purely additive
-- on top of it: one new, read-only, service_role-only RPC. No table,
-- no column, no constraint is added or changed. No CMA governance
-- table (cma_base_facts/cma_dimensions/etc.) is introduced — this
-- remains Interaction Base Facts work, not the CMA calculation engine.
--
-- NOT applied to the live database by this session (brief §9: "Do not
-- modify production interaction data" — this migration file is a
-- proposal, created and locally verified only, exactly as CMA-1A's own
-- first pass was).
--
-- call_center_cma_interaction_population_count() (CMA-1A, unchanged)
-- answers "how many rows, for this source+window" — sufficient to
-- detect a COUNT drift (the original Phase 3 626-vs-756 shape) but not
-- WHICH interactions are missing/unexpected, nor whether an existing
-- row's tracked facts have gone stale. This RPC answers those two
-- questions: it returns, for a source+window, every local row's
-- interaction_id plus the three tracked-mutable-fact columns this
-- session's reconciliation module compares against a fresh upstream
-- fetch (outcome, duration_seconds, escalation_trigger — the same three
-- CMA-1A's own test-scenario list already called out as the
-- representative "changed duration, outcome, ... and other mutable
-- attributes" set, deliberately NOT a full-row diff of every column).
-- =====================================================================

create or replace function public.call_center_cma_interaction_facts_for_window(
  p_source text, p_started_from timestamptz, p_started_to timestamptz
) returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'interactionId', interaction_id,
    'outcome', outcome,
    'durationSeconds', duration_seconds,
    'escalationTrigger', escalation_trigger
  )), '[]'::jsonb)
  from call_center.customer_interactions
  where (p_source is null or source = p_source)
    and (p_started_from is null or started_at >= p_started_from)
    and (p_started_to is null or started_at < p_started_to);
$$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'call_center_cma_interaction_facts_for_window'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- =====================================================================
-- END OF MIGRATION. Not applied to the live database by this session.
-- Session CMA-1B, provisional, additive-only on top of the already-
-- applied CMA-1A migration.
-- =====================================================================
