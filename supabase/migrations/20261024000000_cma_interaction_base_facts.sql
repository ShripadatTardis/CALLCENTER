-- =====================================================================
-- Session CMA-1A — Interaction Base Facts Foundation
-- Implements ONLY Part 1 ("Task 1: Interaction population and
-- synchronization") of docs/CMA_SCHEMA_PROPOSAL_v0_3_1.sql, verbatim
-- against the real schema of call_center.customer_interactions as it
-- exists in production (project dtbaczafdzgctkbqviod) at the time this
-- migration was authored — verified read-only via Supabase MCP before
-- writing this file (see docs/SESSION_CMA_1A_INTERACTION_BASE_FACTS.md
-- for the exact verification queries and their output).
--
-- Deliberately EXCLUDED from this migration (CMA-1A boundaries, brief
-- §7): the cma_base_facts / cma_dimensions / cma_canonical_measures /
-- cma_measures / cma_measure_dimensions / cma_measure_base_facts /
-- cma_chart_visualizations governance tables from
-- CMA_SCHEMA_PROPOSAL_v0_3_1.sql Parts 2/2A/3 — those are explicitly
-- "CMA governance tables" / "CMA calculation engine" work, out of scope
-- for this session. This migration touches ONLY
-- call_center.customer_interactions (additive) plus two new,
-- service_role-only RPCs.
--
-- Real schema facts confirmed before writing this file (differ in one
-- place from what CMA_SCHEMA_PROPOSAL_v0_3_1.sql assumed — noted below):
--   customer_interactions.customer_id: uuid NOT NULL, FK
--     customer_interactions_customer_id_fkey -> call_center.customers(id)
--     ON DELETE CASCADE (the proposal assumed/targeted "ON DELETE SET
--     NULL" as the end state -- CASCADE is the real current action,
--     confirmed via pg_constraint, and is exactly what this migration
--     changes).
--   Unique constraint: customer_interactions_source_interaction_unique
--     UNIQUE (source, interaction_id) -- unchanged by this migration,
--     exactly as the brief requires ("Preserve the existing (source,
--     interaction_id) uniqueness constraint").
--   fcr / intent_confidence / campaign_id / last_synced_at /
--     ingestion_path: none of these columns exist yet -- confirmed via
--     information_schema.columns. All five are newly added here.
--   call_center.customer360_category_agents(agent_id text,
--     category_id uuid): confirmed to exist with this exact shape,
--     matching the sync RPC's category lookup.
--   call_center.campaigns(id uuid): confirmed to exist, for the new
--     campaign_id FK.
--
-- This migration is created and statically verified only. It has NOT
-- been applied to the live database in this session (no
-- mcp__supabase__apply_migration call was made) -- that requires
-- separate, explicit approval per the session brief.
--
-- CMA-1A.1 CORRECTIONS (revised in place -- this migration has never
-- been applied anywhere, so it is corrected directly rather than
-- stacking a follow-up migration). Three concerns investigated against
-- the real live schema/code, two confirmed as real bugs and fixed, one
-- partially confirmed and fixed. Full investigation in
-- docs/SESSION_CMA_1A_INTERACTION_BASE_FACTS.md's "CMA-1A.1 correction
-- appendix":
--   1. CONFIRMED: 'voice' is a pre-existing CHECKPOINT-SOURCE label
--      (reconcileJob.ts's high-water-mark bookkeeping key), a totally
--      different identifier space from this table's own `source`
--      column, whose real live values are 'call-data' (614 rows) and
--      'chat-sessions' (17 rows) -- confirmed via
--      `select source, count(*) from customer_interactions group by
--      source`. api/_cma.ts's reconciliation call hardcoded 'voice',
--      which matches zero real rows -- fixed there (now
--      CALL_DATA_SOURCE = 'call-data'). This migration adds a new
--      CHECK constraint on `source` (part 1 below) as the actual
--      centrally-enforced guard, so no future caller of
--      call_center_sync_interaction can silently write a row under the
--      wrong identifier space and fragment the (source, interaction_id)
--      uniqueness key into a duplicate logical interaction.
--   2. CONFIRMED: the original call_center_sync_interaction had no
--      validation distinguishing a genuinely new interaction (which
--      the NOT NULL columns `interaction_id`/`source`/`started_at`/
--      `channel` already partially guard against -- a NULL would raise
--      a constraint violation) from an insert with an EMPTY STRING
--      identity (`interactionId: ''`), which satisfies NOT NULL but is
--      not a valid identity and would create permanent, un-mergeable
--      junk rows. Fixed (part 3 below) with an explicit pre-check that
--      only fires when no existing row already matches
--      (source, interactionId) -- i.e. only on what would be a genuine
--      first-time insert -- so a true partial-update call that only
--      needs to identify an existing row is never newly burdened.
--   3. PARTIALLY CONFIRMED: the real upstream Call Data API's
--      `date_from`/`date_to` are calendar dates (YYYY-MM-DD) with
--      INCLUSIVE-both-ends semantics (confirmed via
--      src/server/analytics/callPopulationFetcher.ts's own documented
--      contract) -- NOT the half-open interval originally preferred.
--      The population-count RPC's original `started_at <= p_started_to`
--      upper bound, if ever given a bare calendar-day value, would
--      wrongly exclude nearly all of that final day. Resolution: this
--      RPC's upper bound is now EXCLUSIVE (`<`, a true half-open
--      interval, matching the original stated preference), and the
--      caller (api/_cma.ts, via interactionReconciliation.ts's new
--      computeInclusiveDateWindowBounds) is responsible for converting
--      an inclusive calendar "to" date into the correct exclusive
--      timestamp bound (midnight of the day AFTER). This makes the two
--      halves of a reconciliation comparison describe the same
--      population for the same requested window, consistent with
--      upstream's real, verified semantics. Status/call-state filter
--      equivalence (upstream only fetches status='inactive' calls) was
--      also investigated: today's Customer 360 voice ingestion
--      (voiceAgentInteractionSource.ts) already filters status='inactive'
--      identically, so the existing 614 call-data rows ARE already an
--      equivalent population by construction -- but call_center_sync_interaction
--      itself has no way to express or enforce this filter (no status
--      column exists on this table), so this remains a documented,
--      NOT a structurally enforced, equivalence. Flagged, not expanded
--      into a new column/filter -- out of scope per "do not expand
--      CMA-1A into a comprehensive reconciliation engine."
--
-- CMA-1A.3 CORRECTION (revised in place -- same rationale as 1A.1: this
-- migration has never been applied anywhere). CMA-1A.2 validated this
-- migration against a real, disposable PostgreSQL 17.5 instance (full
-- 50-migration history replayed) and found one further real, reproduced
-- bug, documented in docs/SESSION_CMA_1A_2_DATABASE_VALIDATION.md section
-- 4: a partial-update call on an EXISTING row still failed with
-- `ERROR: null value in column "started_at" ... violates not-null
-- constraint` whenever it omitted `startedAt` -- even though the
-- function's own v_exists pre-check correctly determined the call was
-- NOT a first-time insert and did not raise its explicit validation
-- error. Root cause: Postgres always constructs and validates the full
-- candidate VALUES tuple of a single-statement
-- `INSERT ... ON CONFLICT ... DO UPDATE` -- including every NOT NULL
-- constraint on columns in that tuple -- BEFORE it resolves whether
-- ON CONFLICT applies. Since the VALUES clause always included
-- `(p_payload->>'startedAt')::timestamptz` (NULL when the key is
-- omitted) against the NOT NULL `started_at` column, the candidate row
-- failed its own constraint immediately regardless of whether a
-- matching row already existed.
--
-- Two real options were weighed (PostgreSQL correctness, concurrency
-- safety, maintainability):
--   A. UPDATE-first / INSERT-if-absent (explicit two-statement branch).
--      Rejected: introduces a real TOCTOU race between the existence
--      check and the subsequent UPDATE/INSERT unless wrapped in extra
--      machinery (SELECT ... FOR UPDATE, or a unique-violation catch-
--      and-retry) that this function does not otherwise need -- Postgres
--      already provides atomic, race-free upsert via ON CONFLICT, and
--      discarding that guarantee to work around a tuple-construction
--      quirk would be a strictly worse trade.
--   B. SELECTED -- corrected single-statement upsert. Make the
--      candidate row's `started_at` value self-heal to the EXISTING
--      row's own `started_at` (via a plain, uncorrelated subquery keyed
--      on the same (source, interactionId) the function already uses to
--      locate the row) whenever the payload itself omits the field. On
--      a genuine first insert, no existing row exists, the subquery
--      yields NULL, and the function's own pre-check above already
--      raises its explicit, friendly "startedAt is required for a new
--      interaction" error before this INSERT statement is ever reached
--      -- so this fix cannot silently smuggle a missing mandatory field
--      past first-insert validation; it only ever supplies a real,
--      previously-persisted value on a true update path, and that value
--      is in any case structurally irrelevant to the final stored row
--      on conflict, since `started_at` remains correctly absent from
--      the `ON CONFLICT ... DO UPDATE SET` list (immutable once set --
--      unchanged from CMA-1A/1A.1). This keeps the whole operation a
--      single atomic statement, preserving Postgres's own native
--      ON CONFLICT race-freedom for concurrent callers (re-verified
--      live against real Postgres -- see
--      docs/SESSION_CMA_1A_3_PARTIAL_UPDATE_CORRECTION.md). `channel`
--      was investigated for the identical class of bug but found NOT to
--      need the same fix: its existing `coalesce(payload channel,
--      derived-from-source default)` expression can never evaluate to
--      NULL, because `source` is unconditionally required on every
--      call (it is half of the lookup key itself) -- confirmed by the
--      real Postgres test run, which reproduced the §4 bug for
--      `started_at` only, never for `channel`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. customer_id: allow unresolved-identity interactions to exist in
-- this table (CMA's own population must not be identity-gated -- the
-- existing identity-gated behavior belongs to Customer 360's own
-- ingestion path, call_center_upsert_interaction, which is completely
-- untouched by this migration and remains free to keep skipping
-- unresolved records exactly as it does today via reconcileJob.ts /
-- backfillJob.ts, neither of which is modified by this session).
-- ---------------------------------------------------------------------

