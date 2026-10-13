import { z } from 'zod';

/**
 * Session 7.5 — Central UI Configuration Schema.
 *
 * Defines every configurable visual property of VoiceForce's FIXED
 * component inventory. A customer configuration (VoiceForce's own
 * baseline, KATON, or any future customer) is an instance of this
 * schema — it supplies different VALUES for these same predefined
 * elements; it never introduces new components, screens, workflows,
 * or properties outside what's defined here (per the approved Session
 * 7.4 roadmap, decision 2).
 *
 * This file is schema only. Per the approved Session 7.5 scope:
 * - No config instances are authored here (that's Session 7.6).
 * - No theme engine / CSS generation exists yet (that's Session 7.7).
 * - No existing screen, component, CSS, or Tailwind config is touched.
 * - Nothing here builds the two curriculum-specific KATON elements
 *   excluded by Session 7.4 decision 3 (a workflow/progress-stage
 *   component, and a badge "provenance" border-style axis) — neither
 *   appears anywhere below, not even as an unused optional field.
 *
 * Every category is sourced from one of:
 * - docs/SESSION_7_3_UI_CENTRALIZATION_AUDIT.md (§B KATON inventory, §C
 *   Call Centre architecture) — cited inline as "7.3 §X".
 * - This session's own audit of the five areas 7.3 left unquantified
 *   (shadows, cards/panels, charts, navigation styling, per-primitive
 *   interaction states) — cited inline as "7.5 audit" and written up in
 *   full, with file:line evidence, in docs/SESSION_7_5_UI_CONFIG_SCHEMA.md.
 *
 * Zod is used (already a project dependency, see package.json) so this
 * schema is simultaneously the compile-time type definition AND the
 * runtime validation surface Session 7.4 §E.2 calls for — no second
 * schema representation to keep in sync.
 */

// ---------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------

/** A CSS color value. Schema does not mandate hex vs. HSL — VoiceForce's
 * existing tokens are HSL triples (7.3 §C), KATON's source values are
 * hex (7.3 §B) — both are valid CSS color syntax and the theme engine
 * (Session 7.7) will not need to convert between them. */
const colorValue = z.string().min(1);

/** A pixel dimension, stored as a plain number (unit implied: px) — matches
 * how both VoiceForce's current Tailwind usage and KATON's source values
 * (7.3 §B.4) are expressed. */
const pxValue = z.number().nonnegative();

const meta = z.object({
  id: z.string().min(1), // e.g. "voiceforce", "katon"
  name: z.string().min(1),
  version: z.string().min(1),
});

// ---------------------------------------------------------------------
// Typography — 7.3 §B.1/B.2
// ---------------------------------------------------------------------

const fontFamilies = z.object({
  /** KATON: Roboto. VoiceForce's current value to be confirmed/extracted in Session 7.6 — no fontFamily token exists in tailwind.config.ts today (7.3 §C). */
  interface: z.string().min(1),
  /** KATON: Roboto Slab, used only for book/learning-object content (7.3 §B.1). VoiceForce has no "book content" concept (7.3 §F) — this field exists for configs that need it; VoiceForce's own config may alias it to `interface` or mark it explicitly unused. */
  content: z.string().min(1).optional(),
});

/** One step of the type ramp. KATON's nine steps are all size+lineHeight+weight+usage (7.3 §B.2, corrected revision); VoiceForce's current 8 arbitrary-pixel values (7.3 §E.2) map onto this same shape. */
const typeRampStep = z.object({
  name: z.string().min(1), // e.g. "xs", "sm", "sm-medium", "base", ... — a stable key the Tailwind config / components reference
  sizePx: pxValue,
  lineHeightPx: pxValue,
  weight: z.number().int().min(100).max(900),
  /** Free-text description of intended usage, carried through for documentation/traceability — not consumed by the theme engine. */
  usage: z.string().optional(),
});

const typography = z.object({
  families: fontFamilies,
  /** Ordered from smallest to largest. No fixed length requirement — KATON has 9, VoiceForce's baseline (Session 7.6) will have its own current count (8 distinct arbitrary sizes, 7.3 §E.2), and a future customer's scale may differ again. */
  scale: z.array(typeRampStep).min(1),
});

// ---------------------------------------------------------------------
// Colour — 7.3 §B.3 (brand/action, neutrals, status), plus this
// session's audit finding of a real, previously-undocumented
// "interactive accent" role (see docs/SESSION_7_5_UI_CONFIG_SCHEMA.md
// §3.4 — `cyan-*` Tailwind classes used as VoiceForce's de facto
// interactive/focus/selected-state color across 42 files, never tokenized).
// ---------------------------------------------------------------------

