import { z } from 'zod';

/**
 * Session 7.5 / 7.6.1 — Central UI Configuration Schema.
 *
 * ONE universal, customer-independent schema for VoiceForce's FIXED
 * component inventory. A config (VoiceForce's own baseline, KATON, or
 * any future customer) supplies different VALUES for these same
 * predefined, semantically-named properties — never a customer-specific
 * structure, never a field named after a current palette color (no
 * "cyan", no "katonBlue"), never a duplicate field for a meaning another
 * field already covers.
 *
 * Session 7.6.1 revision: Session 7.6's extraction attempt found the
 * 7.5 version of this schema could not losslessly represent VoiceForce's
 * real current values in seven places (docs/SESSION_7_6_VOICEFORCE_BASELINE_EXTRACTION.md
 * §3, gaps A-G). This revision resolves all seven, using one repeated,
 * principled pattern everywhere a value can legitimately vary by
 * context (`scaleOf`, below) rather than seven different one-off fixes:
 *
 *   { default: T, variants?: Record<string, Partial<T>> }
 *
 * `default` is REQUIRED — the single value a minimal config (KATON, which
 * typically documents exactly one value per property) supplies. `variants`
 * is OPTIONAL, named by generic semantic state/size words (never a raw
 * palette name) — a richer config (VoiceForce) uses it to losslessly
 * preserve real additional values the baseline documentation doesn't
 * reduce to one. This directly satisfies the instruction "where KATON
 * documents fewer variants, use only explicit, validated defaults or
 * inheritance rules" — `default` IS the explicit, validated baseline;
 * `variants` is the inheritance-rule extension point, never fabricated
 * for a config that doesn't need it.
 *
 * Per Session 7.4 decision 3, this schema still has NO field, anywhere,
 * for a workflow/progress-stage component or a badge "provenance"
 * border-style axis — neither has a VoiceForce functional requirement.
 *
 * Session 7.6.2 revision: Session 7.7's pre-flight found this schema
 * (through 7.6.1) only ever represented VoiceForce's `:root` (light)
 * CSS custom property values — there was no structural way to hold the
 * real, separately-valued `.dark` overrides VoiceForce's live
 * `ThemeContext` actually toggles (dark is the real default appearance
 * for a new session). This revision adds ONE generic, reusable
 * `withAppearance` wrapper (same principle as `scaleOf`) and applies it
 * only to the specific fields confirmed to be sourced from a real
 * `:root`/`.dark` CSS custom property pair — see
 * docs/SESSION_7_6_2_LIGHT_DARK_SCHEMA_COMPLETENESS.md for the full
 * field-by-field list and the documented, orthogonal gaps this did NOT
 * fix (Tailwind-utility-level `dark:` variants outside the `:root`/
 * `.dark` custom-property set, e.g. Badge/Alert/Sidebar-nav-active).
 *
 * Nothing in this file is consumed by the running application. No
 * existing CSS, Tailwind config, screen, or component is touched by
 * this file's existence.
 */

// ---------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------

const colorValue = z.string().min(1);
const pxValue = z.number().nonnegative();

const meta = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
});

/**
 * The repeated "default + optional named variants" pattern described
 * above. `name` is used only for Zod's own error messages.
 */
function scaleOf<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({
    default: valueSchema,
    /** Named, full role-sets for any additional real states/sizes a
     * richer config needs (e.g. VoiceForce's button "compact"/"comfortable"
     * heights) — intentionally the SAME shape as `default`, not a partial
     * patch, so every variant is independently complete and unambiguous. */
    variants: z.record(z.string(), valueSchema).optional(),
  });
}

/** A background+foreground pair — the generic shape every "surface" or
 * "filled role" in this schema uses (gap A). Both colors required: a
 * surface with no defined text color is not representable (matches
 * reality — every real surface in this codebase has a real foreground). */
const surfacePair = z.object({
  background: colorValue,
  foreground: colorValue,
});

