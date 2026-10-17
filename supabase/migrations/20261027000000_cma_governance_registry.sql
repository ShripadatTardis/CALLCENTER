-- Session CMA-2 — Central Measures and Dimensions Registry.
--
-- Implements the governance tables from docs/CMA_SCHEMA_PROPOSAL_v0_3_1.sql
-- Part 2/2A ("Tasks 2, 3 & 5: CMA governance tables") verbatim against
-- that corrected proposal — cma_base_facts, cma_dimensions,
-- cma_canonical_measures, cma_measures, cma_measure_dimensions,
-- cma_measure_base_facts, cma_chart_visualizations — plus the read-only
-- registry RPCs from Part 3, plus the additional list/governance-status
-- RPCs this session's brief (§7) asks for that the proposal's Part 3 did
-- not already cover.
--
-- Deliberately EXCLUDED (brief §11, "Not authorized"): any calculation
-- engine, evaluateCmaMeasure pipeline, or write path for application
-- callers. The registry is populated once, deterministically, by the
-- seed generated from docs/MASTER_MEASURES_REGISTER.csv
-- (.tooling/scripts/cma-registry-build.mjs ->
-- supabase/seed/cma_governance_registry_seed.sql) — there is no
-- `_upsert`/`_set` RPC exposed to any application API route in this
-- session; registry population is a one-time, re-runnable seed script
-- applied directly against a database by someone with migration access,
-- the same way every other project seed/reference data is handled.
--
-- NOT applied to the live database by this session — this migration and
-- its companion seed are created and statically verified only, per the
-- brief's explicit execution boundaries. CMA-1A/1B's customer_interactions
-- changes and call_center_sync_interaction are completely untouched.

-- =====================================================================
-- PART 1 — Governance tables (verbatim from CMA_SCHEMA_PROPOSAL_v0_3_1.sql
-- Part 2/2A; see that file for the full forward-FK-ordering rationale).
-- =====================================================================

create table if not exists call_center.cma_base_facts (
  id            text primary key,
  entity        text not null,
  field_name    text not null,
  data_type     text not null,
  source_table  text not null,
  description   text not null,
  created_at    timestamptz not null default now()
);

create table if not exists call_center.cma_dimensions (
  id                 text primary key,
  label              text not null,
  canonical_values   jsonb,
  normalization_rule text,
  mapping_source     text,
  created_at         timestamptz not null default now()
);

create table if not exists call_center.cma_canonical_measures (
  id                           text primary key,
  canonical_name               text not null,
  business_definition          text not null,
  measure_class                text not null check (measure_class in ('business_measure', 'mock_indicator')),
  governed_algorithm_status    text not null check (governed_algorithm_status in
                                  ('pending_decision', 'decided', 'unimplemented', 'mock', 'not_applicable')),
  governed_formula_ref         text,
  migration_reference_measure_id text,  -- no inline `references` here; FK added below once cma_measures exists.
  created_at                   timestamptz not null default now(),
  constraint cma_canonical_measures_mock_class_consistency
    check ( (measure_class = 'mock_indicator') = (governed_algorithm_status = 'mock') )
);

create table if not exists call_center.cma_measures (
  id                       text primary key,
  canonical_measure_id     text not null references call_center.cma_canonical_measures(id),
  formula_ref              text not null,
  eligible_population      text not null,
  numerator                text not null,
  denominator              text not null,
  zero_denominator_handling text not null,
  aggregation_method       text not null,
  depends_on_measures      text[],
  status                   text not null check (status in ('live', 'backend_gap', 'partial', 'awaiting_telemetry', 'mock')),
  created_at               timestamptz not null default now()
);

alter table call_center.cma_canonical_measures
  drop constraint if exists cma_canonical_measures_migration_reference_measure_id_fkey;
alter table call_center.cma_canonical_measures
  add constraint cma_canonical_measures_migration_reference_measure_id_fkey
  foreign key (migration_reference_measure_id) references call_center.cma_measures(id);

create table if not exists call_center.cma_measure_dimensions (
  measure_id   text not null references call_center.cma_measures(id),
  dimension_id text not null references call_center.cma_dimensions(id),
  primary key (measure_id, dimension_id)
);