/** A semantic color role with its own "fill" companion (KATON's text+fill pairing, 7.3 §B.3 — e.g. Confirmed `#2E6B3F` text on `#E3F0E6` fill). VoiceForce's current equivalent (`--destructive` only, no fill companion, 7.3 §C) is a strict subset of this shape. */
const semanticColorRole = z.object({
  text: colorValue,
  fill: colorValue,
});

const colorBrand = z.object({
  /** KATON: Katon navy, brand/heading color. VoiceForce: `--primary`. */
  primary: colorValue,
  /** KATON: Katon blue, "accents only" per KATON's own usage note (7.3 §B.3) — not for small text. */
  accent: colorValue,
  /** KATON: Action, the interactive/button/link color. VoiceForce's de facto equivalent is the hardcoded `cyan-600`/`cyan-700` pattern found in this session's audit (§3.4) — not currently a token. */
  action: colorValue,
  actionPressed: colorValue,
  /** Current row/tab selection background. */
  selected: colorValue,
  /** Source/reference-passage highlight background. */
  highlight: colorValue,
});

const colorNeutrals = z.object({
  ground: colorValue, // page background
  subtle: colorValue, // table headers, panels
  divider: colorValue, // inside panels
  border: colorValue, // panel edges
  fieldBorder: colorValue, // inputs
  secondaryText: colorValue, // labels, help text
});

const colorSemantic = z.object({
  /** "Confirmed" in KATON's vocabulary; VoiceForce/Badge's existing `positive` variant (7.5 audit — currently hardcoded `emerald-*` classes inside badge.tsx, not a token). */
  positive: semanticColorRole,
  /** "Rejected" in KATON's vocabulary; VoiceForce's `--destructive` / Badge's `escalated` variant (currently hardcoded `red-*` classes). */
  negative: semanticColorRole,
  /** "Attention" in KATON's vocabulary; VoiceForce/Badge's existing `warning` variant (currently hardcoded `amber-*` classes). */
  caution: semanticColorRole,
});

const color = z.object({
  brand: colorBrand,
  neutral: colorNeutrals,
  semantic: colorSemantic,
});

// ---------------------------------------------------------------------
// Spacing, radii, borders — 7.3 §B.4
// ---------------------------------------------------------------------

/** Ordered scale steps in px. KATON: 4,6,8,10,12,16,20,24,28,32,40,48 — Tailwind's own default scale (7.3 §B.4). VoiceForce's negligible arbitrary-spacing usage (7.3 §E.6) means its baseline config can simply reference Tailwind's stock scale too. */
const spacing = z.array(pxValue).min(1);

const radii = z.object({
  tag: pxValue, // KATON: 4
  control: pxValue, // buttons, fields — KATON: 6
  panel: pxValue, // KATON: 8
  card: pxValue, // KATON: 10
  /** A literal "fully rounded" radius (pills) — not a px value. */
  pill: z.literal('full'),
});

const borders = z.object({
  /** Default border width, px. KATON: 1. */
  width: pxValue,
  /** Focus-ring border width, px. KATON: 2 (confirmed to be a border width, not a box-shadow ring, per the KATON source — 7.3 §B.4 revision). */
  focusWidth: pxValue,
  /**
   * A generic dash-style token (e.g. "dashed"). KATON uses this for its
   * own "not yet confirmed" semantics (ready-to-assign / system-added
   * content) — a curriculum-specific USE of the style, which is why
   * this field is a plain CSS border-style primitive only, never a
   * named "provenance" mechanism (Session 7.4 decision 3). Any config
   * may use or ignore this value for its own purposes.
   */
  dashedStyle: z.string().optional(),
});

// ---------------------------------------------------------------------
// Control heights, icons, shadow — 7.3 §B.4, this session's shadow audit
// ---------------------------------------------------------------------

const heights = z.object({
  primaryAction: pxValue, // KATON: 44
  control: pxValue, // KATON: 36 (everything else)
  formField: pxValue, // KATON: 40
  filterField: pxValue, // KATON: 36
  topBar: pxValue, // KATON: 56
  sidebarWidth: pxValue, // KATON: 224
});

const icons = z.object({
  /** Fixed at "lucide" for every config today — VoiceForce already uses lucide-react exclusively (7.3 §B.4 found this is a zero-cost match with KATON). */
  library: z.literal('lucide'),
  defaultSizePx: pxValue, // KATON: 20
  compactSizePx: pxValue, // KATON: 14-16; VoiceForce's actual current compact size(s) to be extracted in Session 7.6 (this session's audit did not re-measure every `h-3.5 w-3.5`-style occurrence count — flagged as a Session 7.6 extraction task, see docs/SESSION_7_5_UI_CONFIG_SCHEMA.md §3.5)
  strokeWidth: z.number().positive(), // KATON: 1.75
});