/**
 * Session 7.6.2 — a value that genuinely differs between the app's
 * light and dark appearance modes (the `:root` vs `.dark` CSS custom
 * property pair VoiceForce's `ThemeContext` toggles). Wraps ANY value
 * schema (a single color OR a whole `surfacePair`) at the point of
 * use, the same reusable-wrapper principle as `scaleOf` above — one
 * generic pattern, applied only where a real second value exists,
 * rather than restructuring the primitives themselves or duplicating
 * the schema. Both `light` and `dark` are REQUIRED: a config whose
 * light and dark values are genuinely identical states that fact
 * explicitly (supplies the same value twice), which is honest — never
 * a fabrication — since no value is invented, only asserted as equal.
 *
 * Deliberately NOT applied everywhere a color appears — only to the
 * fields this session confirmed are sourced from a `:root`/`.dark`
 * CSS custom property pair. See docs/SESSION_7_6_2_LIGHT_DARK_SCHEMA_COMPLETENESS.md
 * for exactly which fields this is and is not applied to, and why.
 */
function withAppearance<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({ light: valueSchema, dark: valueSchema });
}

// ---------------------------------------------------------------------
// Typography — gap F (line-height not always paired with a size)
// ---------------------------------------------------------------------

const fontFamilies = z.object({
  interface: z.string().min(1),
  content: z.string().min(1).optional(),
});

/**
 * One step of the type ramp. `lineHeightPx` is now OPTIONAL (gap F) —
 * KATON pairs every size with an explicit line-height; VoiceForce's
 * current arbitrary-pixel sizes are font-size-only at every call site
 * (confirmed, Session 7.6 §3/§F). `lineHeightSource` records WHICH case
 * applies for this step, so "line-height not specified" is itself an
 * explicit, truthful, validated state — never silently indistinguishable
 * from "forgot to fill this in."
 */
const typeRampStep = z.object({
  name: z.string().min(1),
  sizePx: pxValue,
  lineHeightPx: pxValue.optional(),
  lineHeightSource: z.enum(['explicit', 'inherited-default']),
  weight: z.number().int().min(100).max(900),
  usage: z.string().optional(),
});

const typography = z.object({
  families: fontFamilies,
  scale: z.array(typeRampStep).min(1),
});

// ---------------------------------------------------------------------
// Colour — gaps A, B, C
// ---------------------------------------------------------------------

/** Status role: a tinted (text+fill) presentation AND a solid (filled
 * control, e.g. a button/alert background) presentation — two genuinely
 * different real usages (Badge's tinted outline vs. a solid destructive
 * button), both present in this codebase, neither a duplicate of the
 * other. */
const semanticStatusRole = z.object({
  // Session 7.6.3: Badge.tsx's `escalated`/`warning`/`positive` variants
  // (the real source of `negative`/`caution`/`positive` here) each have
  // real, distinct `dark:` Tailwind classes for text, fill AND border —
  // all three are now appearance-aware.
  text: withAppearance(colorValue), // colored text, used on a light/tinted or neutral background
  fill: withAppearance(colorValue), // the light tint background behind `text`
  /** Badge's real border color for this status (e.g. `border-red-600/40
   * dark:border-red-500/40`). Optional: a config without a tinted-badge
   * border (e.g. a future customer) may omit it. */
  border: withAppearance(colorValue).optional(),
  /** Session 7.6.2: `negative.solid` is real `--destructive`/
   * `--destructive-foreground`, which genuinely differs by appearance
   * mode. `positive`/`caution` have no real solid component today
   * (same caveat as the 7.6.1 mapping table) — their light/dark values
   * are honestly identical placeholders, not a fabricated distinction. */
  solid: withAppearance(surfacePair), // a fully-saturated background + its own contrasting foreground
});