create table if not exists call_center.cma_measure_base_facts (
  measure_id    text not null references call_center.cma_measures(id),
  base_fact_id  text not null references call_center.cma_base_facts(id),
  role          text not null check (role in ('numerator', 'denominator', 'eligibility_filter', 'grouping')),
  primary key (measure_id, base_fact_id, role)
);

-- ---------------------------------------------------------------------
-- cma_chart_visualizations — a chart's lighter-weight presentation
-- relationship (points at a canonical measure's population OR a raw
-- Base Fact count, never both). Verbatim from the proposal's Part 2A;
-- see CMA_DATA_MODEL_v0_3_1.md §5.2 for why a chart does not get its own
-- cma_canonical_measures row. A chart with a genuinely dynamic,
-- view-time-parameterized target (this session's seed build found
-- exactly one such case, matching the proposal's own documented
-- CHART-RT-01 gap) cannot be inserted here under this constraint — that
-- is a deliberate, disclosed limitation, not relaxed by this migration.
-- ---------------------------------------------------------------------

create table if not exists call_center.cma_chart_visualizations (
  id                              text primary key,
  chart_name                      text not null,
  visualizes_canonical_measure_id text references call_center.cma_canonical_measures(id),
  visualizes_base_fact_id         text references call_center.cma_base_facts(id),
  presentation_dimension_id       text references call_center.cma_dimensions(id),
  created_at                      timestamptz not null default now(),
  constraint cma_chart_visualizations_exactly_one_target
    check (
      (visualizes_canonical_measure_id is not null)::int +
      (visualizes_base_fact_id is not null)::int = 1
    )
);

alter table call_center.cma_base_facts enable row level security;
alter table call_center.cma_dimensions enable row level security;
alter table call_center.cma_canonical_measures enable row level security;
alter table call_center.cma_measures enable row level security;
alter table call_center.cma_measure_dimensions enable row level security;
alter table call_center.cma_measure_base_facts enable row level security;
alter table call_center.cma_chart_visualizations enable row level security;

-- =====================================================================
-- PART 2 — Governance read RPCs.
--
-- Single-item lookups are verbatim from CMA_SCHEMA_PROPOSAL_v0_3_1.sql
-- Part 3. The list/governance-status RPCs below are new in this session
-- — the brief's §7 ("Registry service and API") asks for list/coverage
-- operations the proposal's single-item lookups do not provide. All
-- read-only, exposing definitions only, never executing a calculation
-- (brief §7: "The API should expose definitions, not execute
-- calculations" — CMA-3's scope, untouched here).
-- =====================================================================

create or replace function public.call_center_cma_measure_get(p_measure_id text)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select to_jsonb(m) from call_center.cma_measures m where m.id = p_measure_id;
$$;

create or replace function public.call_center_cma_canonical_measure_get(p_canonical_id text)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select to_jsonb(cm) from call_center.cma_canonical_measures cm where cm.id = p_canonical_id;
$$;

create or replace function public.call_center_cma_measure_dimensions_list(p_measure_id text)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
    from call_center.cma_measure_dimensions md
    join call_center.cma_dimensions d on d.id = md.dimension_id
    where md.measure_id = p_measure_id;
$$;

create or replace function public.call_center_cma_dimension_get(p_dimension_id text)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select to_jsonb(d) from call_center.cma_dimensions d where d.id = p_dimension_id;
$$;

create or replace function public.call_center_cma_chart_visualization_get(p_chart_id text)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select to_jsonb(cv) from call_center.cma_chart_visualizations cv where cv.id = p_chart_id;
$$;

-- [NEW] List every canonical measure (small, fixed-size registry — no
-- pagination contract needed at this scale; see brief §7 open question
-- on groupKey pagination, explicitly out of scope for CMA-2).
create or replace function public.call_center_cma_canonical_measures_list()
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(cm) order by cm.id), '[]'::jsonb)
    from call_center.cma_canonical_measures cm;
$$;