/** One elevation value per KATON's "one shadow only" finding (7.3 §B.4). This session's audit (§3.1) found VoiceForce currently uses SIX distinct Tailwind shadow utilities (sm/md/lg/xl/2xl/none) across 29 files with no single value — the baseline config (Session 7.6) must decide which of VoiceForce's current values becomes "the" shadow token, or whether VoiceForce's schema instance legitimately needs more than one (a decision for Session 7.6, not resolved here). */
const shadow = z.object({
  panel: z.string().min(1), // a CSS box-shadow value, or empty string for "flat/no shadow"
});

// ---------------------------------------------------------------------
// Cards / panels — new category, Session 7.4 decision 4, this session's audit §3.2
// ---------------------------------------------------------------------

const cards = z.object({
  surfaceColor: colorValue, // typically aliases color.neutral.ground or a dedicated "card" surface
  borderColor: colorValue,
  headerBackground: colorValue.optional(),
  /** Internal padding, px — not separately itemized in KATON's three source pages; VoiceForce's current value to be extracted in Session 7.6 from its most common Card/hand-rolled-panel padding. */
  paddingPx: pxValue.optional(),
});

// ---------------------------------------------------------------------
// Navigation states — new category, Session 7.4 decision 4, this
// session's audit §3.4 (real finding: default/hover already token-driven
// via --sidebar-* vars; active/selected and focus-ring are NOT — they
// hardcode cyan-600/cyan-400 directly in Sidebar.tsx).
// ---------------------------------------------------------------------

const navigationItemStates = z.object({
  defaultText: colorValue,
  hoverBackground: colorValue,
  hoverText: colorValue,
  /** Currently hardcoded as `bg-cyan-600 text-white` in Sidebar.tsx (7.5 audit §3.4) — this field is what that call site should reference once Session 7.7 wires the engine. */
  activeBackground: colorValue,
  activeText: colorValue,
});

const navigation = z.object({
  item: navigationItemStates,
  topBarBackground: colorValue.optional(),
  /** Currently hardcoded as `outline-cyan-400` across 42 files app-wide (7.5 audit §3.4), not nav-specific — kept here as nav's own focus-ring color reference; the broader app-wide focus-ring token is `color.brand.action` (or a dedicated ring token, a Session 7.6 decision) and nav should reference the same source, not a second one. */
  focusRingColor: colorValue.optional(),
});

// ---------------------------------------------------------------------
// Charts — new category, Session 7.4 decision 4, this session's audit §3.3
// ---------------------------------------------------------------------

const charts = z.object({
  /** An ordered palette for multi-series charts — a single color role doesn't cover this. VoiceForce's current de facto palette (2 of 3 chart files hardcode raw hex: #3B82F6, #8B5CF6, #10B981, #F59E0B, #EF4444, #94A3B8, #8884d8 — 7.5 audit §3.3) becomes this array's VoiceForce baseline value in Session 7.6. */
  seriesPalette: z.array(colorValue).min(1),
  axisColor: colorValue,
  gridlineColor: colorValue,
  tooltipBackground: colorValue,
  tooltipText: colorValue,
});

// ---------------------------------------------------------------------
// Responsive / breakpoints — new category, Session 7.4 decision 4
// ---------------------------------------------------------------------

const breakpoints = z.object({
  sm: pxValue,
  md: pxValue,
  lg: pxValue,
  xl: pxValue,
  /** No config is required to override these — both VoiceForce's and KATON's configs may simply reference Tailwind's own stock values (7.3 audit found no `screens` extension in tailwind.config.ts today). */
});

// ---------------------------------------------------------------------
// Component variants and interaction states — 7.3 §B.5-B.11, this
// session's direct verification of button.tsx / input.tsx / table.tsx /
// badge.tsx / alert.tsx (docs/SESSION_7_5_UI_CONFIG_SCHEMA.md §4).
// ---------------------------------------------------------------------

const buttonVariantColors = z.object({
  background: colorValue,
  text: colorValue,
  border: colorValue.optional(),
  hoverBackground: colorValue.optional(),
});

const buttonComponent = z.object({
  variants: z.object({
    primary: buttonVariantColors,
    secondary: buttonVariantColors,
    quiet: buttonVariantColors,
    danger: buttonVariantColors,
  }),
  /**
   * Busy/loading state (spinner + label swap). KATON documents this as a
   * standard state for every button variant (7.3 §B.5). This session's
   * direct read of src/components/ui/button.tsx confirmed NO `loading`/
   * `busy` prop or spinner-swap mechanism exists today — Default/Hover/
   * Focus/Disabled are implemented, Busy is not. This schema field marks
   * the token slot; adding the actual prop to Button is Session 7.8/7.9-era
   * implementation work, not this session's scope.
   */
  busyIndicatorColor: colorValue.optional(),
});