const colorSurfaces = z.object({
  /** Page background + default body text. shadcn: --background/--foreground. */
  base: withAppearance(surfacePair),
  /** Panels/cards/dialogs. shadcn: --card/--card-foreground. */
  raised: withAppearance(surfacePair),
  /** Popovers/tooltips/dropdowns. shadcn: --popover/--popover-foreground. */
  overlay: withAppearance(surfacePair),
  /** A neutral, low-saturation hover/active surface for ghost controls and
   * menu items — gap B: this is VoiceForce's REAL `--accent`/
   * `--accent-foreground` today, deliberately named away from "accent"
   * (which now means only the brand decorative color below) so the two
   * real, different concepts can never collide again. */
  interactiveSubtle: withAppearance(surfacePair),
  /** The app's own navigation-chrome surface (sidebar), genuinely
   * distinct from `base` in this codebase (separate --sidebar-* tokens).
   * Session 7.6.3: `border` is real `--sidebar-border`, confirmed
   * consumed by Sidebar.tsx's rail/panel/divider borders, and genuinely
   * differs by appearance mode — added here (optional, since a
   * minimal config may have no distinct sidebar border from its
   * general `borders.default`). `--sidebar-accent-foreground`,
   * `--sidebar-ring`, `--sidebar-primary`, `--sidebar-primary-
   * foreground` remain NOT represented: confirmed (grep) consumed only
   * by the unused `src/components/ui/sidebar.tsx` generic primitive,
   * which nothing in this app imports — adding schema fields for
   * values nothing renders would be fabrication, not extraction. */
  sidebar: withAppearance(surfacePair.extend({ border: colorValue.optional() })),
});

/** Filled-control roles that are not "surfaces" in the page-chrome
 * sense but ARE background+foreground pairs used by real components
 * (buttons, filled badges). Deliberately separate from `semantic` below
 * — these are brand/neutral identity roles, not status indicators. */
const colorRoles = z.object({
  /** shadcn: --primary/--primary-foreground. KATON: Katon navy. */
  primary: withAppearance(surfacePair),
  /** shadcn: --secondary/--secondary-foreground. No direct KATON
   * equivalent documented — a config without a distinct secondary role
   * may set this equal to `muted`. */
  secondary: withAppearance(surfacePair),
  /** shadcn: --muted/--muted-foreground. Also VoiceForce's real source
   * for "secondary text" (closing gap A's former standalone
   * `neutral.secondaryText` field — folded in here rather than
   * duplicated, since both names describe the exact same real value). */
  muted: withAppearance(surfacePair),
});

const colorBrand = z.object({
  /** A sparingly-used, decorative brand accent color — KATON: "Katon
   * blue, accents only... never small text." Deliberately NOT the same
   * field as `surfaces.interactiveSubtle` (gap B) — this is a brand
   * identity color a config may choose not to use at all; the neutral
   * hover surface above is a functional UI mechanism every config needs. */
  decorative: colorValue.optional(),
});

/** gap C — the real interactive/action color is a multi-step scale in
 * VoiceForce, not two flat values. `default` gives any config (KATON
 * included) the one role-set it needs to style a link/primary-interactive
 * element; `variants` lets a config with more real states (hover,
 * pressed, a link color distinct per color-scheme, a dark-mode-only
 * surface, etc.) preserve every one of them under a generic semantic
 * name — never a palette-color name. */
const interactiveActionRoleSet = z.object({
  text: colorValue.optional(), // for text/link usage
  background: colorValue.optional(), // for a solid interactive background (e.g. a selected pillar)
  border: colorValue.optional(),
  focusRing: colorValue.optional(),
});
const colorInteractive = z.object({
  action: scaleOf(interactiveActionRoleSet),
});

const colorSemantic = z.object({
  positive: semanticStatusRole,
  negative: semanticStatusRole, // technical/destructive failure AND business-escalation "rejected" status share this one role, per the existing `destructive`-reservation convention's own text; the DISTINCTION between them is which component consumes it (Alert=technical failure, Badge `escalated`=business state), not a second color role — see the mapping table for how both existing real usages are preserved without duplicating the field.
  caution: semanticStatusRole,
});

const color = z.object({
  surfaces: colorSurfaces,
  roles: colorRoles,
  brand: colorBrand,
  interactive: colorInteractive,
  semantic: colorSemantic,
});

// ---------------------------------------------------------------------
// Spacing, radii, borders
// ---------------------------------------------------------------------

const spacing = z.array(pxValue).min(1);

const radii = z.object({
  tag: pxValue,
  control: pxValue,
  panel: pxValue,
  card: pxValue,
  pill: z.literal('full'),
});

