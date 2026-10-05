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
 */
export const typography = {
  /** Page/record identity heading (e.g. "Role Management", an agent's display name). One deliberate step above body text — not Login's 24px, density is preserved. */
  pageTitle: 'text-lg font-semibold text-foreground',
  /** The one-line description under a page title. */
  pageDescription: 'text-xs text-muted-foreground',
  /** Uppercase section label (e.g. "LIVE OPERATIONS", "OPERATIONAL PERFORMANCE"). The already-dominant pattern, formalized. */
  sectionTitle: 'text-xs font-semibold uppercase tracking-wide text-muted-foreground',
  /** A smaller uppercase label for a sub-group nested inside a section (e.g. Agent Detail's "Business Outcomes" within "Operational Performance"). One deliberate step below sectionTitle, never a new arbitrary size. */
  subsectionTitle: 'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
  /** Card/panel title (e.g. "Recent Interactions", a role name). */
  cardTitle: 'text-sm font-semibold text-foreground',
  /** Primary body/prose text. */
  body: 'text-sm text-foreground',
  /** Secondary/dimmer body text. */
  bodySecondary: 'text-xs text-muted-foreground',
  /** Timestamps, counts, short inline facts — the one arbitrary 11px value kept, formalized rather than retired, since it's genuinely distinct from bodySecondary in practice. */
  metadata: 'text-[11px] text-muted-foreground',
  /** Form/filter field label. */
  label: 'text-xs font-medium text-muted-foreground',
  /** The large number in a metric/KPI tile. */
  metricValue: 'text-lg font-semibold tabular-nums text-foreground',
  /** The caption under a metric value. */
  metricLabel: 'text-[11px] text-muted-foreground',
  /** Table column header. */
  tableHeader: 'text-xs font-medium uppercase tracking-wide text-muted-foreground',
  /** Table body/row text — the dense operational standard (12px), per the approved Phase 2 decision. */
  tableBody: 'text-xs text-foreground',
} as const;

export type TypographyRole = keyof typeof typography;