const formFieldComponent = z.object({
  defaultBorder: colorValue,
  focusBorder: colorValue,
  filledText: colorValue,
  /**
   * Error state (border + below-field message). KATON documents both the
   * border treatment and a separate message line (7.3 §B.6). This
   * session's direct read of src/components/ui/input.tsx confirmed NO
   * error/invalid styling or message-slot exists today — only Default/
   * Focus/Disabled are implemented. Schema field marks the token slot;
   * wiring it into Input is later implementation work.
   */
  errorBorder: colorValue,
  errorText: colorValue,
  disabledBackground: colorValue,
});

const tableComponent = z.object({
  headerBackground: colorValue,
  headerText: colorValue,
  rowHoverBackground: colorValue,
  /**
   * This session's direct read of src/components/ui/table.tsx found a
   * distinct `data-[state=selected]:bg-muted` treatment ALREADY exists,
   * separate from hover's `hover:bg-muted/50` — correcting the Session
   * 7.4 roadmap's assumption that this state was unconfirmed. It exists;
   * it is just not yet a dedicated token (it reuses the generic `--muted`
   * token at two opacities rather than a purpose-built selected-row color).
   */
  rowSelectedBackground: colorValue,
  /** Confirmed NOT present in table.tsx today (no skeleton/placeholder row treatment) — net-new. */
  rowLoadingPlaceholderColor: colorValue.optional(),
  /** Confirmed NOT present in table.tsx today (no sort-direction indicator styling) — net-new. */
  sortIndicatorColor: colorValue.optional(),
});

const badgeComponent = z.object({
  /**
   * Color-based variants only. This session's direct read of
   * src/components/ui/badge.tsx confirmed `positive`/`warning`/
   * `escalated` variants already exist as a MECHANISM (Session 11.1,
   * docs/VOICEFORCE_OPERATIONAL_GRID_STANDARD.md) but their colors are
   * hardcoded Tailwind palette classes (`emerald-600`, `amber-600`,
   * `red-600` etc.) INSIDE badge.tsx itself, not CSS-variable references
   * — centralized as a single file, not yet as a token. This schema's
   * `positive`/`caution`/`negative` fields (under `color.semantic` above)
   * are what badge.tsx's variants should be rewired to consume.
   */
  variants: z.object({
    positive: semanticColorRole,
    caution: semanticColorRole,
    negative: semanticColorRole,
  }),
  // No provenance/border-style axis — excluded per Session 7.4 decision 3.
});

const alertComponent = z.object({
  /** Confirmed present today: default, destructive (src/components/ui/alert.tsx). */
  variants: z.object({
    default: z.object({ background: colorValue, text: colorValue }),
    destructive: z.object({ background: colorValue, text: colorValue }),
    /** Confirmed NOT present today — net-new, per 7.3 §B.10/§F. */
    success: z.object({ background: colorValue, text: colorValue }),
    warning: z.object({ background: colorValue, text: colorValue }),
  }),
});

const components = z.object({
  button: buttonComponent,
  input: formFieldComponent,
  table: tableComponent,
  badge: badgeComponent,
  alert: alertComponent,
  // Explicitly ABSENT, per Session 7.4 decision 3: no workflow/progress-
  // stage component configuration exists anywhere in this schema, and
  // none will be added without a separate, explicitly-scoped future
  // session justified by an actual VoiceForce functional requirement.
});

// ---------------------------------------------------------------------
// Top-level schema
// ---------------------------------------------------------------------

export const voiceForceThemeConfigSchema = z.object({
  meta,
  typography,
  color,
  spacing,
  radii,
  borders,
  heights,
  icons,
  shadow,
  cards,
  navigation,
  charts,
  breakpoints,
  components,
});

export type VoiceForceThemeConfig = z.infer<typeof voiceForceThemeConfigSchema>;

/**
 * Validates a candidate config object against the schema (Session 7.4
 * §E.2's "schema validation" step). Pure function, no I/O — safe to run
 * in CI or a pre-build step once Session 7.6+ introduces real config
 * instances. Returns Zod's own structured result rather than throwing,
 * so a caller can report every validation error at once rather than
 * stopping at the first one.
 */
export function validateThemeConfig(candidate: unknown) {
  return voiceForceThemeConfigSchema.safeParse(candidate);
}
