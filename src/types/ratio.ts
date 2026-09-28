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

/** Spec §12 — DIRECT (backend exposes it), DERIVED (service can compute it from real fields), PARTIAL (a real signal exists but the production-grade definition needs another field/taxonomy), BACKEND_GAP (no telemetry yet — must render an honest unavailable state). */
export type RatioAvailability = 'direct' | 'derived' | 'partial' | 'backend_gap';

export type RatioFamily = 'operations' | 'intelligence' | 'quality' | 'business';

export type RatioUnit = 'percent' | 'seconds' | 'count' | 'score' | 'currency';

export type RatioVisualization = 'trend_line' | 'distribution' | 'funnel' | 'composition';

/** Spec §14 — the drillable dimensions a ratio MAY support. The registry decides which of these apply per ratio; the frontend never invents one. */
export type RatioDimension = 'time' | 'intent' | 'agent' | 'campaign' | 'domain' | 'outcome' | 'segment' | 'escalation_reason' | 'tool';

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
  unavailableReason: string | null;
  points: RatioTrendPointDto[];
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
  unavailableReason: string | null;
  rows: RatioBreakdownRowDto[];
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
  unavailableReason: string | null;
  rows: RatioInteractionRefDto[];
  totalCount: number;
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
}