-- [NEW] Every registered occurrence (implementation/display row) for one
-- canonical measure — the "Retrieve registered occurrences" operation.
create or replace function public.call_center_cma_canonical_measure_occurrences_list(p_canonical_id text)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]'::jsonb)
    from call_center.cma_measures m
    where m.canonical_measure_id = p_canonical_id;
$$;

-- [NEW] Every registered dimension.
create or replace function public.call_center_cma_dimensions_list()
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(d) order by d.id), '[]'::jsonb)
    from call_center.cma_dimensions d;
$$;

-- [NEW] Required/supporting Base Facts for one measure occurrence,
-- including each fact's role — "Retrieve required facts for a measure".
create or replace function public.call_center_cma_measure_base_facts_list(p_measure_id text)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'baseFact', to_jsonb(bf),
      'role', mbf.role
    ) order by bf.id, mbf.role), '[]'::jsonb)
    from call_center.cma_measure_base_facts mbf
    join call_center.cma_base_facts bf on bf.id = mbf.base_fact_id
    where mbf.measure_id = p_measure_id;
$$;

-- [NEW] Every chart visualization.
create or replace function public.call_center_cma_chart_visualizations_list()
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(cv) order by cv.id), '[]'::jsonb)
    from call_center.cma_chart_visualizations cv;
$$;

-- [NEW] Governance/readiness status report — the brief's "Report
-- governance/readiness status" operation: a compact coverage summary by
-- governed_algorithm_status, plus the raw counts behind it. Deliberately
-- does not expose per-row data (that's what the list/get RPCs above are
-- for) — this is purely a rollup.
create or replace function public.call_center_cma_registry_governance_status()
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select jsonb_build_object(
    'canonicalMeasureCount', (select count(*) from call_center.cma_canonical_measures),
    'measureOccurrenceCount', (select count(*) from call_center.cma_measures),
    'chartVisualizationCount', (select count(*) from call_center.cma_chart_visualizations),
    'dimensionCount', (select count(*) from call_center.cma_dimensions),
    'baseFactCount', (select count(*) from call_center.cma_base_facts),
    'canonicalMeasuresByStatus', (
      select coalesce(jsonb_object_agg(governed_algorithm_status, cnt), '{}'::jsonb)
      from (
        select governed_algorithm_status, count(*) as cnt
        from call_center.cma_canonical_measures
        group by governed_algorithm_status
      ) s
    ),
    'measureOccurrencesByStatus', (
      select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
      from (
        select status, count(*) as cnt
        from call_center.cma_measures
        group by status
      ) s
    )
  );
$$;

-- =====================================================================
-- PART 3 — Permission vocabulary (additive, same pattern as every prior
-- CMA/Session migration). Read-only registry access — administrators
-- only in this session, matching cma.sync.manage's own initial grant;
-- broader role grants (e.g. supervisor/analyst) are an additive,
-- non-breaking Role Management change for later, not decided here.
-- =====================================================================

insert into call_center.permissions (key, label, description, pillar) values
  ('cma.registry.view', 'View CMA Governance Registry', 'View the Central Measures Authority''s canonical measures, dimensions, base facts, and governance status.', 'Operationalize')
on conflict (key) do nothing;

insert into call_center.role_permissions (role_code, permission_key)
select 'administrator', key from call_center.permissions where key = 'cma.registry.view'
on conflict do nothing;

-- =====================================================================
-- PART 4 — lock down every new function the same way as every prior
-- migration in this project.
-- =====================================================================

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in (
        'call_center_cma_measure_get',
        'call_center_cma_canonical_measure_get',
        'call_center_cma_measure_dimensions_list',
        'call_center_cma_dimension_get',
        'call_center_cma_chart_visualization_get',
        'call_center_cma_canonical_measures_list',
        'call_center_cma_canonical_measure_occurrences_list',
        'call_center_cma_dimensions_list',
        'call_center_cma_measure_base_facts_list',
        'call_center_cma_chart_visualizations_list',
        'call_center_cma_registry_governance_status'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- =====================================================================
-- END OF MIGRATION. Not applied to the live database by this session.
-- Session CMA-2, corresponds to docs/CMA_SCHEMA_PROPOSAL_v0_3_1.sql
-- Parts 2/2A/3 plus this session's additional list/status RPCs.
-- =====================================================================