alter table call_center.customer_interactions
  alter column customer_id drop not null;

alter table call_center.customer_interactions
  drop constraint if exists customer_interactions_customer_id_fkey;
alter table call_center.customer_interactions
  add constraint customer_interactions_customer_id_fkey
  foreign key (customer_id) references call_center.customers(id) on delete set null;

-- ---------------------------------------------------------------------
-- 2. New interaction fields -- only the five identified in the approved
-- v0.3.1 field inventory as needed by this foundation (FCR/intent-
-- confidence as real per-interaction Base Facts several live measures
-- need; campaign_id as a real FK, replacing a future need to re-derive
-- it from the free-text campaign_name; last_synced_at/ingestion_path as
-- the two columns the corrected sync RPC itself requires to express
-- freshness and provenance). No speculative fields added.
-- ---------------------------------------------------------------------

alter table call_center.customer_interactions
  add column if not exists fcr boolean,
  add column if not exists intent_confidence numeric,
  add column if not exists campaign_id uuid references call_center.campaigns(id) on delete set null,
  add column if not exists last_synced_at timestamptz,
  add column if not exists ingestion_path text check (ingestion_path is null or ingestion_path in ('customer360', 'cma_sync'));

create index if not exists customer_interactions_source_started_at_idx
  on call_center.customer_interactions(source, started_at);