const borders = z.object({
  /** The generic default border (panel edges, dividers). Session 7.6.2:
   * `--border` genuinely differs by appearance mode. */
  default: z.object({ widthPx: pxValue, color: withAppearance(colorValue) }),
  /** Form-field borders — a structurally distinct token in this
   * codebase (`--input`) even where its current value matches `default`.
   * Session 7.6.2: `--input` also genuinely differs by appearance mode
   * (and remains equal to `--border` in both modes). */
  field: z.object({ widthPx: pxValue, color: withAppearance(colorValue) }),
  /** The focus RING is a separate visual mechanism from a border in this
   * codebase (a box-shadow-based Tailwind "ring" utility, not
   * border-width) — kept as its own field rather than conflated with
   * `default`/`field`, closing the part of gap A about `--ring`. Color
   * lives on `color.interactive.action.default.focusRing` (an
   * interactive-state color, not a structural border color); this field
   * is the ring's width only. */
  focusRingWidthPx: pxValue,
  /** A generic dash-style primitive. Not a "provenance" mechanism
   * (Session 7.4 decision 3) — any config may use or ignore it. */
  dashedStyle: z.string().optional(),
});

// ---------------------------------------------------------------------
// Heights — gap E
// ---------------------------------------------------------------------

const heightRoleSet = z.object({
  primaryAction: pxValue,
  control: pxValue,
  formField: pxValue,
  filterField: pxValue,
  topBar: pxValue,
  sidebarWidth: pxValue,
});
const heights = scaleOf(heightRoleSet);

// ---------------------------------------------------------------------
// Icons — gap G
// ---------------------------------------------------------------------

const icons = z.object({
  library: z.literal('lucide'),
  strokeWidth: z.number().positive(),
  ...scaleOf(z.object({ sizePx: pxValue })).shape,
});

// ---------------------------------------------------------------------
// Shadow — gap D
// ---------------------------------------------------------------------

const shadow = scaleOf(z.string());

// ---------------------------------------------------------------------
// Cards — reduced to card-SPECIFIC properties only; surface/border
// colors are now sourced from color.surfaces.raised / borders.default
// (removing the duplication the 7.6 extraction attempt found itself
// creating between `cards.surfaceColor` and the generic neutral tokens).
// ---------------------------------------------------------------------

const cards = z.object({
  headerBackground: colorValue.optional(),
  paddingPx: pxValue.optional(),
});

// ---------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------

const navigationItemStates = z.object({
  // Session 7.6.2: the real value tracks --sidebar-foreground (at a
  // real opacity modifier), genuinely differing by appearance mode.
  defaultForeground: withAppearance(colorValue),
  // Session 7.6.2: the real value tracks --sidebar-accent/
  // --sidebar-foreground, genuinely differing by appearance mode.
  hover: withAppearance(surfacePair),
  /** The active/selected item's own role-set. Its real value in a given
   * config may legitimately coincide with `color.interactive.action`'s
   * values (it does in VoiceForce today) — that is expected, not a
   * schema duplication, since this field's PURPOSE (which nav item is
   * selected) is distinct from the interactive-action scale's purpose
   * (general link/control interaction), even when the color happens to
   * match. Session 7.6.2: this is a hardcoded Tailwind utility color
   * (cyan-600/white), not a `:root`/`.dark` CSS custom property pair —
   * no confirmed second value exists today, so it is intentionally NOT
   * wrapped with `withAppearance` (see docs/SESSION_7_6_2_LIGHT_DARK_SCHEMA_COMPLETENESS.md
   * known-gaps section). */
  active: surfacePair,
  /** Session 7.7: the real `text-cyan-500 dark:text-cyan-400` active
   * state on the expanded navigation's pillar-heading (accordion
   * trigger) — a distinct active-text presentation from `active` above
   * (which models the icon-rail button), found during the Session
   * 7.6.3 investigation and flagged as a documented gap there. Genuinely
   * differs by appearance mode (real `dark:` Tailwind class), so it is
   * appearance-aware. Optional: a minimal config has no such distinct
   * heading-active state. */
  headingActiveText: withAppearance(colorValue).optional(),
  /** Session 7.7: the real `text-cyan-600 dark:text-cyan-300` active
   * state on an expanded navigation item's own label text (its
   * background already comes from `hover.background`, reused for the
   * active row per the real `bg-sidebar-accent` class on both). Also
   * found during Session 7.6.3 and flagged there. Optional for the same
   * reason as `headingActiveText`. */
  expandedActiveText: withAppearance(colorValue).optional(),
});

