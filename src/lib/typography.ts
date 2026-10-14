/**
 * VoiceForce design system (Phase 2A) — the single source of truth for
 * semantic typography roles across the authenticated application.
 *
 * Why a className map instead of Tailwind `fontSize` aliases: a role like
 * "section title" isn't just a font-size — it's a complete treatment
 * (size + weight + color + tracking + transform). Tailwind's `fontSize`
 * extension can only bundle size/line-height/letter-spacing/weight, not
 * color or text-transform, so a bare `text-section-title` utility would
 * still require every page to separately remember to add
 * `uppercase text-muted-foreground`. This file bundles the COMPLETE
 * treatment per role instead, so `typography.sectionTitle` always
 * produces the same look wherever it's used, and changing the role's
 * definition here propagates everywhere without touching page files.
 *
 * Every arbitrary pixel value this project had scattered across pages
 * (`text-[9px]`, `text-[10px]`, `text-[11px]`, `text-[12px]`,
 * `text-[13px]`) now exists in exactly ONE place: this file. A page
 * should never introduce a new arbitrary text size — if an existing role
 * doesn't fit, that's a sign a new semantic role belongs here, not a new
 * one-off value in the page.
 *
 * Session 7.10.1 — size/weight/line-height now resolve from the active
 * customer configuration's `typography.roles.<name>` (see
 * src/theme/schema.ts/generateCssVariables.ts), via the
 * `--type-<name>-size`/`-weight`/`-line-height` CSS custom properties
 * every config emits, instead of a fixed Tailwind class (`text-lg`,
 * `text-[11px]`). This was a real, disclosed gap through Session 7.10:
 * a static hardcoded class here could never actually change for a
 * second customer, even though the CONCEPT of a role was already
 * centralized.
 *
 * CRITICAL IMPLEMENTATION NOTE, found and fixed during this session: the
 * classes below MUST be written as complete, literal strings, not built
 * by a helper function that interpolates the role name at runtime.
 * Tailwind's JIT compiler finds which classes to generate CSS for by
 * statically scanning the raw TEXT of source files for substrings that
 * look like complete class names — it does not execute this file. A
 * first attempt at this migration built each class via
 * `` `text-[length:var(--type-${role}-size)]` `` inside a shared
 * function; because the literal substring never appeared complete
 * anywhere in this file's source text, Tailwind generated ZERO CSS for
 * every role, and every role silently rendered with no explicit size at
 * all (confirmed by inspecting the actual built `dist/assets/*.css` —
 * the `:root` variable declarations were present, as intended, but no
 * utility-class rule ever referenced them). This is the same class of
 * bug Session 7.10's own `hover:bg-[var(--table-row-hover-bg)]` issue
 * was, one level up the stack — a syntactically-plausible class that
 * produces no real style. Every string below is now written out in
 * full so Tailwind's scanner can find it.
 *
 * The role's TRANSFORM (uppercase/tracking), density (tabular-nums),
 * and color (text-foreground/text-muted-foreground, which already
 * resolve through --foreground/--muted-foreground) remain literal
 * Tailwind classes — these are the role's structural identity (e.g.
 * "sectionTitle is always uppercase"), not a per-customer pixel choice.
 */