-- ---------------------------------------------------------------------
-- 2a. CMA-1A.1 correction -- centrally enforce the real source-identity
-- convention at the database layer. 'call-data' and 'chat-sessions' are
-- the only two values ever written to this column by any real code
-- path today (confirmed live: 614 / 17 rows respectively) -- this
-- constraint is compatible with every existing row. It exists
-- specifically so a future caller of call_center_sync_interaction (or
-- any other writer) cannot silently introduce a row under a different
-- identifier space (e.g. the pre-existing 'voice'/'chat' CHECKPOINT-
-- SOURCE label this session found conflated with this column in
-- api/_cma.ts) and fragment the (source, interaction_id) uniqueness
-- key into an unintended duplicate logical interaction.
-- ---------------------------------------------------------------------

alter table call_center.customer_interactions
  add constraint customer_interactions_source_check
  check (source in ('call-data', 'chat-sessions'));

-- ---------------------------------------------------------------------
-- 3. call_center_sync_interaction -- the corrected v0.3.1 synchronization
-- RPC, reproduced verbatim from docs/CMA_SCHEMA_PROPOSAL_v0_3_1.sql
-- (the [CORRECTED] version -- presence-checked JSONB merge, structural
-- xmax=0 insert/update detection). See
-- docs/SESSION_CMA_1A_INTERACTION_BASE_FACTS.md section "Synchronization
-- RPC behaviour" for a field-by-field restatement of the semantics and
-- hand-traced payload scenarios.
--
-- Restricted to service_role only (Part 4 below) -- not reachable by
-- anon or authenticated roles, and not called from any application API
-- route in this session (no polling job / ingestion wiring is part of
-- CMA-1A's scope). This satisfies the brief's "restricted to authorized
-- server-side ingestion paths, not exposed as an unrestricted public
-- write operation" requirement at the database layer, the same way
-- every other call_center_* mutation RPC in this project is restricted.
-- ---------------------------------------------------------------------

create or replace function public.call_center_sync_interaction(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_row record;
  v_was_insert boolean;
  v_agent_id text := p_payload->>'agentId';
  v_category_id uuid;
  v_interaction_id text := p_payload->>'interactionId';
  v_source text := p_payload->>'source';
  v_exists boolean;
begin
  -- CMA-1A.1 correction: validate the MINIMUM viable Base Fact set,
  -- but ONLY when this call will actually be a first-time insert (no
  -- existing row already matches this identity). A partial-update call
  -- that only needs to identify an existing interaction is never
  -- burdened with a requirement beyond the two fields it always needed
  -- to locate that row (source + interactionId). The pre-existing NOT
  -- NULL constraints on interaction_id/source/started_at/channel
  -- already reject a missing (NULL) value with a clear Postgres error;
  -- this check closes the remaining gap -- an EMPTY STRING identity,
  -- which satisfies NOT NULL but is not a valid Base Fact and would
  -- otherwise insert a permanent, un-mergeable junk row (it can never
  -- be matched by a later correct-identity sync call).
  v_exists := exists (
    select 1 from call_center.customer_interactions
    where source = v_source and interaction_id = v_interaction_id
  );
  if not v_exists then
    if v_interaction_id is null or v_interaction_id = '' then
      raise exception 'call_center_sync_interaction: interactionId is required for a new interaction' using errcode = '22023';
    end if;
    if v_source is null or v_source = '' then
      raise exception 'call_center_sync_interaction: source is required for a new interaction' using errcode = '22023';
    end if;
    if nullif(p_payload->>'startedAt', '') is null then
      raise exception 'call_center_sync_interaction: startedAt is required for a new interaction' using errcode = '22023';
    end if;
  end if;

  if v_agent_id is not null then
    select category_id into v_category_id
      from call_center.customer360_category_agents where agent_id = v_agent_id limit 1;
  end if;

  insert into call_center.customer_interactions as ci (
    customer_id, contact_point_id, interaction_id, channel, direction, agent_id, agent_display_name,
    category_id, started_at, duration_seconds, intent, outcome, sentiment_score, was_authenticated,
    escalation_trigger, campaign_name, campaign_id, fcr, intent_confidence, recording_available,
    source, last_synced_at, ingestion_path
  ) values (
    nullif(p_payload->>'customerId', '')::uuid,
    nullif(p_payload->>'contactPointId', '')::uuid,
    p_payload->>'interactionId',
    -- CMA-1A.1 correction: the channel default must not be a blanket
    -- 'voice' regardless of source -- a chat-sourced sync call that
    -- omits `channel` would otherwise silently write channel='voice'
    -- against a chat-sessions row (real chat rows use channel='chat',
    -- confirmed live). Derive the default from the already-known
    -- source instead; an explicit `channel` in the payload still wins.
    coalesce(p_payload->>'channel', case when v_source = 'chat-sessions' then 'chat' else 'voice' end),
    p_payload->>'direction',
    v_agent_id,
    p_payload->>'agentDisplayName',
    v_category_id,
    -- CMA-1A.3 correction: on a partial update that omits startedAt, the
    -- candidate row must not fail its own NOT NULL check before
    -- ON CONFLICT ever gets a chance to apply. Self-heal from the
    -- existing row's own started_at when the payload doesn't supply one.
    -- On a genuine first insert, no existing row exists, this yields
    -- NULL, and the pre-check above has already raised its own explicit
    -- "startedAt is required for a new interaction" error before this
    -- INSERT statement is reached -- so a true first insert still cannot
    -- proceed without a real startedAt.
    coalesce(
      (p_payload->>'startedAt')::timestamptz,
      (select existing.started_at from call_center.customer_interactions existing
         where existing.source = v_source and existing.interaction_id = v_interaction_id)
    ),
    nullif(p_payload->>'durationSeconds', '')::int,
    p_payload->>'intent',
    p_payload->>'outcome',
    nullif(p_payload->>'sentimentScore', '')::numeric,
    nullif(p_payload->>'wasAuthenticated', '')::boolean,
    p_payload->>'escalationTrigger',
    p_payload->>'campaignName',
    nullif(p_payload->>'campaignId', '')::uuid,
    nullif(p_payload->>'fcr', '')::boolean,
    nullif(p_payload->>'intentConfidence', '')::numeric,
    coalesce((p_payload->>'recordingAvailable')::boolean, false),
    p_payload->>'source',
    now(),
    'cma_sync'
  )
  on conflict (source, interaction_id) do update set
    -- MUTABLE, IDENTITY-LIKE: never regress a resolved value to null,
    -- regardless of whether this payload carried the key at all.
    customer_id = coalesce(excluded.customer_id, ci.customer_id),
    contact_point_id = coalesce(excluded.contact_point_id, ci.contact_point_id),
    category_id = coalesce(excluded.category_id, ci.category_id),
    campaign_id = coalesce(excluded.campaign_id, ci.campaign_id),
    -- MUTABLE, ORDINARY: presence-checked -- a key genuinely absent from
    -- this payload leaves the existing value untouched; a key present
    -- (even as explicit JSON null) overwrites, including to null when
    -- the upstream system genuinely clears the fact.
    duration_seconds = case when p_payload ? 'durationSeconds' then excluded.duration_seconds else ci.duration_seconds end,
    intent = case when p_payload ? 'intent' then excluded.intent else ci.intent end,
    outcome = case when p_payload ? 'outcome' then excluded.outcome else ci.outcome end,
    sentiment_score = case when p_payload ? 'sentimentScore' then excluded.sentiment_score else ci.sentiment_score end,
    was_authenticated = case when p_payload ? 'wasAuthenticated' then excluded.was_authenticated else ci.was_authenticated end,
    escalation_trigger = case when p_payload ? 'escalationTrigger' then excluded.escalation_trigger else ci.escalation_trigger end,
    campaign_name = case when p_payload ? 'campaignName' then excluded.campaign_name else ci.campaign_name end,
    fcr = case when p_payload ? 'fcr' then excluded.fcr else ci.fcr end,
    intent_confidence = case when p_payload ? 'intentConfidence' then excluded.intent_confidence else ci.intent_confidence end,
    recording_available = case when p_payload ? 'recordingAvailable' then excluded.recording_available else ci.recording_available end,
    -- Freshness is unconditional: every successful sync call, whether or
    -- not any tracked field actually changed, proves the row was
    -- re-checked against the upstream source at this moment.
    last_synced_at = now()
    -- interaction_id, source, started_at, channel, direction, agent_id,
    -- agent_display_name are IMMUTABLE once set -- deliberately absent
    -- from this SET list (an agent-transfer-mid-interaction scenario is
    -- not modeled; see docs/CMA_DATA_MODEL_v0_3_1.md section 7, item 11
    -- -- unresolved, carried forward, not addressed by this session).
  -- CMA-1A.2 fix: plpgsql's INTO clause cannot mix a row/record target
  -- with a scalar target in the same multi-item list -- confirmed
  -- against real Postgres 17 (raised "v_row is not a scalar variable"
  -- for both `ci.*` and whole-row `ci` once a second, scalar target
  -- was present). Fixed by collecting everything into ONE record
  -- target (`was_insert` becomes an ordinary named column on that
  -- record, not a separate variable), then unpacking it below.
  returning (xmax = 0) as was_insert, ci.* into v_row;

  v_was_insert := v_row.was_insert;
  return jsonb_build_object('interaction', to_jsonb(v_row) - 'was_insert', 'wasInsert', v_was_insert);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. call_center_cma_interaction_population_count -- the minimal,
-- read-only reconciliation capability (brief Task 5): the LOCAL half of
-- a local-vs-upstream comparison for a given source + time window. The
-- upstream half (fetching the real Call Data API's population for the
-- same window) is implemented on the TypeScript side in
-- src/server/cma/interactionReconciliation.ts, which calls this RPC and
-- diffs it against the real Call Data API response -- deliberately NOT
-- a second RPC, since the upstream source is an external HTTP API, not
-- something Postgres itself can reach. No polling scheduler and no
-- backfill job are implemented here -- this is a stateless, read-only
-- comparison a human or a future job can invoke on demand.
--
-- CMA-1A.1 correction: p_started_to is now an EXCLUSIVE upper bound
-- (true half-open interval, `>= from AND < to`) -- was `<=` (inclusive)
-- in CMA-1A. The real upstream Call Data API's date_from/date_to are
-- calendar-date, inclusive-both-ends; the caller
-- (interactionReconciliation.ts's computeInclusiveDateWindowBounds) is
-- responsible for converting an inclusive "to" calendar date into the
-- correct exclusive timestamp bound (midnight of the day AFTER) before
-- calling this RPC, so a bare `<=` on a calendar-day value no longer
-- silently excludes nearly all of that final day.
-- ---------------------------------------------------------------------

create or replace function public.call_center_cma_interaction_population_count(
  p_source text, p_started_from timestamptz, p_started_to timestamptz
) returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select jsonb_build_object(
    'source', p_source,
    'startedFrom', p_started_from,
    'startedTo', p_started_to,
    'totalRows', count(*),
    'nullCustomerId', count(*) filter (where customer_id is null),
    'cmaSyncRows', count(*) filter (where ingestion_path = 'cma_sync'),
    'customer360Rows', count(*) filter (where ingestion_path = 'customer360' or ingestion_path is null),
    'oldestStartedAt', min(started_at),
    'newestStartedAt', max(started_at)
  )
  from call_center.customer_interactions
  where (p_source is null or source = p_source)
    and (p_started_from is null or started_at >= p_started_from)
    and (p_started_to is null or started_at < p_started_to);
$$;

-- ---------------------------------------------------------------------
-- 5. Lock down both new functions the same way as every other
-- call_center_* RPC in this project -- revoked from public/anon/
-- authenticated, granted to service_role only.
-- ---------------------------------------------------------------------

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in (
        'call_center_sync_interaction',
        'call_center_cma_interaction_population_count'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- =====================================================================
-- END OF MIGRATION. Not applied to the live database by this session.
-- Session CMA-1A, provisional, corresponds to
-- docs/CMA_SCHEMA_PROPOSAL_v0_3_1.sql Part 1 only.
-- =====================================================================