const navigation = z.object({
  item: navigationItemStates,
  topBar: surfacePair.optional(),
});

// ---------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------

const charts = z.object({
  seriesPalette: z.array(colorValue).min(1),
  gridlineColor: colorValue.optional(),
  axisColor: colorValue.optional(),
  tooltipBackground: colorValue.optional(),
  tooltipText: colorValue.optional(),
});

// ---------------------------------------------------------------------
// Responsive / breakpoints
// ---------------------------------------------------------------------

const breakpoints = z.object({
  sm: pxValue,
  md: pxValue,
  lg: pxValue,
  xl: pxValue,
});

// ---------------------------------------------------------------------
// Component variants and interaction states
// ---------------------------------------------------------------------

const buttonComponent = z.object({
  variants: z.object({
    // Session 7.6.2: primary/secondary/danger are real --primary/
    // --secondary/--destructive pairs, each genuinely differing by
    // appearance mode.
    primary: withAppearance(surfacePair),
    secondary: withAppearance(surfacePair),
    // quiet's real value tracks --primary (ghost-button text color),
    // also appearance-dependent.
    quiet: z.object({ foreground: withAppearance(colorValue) }),
    danger: withAppearance(surfacePair),
  }),
  busyIndicatorColor: colorValue.optional(),
});

const formFieldComponent = z.object({
  // Session 7.6.2: all four of these track real --border/--ring/
  // --foreground/--background CSS custom properties, each genuinely
  // differing by appearance mode.
  defaultBorder: withAppearance(colorValue),
  focusBorder: withAppearance(colorValue),
  filledText: withAppearance(colorValue),
  errorBorder: colorValue.optional(), // no real value exists today in either mode — unchanged
  errorText: colorValue.optional(), // no real value exists today in either mode — unchanged
  disabledBackground: withAppearance(colorValue),
});

const tableComponent = z.object({
  // Session 7.6.2: all four track real --card/--muted-foreground/
  // --muted CSS custom properties, each genuinely differing by
  // appearance mode.
  headerBackground: withAppearance(colorValue),
  headerText: withAppearance(colorValue),
  rowHoverBackground: withAppearance(colorValue),
  rowSelectedBackground: withAppearance(colorValue),
  rowLoadingPlaceholderColor: colorValue.optional(),
  sortIndicatorColor: colorValue.optional(),
});

const badgeComponent = z.object({
  // Session 7.6.3: `border` added to the pick — Badge.tsx's real
  // variants each have their own distinct, appearance-aware border
  // color (e.g. `border-red-600/40 dark:border-red-500/40`).
  variants: z.object({
    positive: semanticStatusRole.pick({ text: true, fill: true, border: true }),
    caution: semanticStatusRole.pick({ text: true, fill: true, border: true }),
    negative: semanticStatusRole.pick({ text: true, fill: true, border: true }),
  }),
});

/** Session 7.6.3: alert.tsx's `destructive` variant has a real border
 * color distinct from its background/foreground pair, and a real
 * opacity difference between modes (`border-destructive/50` light vs.
 * `dark:border-destructive` — full opacity — dark). `border` is
 * optional: the `default` variant has no explicit border override
 * (inherits `borders.default.color`), which is itself the honest,
 * confirmed current state, not an omission. */
const alertSurfacePair = surfacePair.extend({ border: colorValue.optional() });

const alertComponent = z.object({
  variants: z.object({
    // Session 7.6.2: default tracks --background/--foreground;
    // destructive tracks --background/--destructive — both genuinely
    // differ by appearance mode.
    default: withAppearance(alertSurfacePair),
    destructive: withAppearance(alertSurfacePair),
    success: surfacePair.optional(), // no real value exists today — unchanged
    warning: surfacePair.optional(), // no real value exists today — unchanged
  }),
});

const components = z.object({
  button: buttonComponent,
  input: formFieldComponent,
  table: tableComponent,
  badge: badgeComponent,
  alert: alertComponent,
  // Explicitly ABSENT, per Session 7.4 decision 3: no workflow/progress-
  // stage component field, no badge provenance/border-style axis.
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

export function validateThemeConfig(candidate: unknown) {
  return voiceForceThemeConfigSchema.safeParse(candidate);
}