export const typography = {
  /** Page/record identity heading (e.g. "Role Management", an agent's display name). One deliberate step above body text — not Login's 24px, density is preserved. */
  pageTitle: 'text-[length:var(--type-pageTitle-size)] [font-weight:var(--type-pageTitle-weight)] leading-[var(--type-pageTitle-line-height)] text-foreground',
  /** The one-line description under a page title. */
  pageDescription: 'text-[length:var(--type-pageDescription-size)] [font-weight:var(--type-pageDescription-weight)] leading-[var(--type-pageDescription-line-height)] text-muted-foreground',
  /** Uppercase section label (e.g. "LIVE OPERATIONS", "OPERATIONAL PERFORMANCE"). The already-dominant pattern, formalized. */
  sectionTitle: 'text-[length:var(--type-sectionTitle-size)] [font-weight:var(--type-sectionTitle-weight)] leading-[var(--type-sectionTitle-line-height)] uppercase tracking-wide text-muted-foreground',
  /** A smaller uppercase label for a sub-group nested inside a section (e.g. Agent Detail's "Business Outcomes" within "Operational Performance"). One deliberate step below sectionTitle, never a new arbitrary size. */
  subsectionTitle: 'text-[length:var(--type-subsectionTitle-size)] [font-weight:var(--type-subsectionTitle-weight)] uppercase tracking-wide text-muted-foreground',
  /** Card/panel title (e.g. "Recent Interactions", a role name). */
  cardTitle: 'text-[length:var(--type-cardTitle-size)] [font-weight:var(--type-cardTitle-weight)] leading-[var(--type-cardTitle-line-height)] text-foreground',
  /** Primary body/prose text. */
  body: 'text-[length:var(--type-body-size)] [font-weight:var(--type-body-weight)] leading-[var(--type-body-line-height)] text-foreground',
  /** Secondary/dimmer body text. */
  bodySecondary: 'text-[length:var(--type-bodySecondary-size)] [font-weight:var(--type-bodySecondary-weight)] leading-[var(--type-bodySecondary-line-height)] text-muted-foreground',
  /** Timestamps, counts, short inline facts — the one arbitrary 11px value kept, formalized rather than retired, since it's genuinely distinct from bodySecondary in practice. */
  metadata: 'text-[length:var(--type-metadata-size)] [font-weight:var(--type-metadata-weight)] text-muted-foreground',
  /** Form/filter field label. */
  label: 'text-[length:var(--type-label-size)] [font-weight:var(--type-label-weight)] leading-[var(--type-label-line-height)] text-muted-foreground',
  /** The large number in a metric/KPI tile. */
  metricValue: 'text-[length:var(--type-metricValue-size)] [font-weight:var(--type-metricValue-weight)] leading-[var(--type-metricValue-line-height)] tabular-nums text-foreground',
  /** The caption under a metric value. */
  metricLabel: 'text-[length:var(--type-metricLabel-size)] [font-weight:var(--type-metricLabel-weight)] text-muted-foreground',
  /** Table column header. */
  tableHeader: 'text-[length:var(--type-tableHeader-size)] [font-weight:var(--type-tableHeader-weight)] leading-[var(--type-tableHeader-line-height)] uppercase tracking-wide text-muted-foreground',
  /** Table body/row text — the dense operational standard (12px), per the approved Phase 2 decision. */
  tableBody: 'text-[length:var(--type-tableBody-size)] [font-weight:var(--type-tableBody-weight)] leading-[var(--type-tableBody-line-height)] text-foreground',
  /** Session 7.10 — a genuinely repeated complete treatment found
   * identically at 4+ call sites in QA Calibration's evidence/review
   * sub-panels (`text-[10px] font-semibold uppercase tracking-wide
   * text-muted-foreground`), one deliberate step below subsectionTitle.
   * Extracted because it recurs byte-identically, not because every
   * 10px literal in the codebase belongs here. */
  microLabel: 'text-[length:var(--type-microLabel-size)] [font-weight:var(--type-microLabel-weight)] uppercase tracking-wide text-muted-foreground',
  /** Session 7.10 — the dense comparison-table header treatment used
   * identically across QA Calibration's divergence/disagreement tables
   * (`text-[9px] uppercase tracking-wide text-muted-foreground`), one
   * step denser than `tableHeader` for this workspace's own tables. */
  denseTableHeader: 'text-[length:var(--type-denseTableHeader-size)] [font-weight:var(--type-denseTableHeader-weight)] uppercase tracking-wide text-muted-foreground',
  /** Session 7.10.2 — a dense body treatment one step below `body`,
   * found byte-identically repeated across CreateCampaign/CampaignDetail
   * wizard & detail panels/tables. No transform. */
  denseBody: 'text-[length:var(--type-denseBody-size)] [font-weight:var(--type-denseBody-weight)] text-foreground',
  /** Session 7.10.2 — the bold sibling of denseBody: dialog/panel
   * sub-headings, found byte-identically repeated in
   * CampaignSettingsDialog/AutomatedQaInspector. No transform. */
  denseHeading: 'text-[length:var(--type-denseHeading-size)] [font-weight:var(--type-denseHeading-weight)] text-foreground',
  /** Session 7.10.2 — a muted caption one step below `metadata`, found
   * repeated across QaCalibration/QaQualityExplorer/QaReviewDialog/
   * AutomatedQaInspector. Not uppercase, not bold — distinct from
   * microLabel. */
  microCaption: 'text-[length:var(--type-microCaption-size)] [font-weight:var(--type-microCaption-weight)] text-muted-foreground',
  /** Session 7.10.2 — `body`'s muted sibling: empty-state/permission-
   * denied inline messages, found repeated across AgentDetail/
   * AutomatedQaInspector/QaCalibration/QaQualityExplorer/QaReviewDialog. */
  bodyMuted: 'text-[length:var(--type-bodyMuted-size)] [font-weight:var(--type-bodyMuted-weight)] leading-[var(--type-bodyMuted-line-height)] text-muted-foreground',
  /** Session 7.10.2 — an 11px uppercase muted field-label, found
   * byte-identically repeated 6x in CampaignDetail's AgentResultDialog. */
  fieldLabelMicro: 'text-[length:var(--type-fieldLabelMicro-size)] [font-weight:var(--type-fieldLabelMicro-weight)] uppercase tracking-wide text-muted-foreground',
  /** Session 7.10.2 — a bold uppercase muted panel label, bolder than
   * `tableHeader`, found repeated 4x in QaReviewDialog. */
  panelLabel: 'text-[length:var(--type-panelLabel-size)] [font-weight:var(--type-panelLabel-weight)] uppercase tracking-wide text-muted-foreground',
} as const;

export type TypographyRole = keyof typeof typography;
