/**
 * Ratio Explorer — core domain types (Session R1, VOICEFORCE_RATIO_EXPLORER
 * spec v1.0). Shared between the backend ratio registry/service
 * (src/server/analytics/ratio*.ts) and the frontend registry/service
 * (src/lib/ratios/*, src/services/analytics/ratiosService.ts).
 *
 * Two-registry model (spec §17.6): this file defines the WIRE SHAPE both
 * sides agree on. It does not itself decide any ratio's numerator,
 * denominator, or eligibility — that lives in
 * src/server/analytics/ratioRegistry.ts. It does not decide any ratio's
 * label, family grouping, or chart preference — that lives in
 * src/lib/ratios/ratioFrontendRegistry.ts.
 */

/**
 * Spec §12 — DIRECT (backend exposes it), DERIVED (service can compute it
 * from real fields), PARTIAL (a real signal exists but the
 * production-grade definition needs another field/taxonomy), BACKEND_GAP
 * (no telemetry yet — must render an honest unavailable state).
 *
 * Session R6.3A — AWAITING_TELEMETRY (new): the ratio's definition is
 * fully specified (purpose/numerator/denominator/exclusions all fixed,
 * per docs/SESSION_R6_2_CONVERSATION_QUALITY_ARCHITECTURE.md), but its
 * evidence source (the Interaction Trace API) doesn't exist yet — a
 * deliberately distinct state from BACKEND_GAP (whose ratios, like CSAT,
 * have no fixed definition to show at all). Never used for the original
 * 21 ratios; only Conversation Quality's first 6.
 */
export type RatioAvailability = 'direct' | 'derived' | 'partial' | 'backend_gap' | 'awaiting_telemetry';

/**
 * Session R4.3 — RUNTIME health/outcome of a single request, kept
 * strictly separate from `RatioAvailability` (measurement
 * capability/provenance, set once per ratio by the registry). A
 * `direct` ratio's availability never changes because of a transient
 * runtime failure; only its `runtimeState` does.
 *
 * - `live` — request succeeded, a valid qualifying population/value exists.
 * - `no_data` — request succeeded, zero records qualify. Not an error.
 * - `not_instrumented` — ratio definition exists but isn't implemented/telemetry doesn't exist yet.
 * - `upstream_rejected` — Call Centre is reachable but rejected the request (4xx — auth/validation/contract mismatch). See `httpStatus`.
 * - `upstream_unavailable` — genuine connectivity/timeout/5xx/unreachable condition.
 */
export type RatioRuntimeState = 'live' | 'no_data' | 'not_instrumented' | 'upstream_rejected' | 'upstream_unavailable';

export type RatioFamily = 'operations' | 'intelligence' | 'quality' | 'business' | 'conversation_quality';

export type RatioUnit = 'percent' | 'seconds' | 'count' | 'score' | 'currency';

export type RatioVisualization = 'trend_line' | 'distribution' | 'funnel' | 'composition';

/** Spec §14 — the drillable dimensions a ratio MAY support. The registry decides which of these apply per ratio; the frontend never invents one. R2 added 'direction' (a real, confirmed field on every call-data row). */
export type RatioDimension = 'time' | 'intent' | 'agent' | 'campaign' | 'domain' | 'outcome' | 'segment' | 'escalation_reason' | 'tool' | 'direction';

export type RatioEvidenceKind = 'transcript' | 'recording' | 'metadata' | 'ai_trace' | 'qa';

export interface RatioFilterState {
  range?: '1h' | '6h' | '12h' | '24h' | '7d' | '30d';
  direction?: 'inbound' | 'outbound';
  channel?: 'voice' | 'chat';
  domain?: string;
  campaign?: string;
  agent?: string;
  intent?: string;
  /** The dimension currently selected in the "Break down by" control. */
  breakdown?: RatioDimension;
  /** The specific value selected within that breakdown (persists as a removable filter chip on further drill). */
  breakdownValue?: string;
  /** The selected driver/reason once a breakdown value has been drilled into (spec level 3). */
  driver?: string;
}

/** Spec §16 comparison rule — percentage ratios compare in percentage points (pp), never relative %. */
export interface RatioComparison {
  previousValue: number | null;
  /** Percentage-point delta for percent-unit ratios; plain delta in the ratio's own unit otherwise. Null when no comparison period was computed. */
  delta: number | null;
  /** True when `delta` should be read as percentage points, i.e. the ratio's unit is 'percent'. */
  isPercentagePoints: boolean;
}

export interface RatioSummaryDto {
  ratioId: string;
  availability: RatioAvailability;
  /** Session R4.3 — see RatioRuntimeState. */
  runtimeState: RatioRuntimeState;
  /** Raw HTTP status Call Centre returned, only when runtimeState is 'upstream_rejected'/'upstream_unavailable' with a real response (never for a network-level failure). */
  httpStatus: number | null;
  /** Null whenever availability is 'backend_gap' or the value genuinely could not be computed — never fabricated. */
  value: number | null;
  unit: RatioUnit;
  numerator: number | null;
  denominator: number | null;
  /** Population size behind the value — required whenever value is non-null (spec §4.3 "never show a ratio trend without its population"). */
  population: number | null;
  comparison: RatioComparison | null;
  /** ISO timestamp of the underlying data's freshness, or null when unknown. */
  dataFreshness: string | null;
  /** Present only when availability is not 'direct'/'derived' with a real value — a short, honest, human-readable reason (e.g. "Backend telemetry required"). */
  unavailableReason: string | null;
  filtersEcho: RatioFilterState;
  /**
   * R2 — true when the aggregation is based on fewer records than
   * actually exist for the query (the underlying complete-population
   * fetch hit its page cap before reaching the backend's own
   * `total_records`). When true, `population` is the number of records
   * actually aggregated, NOT the true total — always disclosed, never
   * silently presented as complete.
   */
  populationCapped: boolean;
  /** The backend's own reported total matching record count, when known — may exceed `population` if `populationCapped` is true. */
  trueTotalRecords: number | null;
}

export interface RatioTrendPointDto {
  bucket: string;
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  population: number | null;
}

export interface RatioTrendResponseDto {
  ratioId: string;
  availability: RatioAvailability;
  runtimeState: RatioRuntimeState;
  httpStatus: number | null;
  unavailableReason: string | null;
  points: RatioTrendPointDto[];
  populationCapped: boolean;
  trueTotalRecords: number | null;
}

export interface RatioBreakdownRowDto {
  dimension: RatioDimension;
  dimensionValue: string;
  label: string;
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  population: number | null;
  comparison: RatioComparison | null;
}

export interface RatioBreakdownResponseDto {
  ratioId: string;
  dimension: RatioDimension;
  availability: RatioAvailability;
  runtimeState: RatioRuntimeState;
  httpStatus: number | null;
  unavailableReason: string | null;
  rows: RatioBreakdownRowDto[];
  populationCapped: boolean;
  trueTotalRecords: number | null;
}

export interface RatioDriverRowDto {
  driverId: string;
  label: string;
  count: number;
  share: number;
}

export interface RatioDriverResponseDto {
  ratioId: string;
  availability: RatioAvailability;
  runtimeState: RatioRuntimeState;
  httpStatus: number | null;
  unavailableReason: string | null;
  drivers: RatioDriverRowDto[];
}

/**
 * Spec §17.5 — this returns only the canonical interaction identity + the
 * compact evidence-table fields already used elsewhere (never a second
 * copy of transcript/recording data). `channel` decides which existing
 * detail capability (Call Logs / Chat Logs) the Interaction Inspector
 * hands off to.
 */
export interface RatioInteractionRefDto {
  interactionId: string;
  channel: 'voice' | 'chat';
  timestamp: string;
  agentLabel: string | null;
  intent: string | null;
  outcome: string | null;
}

export interface RatioInteractionsResponseDto {
  ratioId: string;
  availability: RatioAvailability;
  runtimeState: RatioRuntimeState;
  httpStatus: number | null;
  unavailableReason: string | null;
  rows: RatioInteractionRefDto[];
  /** Count of matching records actually found within the (possibly capped) fetched population — see populationCapped. */
  totalCount: number;
  page: number;
  pageSize: number;
  populationCapped: boolean;
  trueTotalRecords: number | null;
}

/**
 * Backend Ratio Registry entry (spec §17.6, "Backend Ratio Registry" row).
 * Owns the authoritative business definition. Never imported by a React
 * component directly — only src/server/analytics/ratioService.ts and
 * api/analytics/metrics.ts (the ratios dispatch branch) touch this.
 */
export interface BackendRatioDefinition {
  id: string;
  family: RatioFamily;
  numeratorDescription: string;
  denominatorDescription: string;
  eligibilityNote: string;
  supportedDimensions: RatioDimension[];
  driverDimension: RatioDimension | null;
  evidence: Partial<Record<RatioEvidenceKind, boolean>>;
  availability: RatioAvailability;
  /** Short, honest note on exactly what is missing when availability isn't 'direct' — shown verbatim as unavailableReason. */
  unavailableReason: string | null;
}

/**
 * Frontend Ratio Registry entry (spec §17.6, "Frontend Ratio Registry"
 * row). Presentation only — never contains a formula or eligibility rule.
 */
export interface FrontendRatioDefinition {
  id: string;
  name: string;
  shortLabel: string;
  family: RatioFamily;
  description: string;
  formulaText: string;
  unit: RatioUnit;
  preferredVisualization: RatioVisualization;
  /** 'up' | 'down' | null — which direction is operationally good, for future good/bad color coding. Not used to fabricate a value. */
  goodDirection: 'up' | 'down' | null;
  helpText: string;
  /**
   * Static snapshot of the backend registry's classification, kept ONLY
   * for the /ratios catalogue's availability badge so that page doesn't
   * have to fetch all 21 live summaries just to render a list. The
   * single-ratio Explorer page never reads this — it always defers to
   * the live RatioSummaryDto.availability from the API, which is the
   * actual source of truth. Keep in sync with
   * src/server/analytics/ratioRegistry.ts by inspection; a mismatch here
   * only affects catalogue badge display, never a rendered value.
   */
  declaredAvailability: RatioAvailability;
  /**
   * R2 — a static snapshot of which breakdown dimensions the backend
   * registry supports for this ratio, used ONLY to populate the
   * BreakdownSelector control without importing server code client-side.
   * The API independently validates the dimension server-side on every
   * request regardless of what this list offers — a mismatch here would
   * surface as a clean validation-error response, never a silent wrong
   * result.
   */
  declaredDrillDimensions: RatioDimension[];
  /** Same idea as declaredDrillDimensions, for whether a Driver view exists at all. */
  declaredDriverDimension: RatioDimension | null;
  /**
   * Session R6.3A — a fully-specified ratio definition with no live data
   * source yet (see RatioAvailability's `awaiting_telemetry`). Rendered
   * by RatioHero as a compact structured block IN PLACE of a live
   * KPI/trend, never alongside one — set only for ratios whose
   * declaredAvailability is 'awaiting_telemetry'. Kept deliberately terse
   * (this is a catalogue/investigation view, not the architecture doc it
   * is sourced from verbatim: docs/SESSION_R6_2_CONVERSATION_QUALITY_ARCHITECTURE.md §C.1).
   */
  qualityDefinition?: {
    purpose: string;
    whatIsMeasured: string;
    numerator: string;
    denominator: string;
    exclusions?: string;
    dependency: string;
  };
}
