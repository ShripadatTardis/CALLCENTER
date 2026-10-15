/**
 * Session 7.11 — KATON Customer Configuration.
 *
 * Every value below is sourced from `docs/SESSION_7_3_UI_CENTRALIZATION_AUDIT.md`
 * §B (the corrected revision, decoded from KATON's own `.mhtml` prototype
 * source pages — not a screenshot-only draft). Per that document's own
 * discipline, and the brief for this session, each value is labeled with
 * exactly one of three provenance tags so a fallback can never be mistaken
 * for a source-defined KATON value:
 *
 *   SOURCE   — the literal hex/px/string KATON's own documentation states
 *              for this exact role.
 *   DERIVED  — KATON documents the concept and a related real value, but
 *              not this exact field; the value below reuses an existing
 *              real KATON hex/number for a closely-related, explicitly
 *              justified purpose (never a newly-invented color/number).
 *   FALLBACK — KATON's 3 source pages do not document this concept at
 *              all (e.g. charts, dark mode, a generic hover affordance);
 *              a reasonable value is supplied only because the schema
 *              requires a complete, valid config, and is called out
 *              explicitly as not KATON-sourced.
 *
 * KATON's documented appearance is LIGHT-MODE ONLY — none of the 3 source
 * pages shows a dark variant. Every `withAppearance()`-wrapped field below
 * therefore has an IDENTICAL light/dark value (the light value duplicated,
 * per schema.ts's own documented convention for "genuinely identical
 * states... honest, never a fabrication, since no value is invented, only
 * asserted as equal"). This means a "KATON Dark" build will render
 * KATON's light palette unchanged when `.dark` is toggled — a real,
 * disclosed limitation (see docs/SESSION_7_11_MULTI_CUSTOMER_UI_CONFIGURATION.md
 * §6), not a bug in the generator or in `ThemeContext`.
 *
 * Decision-3 exclusions (carried forward from Session 7.4's roadmap,
 * reaffirmed by this session's own brief): KATON's source material
 * documents two elements with NO VoiceForce functional requirement —
 * (1) the dashed-border "provenance" tag mechanism ("from the book" vs
 * "added by the system", §B.8) and (2) the 6-step workflow/progress-stage
 * indicator (§B.9). Neither is implemented, in any form, by this config
 * or anywhere else in this codebase. `borders.dashedStyle` below records
 * KATON's real `1px dashed` value as the schema's generic, config-level
 * dash-style primitive ONLY — it carries no provenance semantics and is
 * not consumed by any component.
 */

import type { VoiceForceThemeConfig } from '../schema';

export const katonConfig: VoiceForceThemeConfig = {
  meta: {
    id: 'katon',
    name: 'KATON (customer configuration)',
    version: '0.1.0',
  },

  typography: {
    families: {
      // SOURCE — §B.1.
      interface: 'Roboto, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
      // SOURCE — §B.1, "book and learning objects" role. No Call Centre
      // screen renders book/curriculum content (confirmed, 7.3 §F), so
      // this value is populated (KATON genuinely documents it) but has
      // no current consumer — schema.ts's own comment anticipates
      // exactly this case ("present in the schema for configs that need
      // it" even where VoiceForce's own config omits it).
      content: 'Roboto Slab, ui-serif, Georgia, serif',
    },
    // SOURCE — §B.2, all 9 rows, decoded from the full KATON page source.
    // lineHeightSource is 'explicit' throughout (unlike VoiceForce's
    // 'inherited-default') because KATON's own documentation pairs every
    // size with a real line-height value.
    scale: [
      { name: '13/18', sizePx: 13, lineHeightPx: 18, lineHeightSource: 'explicit', weight: 400, usage: 'Metadata, timestamps, tags (text-xs)' },
      { name: '14/20', sizePx: 14, lineHeightPx: 20, lineHeightSource: 'explicit', weight: 400, usage: 'Tables, form fields, dense body (text-sm)' },
      { name: '14/20-medium', sizePx: 14, lineHeightPx: 20, lineHeightSource: 'explicit', weight: 500, usage: 'Buttons, labels, table headers, tabs (text-sm font-medium)' },
      { name: '16/24', sizePx: 16, lineHeightPx: 24, lineHeightSource: 'explicit', weight: 400, usage: 'Explanations, notices, form help (text-base)' },
      { name: '16/26-book', sizePx: 16, lineHeightPx: 26, lineHeightSource: 'explicit', weight: 400, usage: 'Book pages and learning objects — Roboto Slab body text (text-base font-book); no current Call Centre consumer' },
      { name: '18/26', sizePx: 18, lineHeightPx: 26, lineHeightSource: 'explicit', weight: 600, usage: 'Panel headings (text-lg)' },
      { name: '20/28', sizePx: 20, lineHeightPx: 28, lineHeightSource: 'explicit', weight: 600, usage: 'Section title, focused views (text-xl)' },
      { name: '24/32', sizePx: 24, lineHeightPx: 32, lineHeightSource: 'explicit', weight: 600, usage: 'Page titles (text-2xl)' },
      { name: '30/36', sizePx: 30, lineHeightPx: 36, lineHeightSource: 'explicit', weight: 600, usage: 'Report figures (text-3xl)' },
    ],
    // Session 7.10.1 — maps each of src/lib/typography.ts's 15 fixed
    // semantic roles onto the closest real KATON scale step above,
    // using KATON's own documented `usage` text as the matching key
    // wherever one exists (SOURCE), or the nearest real step when no
    // exact usage-name match exists (DERIVED — always a real KATON
    // step, never an invented size). KATON's documented floor is 13px
    // — it has no 9/10/11px steps the way VoiceForce's real inventory
    // does, so `metricLabel`/`microLabel`/`denseTableHeader` all
    // collapse onto the same 13/18 step. This is an honest, disclosed
    // consequence of KATON's own coarser scale, not a migration error.
    roles: {
      pageTitle: { sizePx: 24, weight: 600, lineHeightPx: 32 }, // SOURCE — "Page titles"
      pageDescription: { sizePx: 16, weight: 400, lineHeightPx: 24 }, // SOURCE — "Explanations, notices, form help"
      sectionTitle: { sizePx: 20, weight: 600, lineHeightPx: 28 }, // SOURCE — "Section title, focused views"
      subsectionTitle: { sizePx: 14, weight: 500, lineHeightPx: 20 }, // DERIVED — no documented sub-level below section; reuses "labels" step
      cardTitle: { sizePx: 18, weight: 600, lineHeightPx: 26 }, // SOURCE — "Panel headings"
      body: { sizePx: 14, weight: 400, lineHeightPx: 20 }, // SOURCE — "Tables, form fields, dense body"
      bodySecondary: { sizePx: 13, weight: 400, lineHeightPx: 18 }, // SOURCE — "Metadata, timestamps, tags"
      metadata: { sizePx: 13, weight: 400, lineHeightPx: 18 }, // SOURCE — exact usage-name match
      label: { sizePx: 14, weight: 500, lineHeightPx: 20 }, // SOURCE — exact usage-name match ("labels")
      metricValue: { sizePx: 30, weight: 600, lineHeightPx: 36 }, // SOURCE — "Report figures"
      metricLabel: { sizePx: 13, weight: 400, lineHeightPx: 18 }, // DERIVED — reuses the metadata step; no separate KATON value
      tableHeader: { sizePx: 14, weight: 500, lineHeightPx: 20 }, // SOURCE — exact usage-name match ("table headers")
      tableBody: { sizePx: 14, weight: 400, lineHeightPx: 20 }, // SOURCE — exact usage-name match ("Tables")
      microLabel: { sizePx: 13, weight: 400, lineHeightPx: 18 }, // DERIVED — KATON's documented floor; no 10px step exists
      denseTableHeader: { sizePx: 13, weight: 400, lineHeightPx: 18 }, // DERIVED — same floor, same reason
      // Session 7.10.2 — 6 new roles added alongside VoiceForce's consumer
      // migration. KATON's documented scale floor remains 13px (no 9/10/11px
      // step exists), so every VoiceForce role below 13px collapses onto that
      // floor here, same honest consequence already documented above for
      // microLabel/denseTableHeader/metadata/bodySecondary.
      denseBody: { sizePx: 13, weight: 400, lineHeightPx: 18 }, // DERIVED — reuses KATON's 13px floor (same step as metadata/bodySecondary)
      denseHeading: { sizePx: 13, weight: 600, lineHeightPx: 18 }, // DERIVED — KATON's 13px floor at bold weight; no separate bold-caption step documented
      microCaption: { sizePx: 13, weight: 400, lineHeightPx: 18 }, // DERIVED — reuses KATON's 13px floor, same reasoning as microLabel
      bodyMuted: { sizePx: 14, weight: 400, lineHeightPx: 20 }, // SOURCE — "Tables, form fields, dense body" (same step as `body`; color handled separately via text-muted-foreground)
      fieldLabelMicro: { sizePx: 13, weight: 400, lineHeightPx: 18 }, // DERIVED — reuses KATON's 13px floor; VoiceForce's 11px uppercase label has no KATON-documented sub-13px step
      panelLabel: { sizePx: 14, weight: 600, lineHeightPx: 20 }, // DERIVED — reuses KATON's "labels" step size/line-height; weight bumped to 600 since KATON documents no separate bold-label step and this role is deliberately bolder than `label`
    },
  },

  color: {
    surfaces: {
      base: {
        // background: SOURCE — §B.4 neutrals, "Ground" (page background).
        // foreground: DERIVED — KATON's neutrals table gives "Secondary
        // text" (#4F5878, for "labels and help") but no separate
        // "default body/heading text" hex. Katon navy (#121B54,
        // documented for "Top bar, headings") is the only sufficiently
        // dark, real KATON color suitable for default body text —
        // reused here as the closest defensible default foreground.
        // Session 7.11 correction: this field is consumed through
        // Tailwind's `hsl(var(--background))` wrapper (tailwind.config.ts),
        // which requires a bare `h s% l%` triple — a raw hex string here
        // produces invalid CSS (`hsl(#EEF3F7)`). Every field below that
        // feeds a `hsl(var(--x))`-wrapped Tailwind token is expressed as
        // an `hsl(...)` string (exact conversion of the real KATON hex
        // immediately above each line), not the literal hex — this does
        // NOT change which hex KATON actually specifies, only the CSS
        // syntax needed for this codebase's existing token-consumption
        // convention (the same convention VoiceForce's own config
        // already follows for these same fields).
        light: { background: 'hsl(207 36% 95%)' /* #EEF3F7 */, foreground: 'hsl(232 65% 20%)' /* #121B54 */ },
        dark: { background: 'hsl(207 36% 95%)' /* #EEF3F7 */, foreground: 'hsl(232 65% 20%)' /* #121B54 */ },
      },
      raised: {
        // background: SOURCE — "Subtle", documented "table headers, panels".
        // foreground: DERIVED — same as base.foreground above.
        light: { background: 'hsl(210 33% 98%)' /* #F7F9FB */, foreground: 'hsl(232 65% 20%)' /* #121B54 */ },
        dark: { background: 'hsl(210 33% 98%)' /* #F7F9FB */, foreground: 'hsl(232 65% 20%)' /* #121B54 */ },
      },
      overlay: {
        // FALLBACK — no distinct popover/tooltip surface documented;
        // reuses the real "Subtle" panel value rather than inventing a
        // new one.
        light: { background: 'hsl(210 33% 98%)' /* #F7F9FB */, foreground: 'hsl(232 65% 20%)' /* #121B54 */ },
        dark: { background: 'hsl(210 33% 98%)' /* #F7F9FB */, foreground: 'hsl(232 65% 20%)' /* #121B54 */ },
      },
      interactiveSubtle: {
        // DERIVED — KATON's table-row states (§B.11) describe a
        // "light gray/blue" Hover background with no hex given. KATON's
        // own real "Highlight" color (#E6F3FB, documented "Source
        // passage") is the closest existing pale-blue KATON hex and is
        // reused here for the generic ghost-hover/menu-item-hover
        // surface, distinct from the genuinely source-defined "Selected"
        // color used for persistent selection below.
        light: { background: 'hsl(203 72% 94%)' /* #E6F3FB */, foreground: 'hsl(232 65% 20%)' /* #121B54 */ },
        dark: { background: 'hsl(203 72% 94%)' /* #E6F3FB */, foreground: 'hsl(232 65% 20%)' /* #121B54 */ },
      },
      sidebar: {
        // background: SOURCE — Katon navy, documented "Top bar, headings".
        // foreground: FALLBACK — white; required for contrast on a navy
        // surface, not itself a separately documented KATON hex.
        // border: SOURCE — "Border", documented "panel edges".
        light: { background: 'hsl(232 65% 20%)' /* #121B54 */, foreground: 'hsl(0 0% 100%)' /* #FFFFFF */, border: 'hsl(208 29% 87%)' /* #D5DFE8 */ },
        dark: { background: 'hsl(232 65% 20%)' /* #121B54 */, foreground: 'hsl(0 0% 100%)' /* #FFFFFF */, border: 'hsl(208 29% 87%)' /* #D5DFE8 */ },
      },
    },
    roles: {
      primary: {
        // SOURCE — "Action" (#0A67C7, "Buttons, links", 5.6:1 on white).
        // foreground: FALLBACK — white, required for contrast.
        light: { background: 'hsl(210 90% 41%)' /* #0A67C7 */, foreground: 'hsl(0 0% 100%)' /* #FFFFFF */ },
        dark: { background: 'hsl(210 90% 41%)' /* #0A67C7 */, foreground: 'hsl(0 0% 100%)' /* #FFFFFF */ },
      },
      secondary: {
        // DERIVED — §B.5's "Secondary" button variant is OUTLINED
        // (navy border/text on the page surface), not a filled
        // background+foreground pair the way shadcn's `secondary`
        // implies. Approximated as page-surface background + Katon
        // navy foreground, consistent with the documented outline
        // treatment — a real structural difference from VoiceForce's
        // filled secondary, not an extraction error.
        light: { background: 'hsl(0 0% 100%)' /* #FFFFFF */, foreground: 'hsl(232 65% 20%)' /* #121B54 */ },
        dark: { background: 'hsl(0 0% 100%)' /* #FFFFFF */, foreground: 'hsl(232 65% 20%)' /* #121B54 */ },
      },
      muted: {
        // SOURCE — background "Divider" (documented "inside panels"),
        // foreground "Secondary text" (documented "labels and help",
        // 7.4:1 on white) — an exact match for this role's "muted
        // text" purpose.
        light: { background: 'hsl(210 29% 95%)' /* #EDF1F5 */, foreground: 'hsl(227 21% 39%)' /* #4F5878 */ },
        dark: { background: 'hsl(210 29% 95%)' /* #EDF1F5 */, foreground: 'hsl(227 21% 39%)' /* #4F5878 */ },
      },
    },
    brand: {
      // SOURCE — "Katon blue", documented "Accents only... never small
      // text" (explicit KATON usage restriction, 3.5:1 contrast).
      decorative: '#0C8FD9',
    },
    interactive: {
      action: {
        // text: SOURCE — "Action" (#0A67C7, "Buttons, links").
        // focusRing: SOURCE — §B.5's documented focus treatment is "a
        // distinct double-ring focus indicator in dark navy" — Katon
        // navy (#121B54), not the lighter Katon blue accent.
        default: { text: '#0A67C7', focusRing: '#121B54' },
        variants: {
          // SOURCE — "Action pressed", documented "Pressed state".
          pressedBackground: { background: '#095DB5' },
          // DERIVED — Katon blue is documented "accents only"; reused
          // here as the interactive border accent, consistent with
          // that usage restriction (border, not small text).
          border: { border: '#0C8FD9' },
        },
      },
    },
    semantic: {
      positive: {
        // SOURCE — "Confirmed" / "Confirmed fill" (§B.3), the one role
        // KATON documents with an explicit literal fill companion,
        // exactly matching this schema field's two-tone structure.
        text: { light: '#2E6B3F', dark: '#2E6B3F' },
        fill: { light: '#E3F0E6', dark: '#E3F0E6' },
        // DERIVED — KATON's status table gives text+fill only, no
        // separate border hex; §B.8's tag examples show a "green
        // outline" for Confirmed with no hex given, so the text color
        // is reused as the border color (a common convention: same hue
        // for text and outline).
        border: { light: '#2E6B3F', dark: '#2E6B3F' },
        // FALLBACK — no solid/filled "Confirmed" component is shown in
        // KATON's 3 source pages (same honest-placeholder caveat
        // VoiceForce's own config uses for its positive.solid).
        solid: {
          light: { background: '#2E6B3F', foreground: '#FFFFFF' },
          dark: { background: '#2E6B3F', foreground: '#FFFFFF' },
        },
      },
      negative: {
        // SOURCE — "Rejected" / "Rejected fill" (§B.3).
        text: { light: '#A33A2F', dark: '#A33A2F' },
        fill: { light: '#F6E3E1', dark: '#F6E3E1' },
        // DERIVED — same text-as-border convention as positive above.
        border: { light: '#A33A2F', dark: '#A33A2F' },
        // This IS a real, documented KATON component: §B.10's Error
        // feedback banner has a genuinely colored (not neutral)
        // background — "red/pink background, warning icon" — so the
        // fill color is the correct source for the solid/banner
        // presentation here, not a fallback. HSL form: this specific
        // pair feeds `--destructive`/`--destructive-foreground`, which
        // ARE `hsl(var(--x))`-wrapped by tailwind.config.ts (same
        // correction as the surfaces/roles fields above).
        solid: {
          light: { background: 'hsl(6 54% 92%)' /* #F6E3E1 */, foreground: 'hsl(6 55% 41%)' /* #A33A2F */ },
          dark: { background: 'hsl(6 54% 92%)' /* #F6E3E1 */, foreground: 'hsl(6 55% 41%)' /* #A33A2F */ },
        },
      },
      caution: {
        // SOURCE — "Attention" / "Attention fill" (§B.3).
        text: { light: '#8A5A0B', dark: '#8A5A0B' },
        fill: { light: '#FDF1DC', dark: '#FDF1DC' },
        border: { light: '#8A5A0B', dark: '#8A5A0B' }, // DERIVED, same convention.
        // SOURCE — §B.10's Warning banner also has a colored background
        // ("amber background, warning-triangle icon").
        solid: {
          light: { background: '#FDF1DC', foreground: '#8A5A0B' },
          dark: { background: '#FDF1DC', foreground: '#8A5A0B' },
        },
      },
      // FALLBACK — KATON's 3 source pages document NO "Pending/Open/
      // Running/Information" status role at all (confirmed, 7.3 §B.3 —
      // only Confirmed/Attention/Rejected exist, a review-workflow
      // vocabulary with no fourth "in progress" state). Katon blue
      // (#0C8FD9, the one documented non-status accent) and Highlight
      // (#E6F3FB, the one documented pale-blue surface) are reused here
      // — both real KATON hexes, repurposed rather than inventing a
      // new color — mirroring VoiceForce's own precedent of using blue
      // for this role.
      pending: {
        text: { light: '#0C8FD9', dark: '#0C8FD9' },
        fill: { light: '#E6F3FB', dark: '#E6F3FB' },
        border: { light: '#0C8FD9', dark: '#0C8FD9' },
        solid: {
          light: { background: '#0C8FD9', foreground: '#FFFFFF' },
          dark: { background: '#0C8FD9', foreground: '#FFFFFF' },
        },
      },
      // FALLBACK — Session 7.10.1. KATON's 3 source pages document no
      // "Inactive/Neutral" status concept either (same honest absence
      // as `pending` above). "Secondary text" (#4F5878, the one real
      // KATON neutral-gray hex, already used for muted/default text
      // elsewhere in this config) is reused here rather than inventing
      // a new gray.
      neutral: {
        text: { light: '#4F5878', dark: '#4F5878' },
        fill: { light: '#EDF1F5', dark: '#EDF1F5' }, // reuses the real "Divider" hex as the tint, same convention as the other roles' fill
        border: { light: '#4F5878', dark: '#4F5878' },
        solid: {
          light: { background: '#4F5878', foreground: '#FFFFFF' },
          dark: { background: '#4F5878', foreground: '#FFFFFF' },
        },
      },
    },
  },

  // SOURCE — §B.4, "Tailwind steps in px" — identical to VoiceForce's
  // own scale (both are Tailwind's stock default steps; KATON's own
  // caption confirms it uses no custom spacing scale).
  spacing: [4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 40, 48],

  // SOURCE — §B.4, "Corners and borders".
  radii: {
    tag: 4,
    control: 6,
    panel: 8,
    card: 10, // genuinely distinct from `panel` — a real KATON design decision, unlike VoiceForce where card === panel.
    pill: 'full',
  },

  borders: {
    // SOURCE — "Border" (#D5DFE8, "panel edges"), 1px solid (§B.4).
    // HSL form: feeds `--border`, `hsl(var(--x))`-wrapped.
    default: { widthPx: 1, color: { light: 'hsl(208 29% 87%)' /* #D5DFE8 */, dark: 'hsl(208 29% 87%)' /* #D5DFE8 */ } },
    // SOURCE — "Field border" (#7E89A2, "Inputs", 3.5:1 on white) —
    // genuinely distinct from `default`, unlike VoiceForce where the
    // two are equal.
    // HSL form: feeds `--input`, `hsl(var(--x))`-wrapped.
    field: { widthPx: 1, color: { light: 'hsl(222 16% 56%)' /* #7E89A2 */, dark: 'hsl(222 16% 56%)' /* #7E89A2 */ } },
    // SOURCE — §B.4: "2px around the pane in focus" (a real border,
    // not a box-shadow ring, per KATON's documentation).
    focusRingWidthPx: 2,
    // SOURCE — §B.4: "1px dashed, specifically for 'ready to assign'
    // and 'system-added content'". Recorded as the schema's generic
    // dash-style primitive ONLY — per the decision-3 exclusion in this
    // file's header comment, no component in this codebase consumes
    // this value for any provenance/workflow semantic.
    dashedStyle: '1px dashed',
  },

  // SOURCE — §B.4, "Control heights". KATON's source documents no
  // secondary compact/comfortable height scale, so `variants` is
  // correctly left unset — not a gap, an honest absence (the same
  // convention VoiceForce's config uses for fields with no real second
  // value).
  heights: {
    default: {
      primaryAction: 44,
      control: 36,
      formField: 40,
      filterField: 36,
      topBar: 56,
      sidebarWidth: 224,
    },
  },

  // SOURCE — §B.4, "Icons": Lucide (already this codebase's library —
  // zero migration cost), stroke 1.75 (genuinely different from
  // VoiceForce's 2), sizes 14/16/18/20/24px with 20px as the default.
  icons: {
    library: 'lucide',
    strokeWidth: 1.75,
    default: { sizePx: 20 },
    variants: {
      compact: { sizePx: 14 }, // "14–16px specifically inside buttons and table headers"
      tableHeader: { sizePx: 16 },
      comfortable: { sizePx: 18 },
      large: { sizePx: 24 },
    },
  },

  shadow: {
    // FALLBACK — §B.4 documents the ROLE ("one shadow only, used on
    // menus, panels-over-content, and page previews; everything else
    // flat — no elevation scale") but gives no literal CSS box-shadow
    // syntax. Tailwind's own `shadow-md` value (the same literal string
    // VoiceForce's config uses for its own default) is substituted as a
    // reasonable placeholder — explicitly NOT a KATON-source value.
    // No variants: matches KATON's own "no elevation scale beyond this
    // single value" statement — correctly left unset, not a gap.
    default: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  },

  // DERIVED — 7.4's own roadmap (§B) notes KATON's panel/card
  // distinction is "primarily a radius difference" (8px vs 10px); no
  // separate KATON padding/gap pixel values are documented for either.
  // Padding/gap values below reuse steps from KATON's OWN real spacing
  // scale (never an invented pixel value), chosen to match VoiceForce's
  // proportional convention for each variant (summary denser than
  // standard).
  panels: {
    summary: { radiusPx: 8, paddingPx: { x: 16, y: 16 }, contentGapPx: 8 },
    standard: { radiusPx: 10, shadow: 'default', paddingPx: { x: 24, y: 24 }, headerPaddingPx: { x: 24, y: 24 } },
    dense: { radiusPx: 8, paddingPx: { x: 0, y: 0 } },
    // workspace: correctly omitted — no KATON equivalent documented.
  },

  // DERIVED — KATON's 3 source pages document table ROW/HEADER STATES
  // (§B.11: sortable headers, Default/Hover/Selected/Loading rows) but
  // not literal header-height/cell-padding pixel values. Values below
  // reuse KATON's own documented control-height (36px) for the header
  // row and spacing-scale steps for padding, never an invented number.
  tables: {
    header: { heightPx: 36, paddingXPx: 12 },
    rows: {
      standard: { paddingXPx: 12, paddingYPx: 10 },
      // expanded/compact: correctly omitted — no KATON equivalent documented.
    },
  },

  navigation: {
    item: {
      // DERIVED — same Secondary-text-as-default-nav-text convention
      // used elsewhere for a muted/default (non-active) state.
      defaultForeground: { light: '#4F5878', dark: '#4F5878' },
      // DERIVED — same Highlight-as-hover convention as
      // `surfaces.interactiveSubtle` above. HSL form: `.background`
      // feeds `--sidebar-accent`, `hsl(var(--x))`-wrapped.
      hover: {
        light: { background: 'hsl(203 72% 94%)' /* #E6F3FB */, foreground: '#121B54' },
        dark: { background: 'hsl(203 72% 94%)' /* #E6F3FB */, foreground: '#121B54' },
      },
      // background: SOURCE — "Selected" (#C0DDEE), documented EXACTLY
      // as "Current row or tab" — a direct, source-defined match for a
      // navigation item's active/selected state, not a derived reuse.
      // foreground: DERIVED — Katon navy, for contrast on the pale
      // selected background. Not hsl()-wrapped by the generator (raw
      // `--nav-active-background`/`-foreground`) — hex is correct as-is.
      active: { background: '#C0DDEE', foreground: '#121B54' },
      // headingActiveText / expandedActiveText: correctly omitted — no
      // distinct secondary active-text treatment is documented beyond
      // the one active state above.
    },
  },

  // FALLBACK — confirmed by 7.4's own roadmap (§B): "Not present in the
  // three KATON pages audited at all — no chart/graph example was
  // shown." This REQUIRED schema field (`seriesPalette`, min 1 entry)
  // is populated entirely from KATON's OWN already-documented brand/
  // status hexes, reused rather than inventing new colors — explicitly
  // not a KATON-sourced chart palette.
  charts: {
    seriesPalette: ['#0A67C7', '#0C8FD9', '#2E6B3F', '#8A5A0B', '#A33A2F', '#121B54', '#7E89A2'],
    // DERIVED — "Divider" reused as a plausible gridline hue (documented "inside panels").
    gridlineColor: '#EDF1F5',
  },

  // FALLBACK — KATON's source pages document a single desktop viewport
  // only (no responsive breakpoint values shown, confirmed 7.4 §B) —
  // Tailwind's own stock defaults are used, identical to VoiceForce's
  // config, per 7.4's own guidance that this field needs no migration
  // work for either current config.
  breakpoints: { sm: 640, md: 768, lg: 1024, xl: 1280 },

  components: {
    button: {
      // SOURCE/DERIVED — §B.5's 4 variants (Primary/Secondary/Quiet/
      // Danger). Primary is the one genuinely solid-filled variant
      // (SOURCE, Action blue). Secondary/Quiet/Danger are all outlined
      // or plain per KATON's own documentation (§B.5: "Secondary
      // (outlined...)", "Quiet (plain/ghost...)", "Danger (outlined...)")
      // — none has a KATON-documented solid fill, so each is
      // approximated as page-surface background + its real semantic
      // foreground color, the same DERIVED convention used for
      // `color.roles.secondary` above.
      variants: {
        primary: { light: { background: '#0A67C7', foreground: '#FFFFFF' }, dark: { background: '#0A67C7', foreground: '#FFFFFF' } },
        secondary: { light: { background: '#FFFFFF', foreground: '#121B54' }, dark: { background: '#FFFFFF', foreground: '#121B54' } },
        quiet: { foreground: { light: '#121B54', dark: '#121B54' } },
        // KATON's Danger button is explicitly "outlined, red/orange" —
        // not solid-filled like VoiceForce's `destructive` button.
        // This is a genuine design difference, not an extraction gap.
        danger: { light: { background: '#FFFFFF', foreground: '#A33A2F' }, dark: { background: '#FFFFFF', foreground: '#A33A2F' } },
      },
      // busyIndicatorColor: omitted — §B.5 documents a real Busy state
      // ("spinner icon + 'Saving' label, same base color as the
      // variant") but no SEPARATE busy-specific color distinct from
      // each variant's own foreground — correctly left unset rather
      // than inventing a value this field doesn't actually need.
    },
    input: {
      // SOURCE — §B.6: default border "Field border", focus "blue/navy
      // border highlight" (Katon navy, matching the double-ring focus
      // documented at §B.5), error "red border, red input text"
      // (Rejected).
      defaultBorder: { light: '#7E89A2', dark: '#7E89A2' },
      // HSL form: this field (unlike defaultBorder above) feeds
      // `--ring`, `hsl(var(--x))`-wrapped.
      focusBorder: { light: 'hsl(232 65% 20%)' /* #121B54 */, dark: 'hsl(232 65% 20%)' /* #121B54 */ },
      // DERIVED — "Filled" state text is black/navy per §B.6 ("black
      // text"); Katon navy used for consistency with the rest of this
      // config's default-text convention.
      filledText: { light: '#121B54', dark: '#121B54' },
      errorBorder: '#A33A2F',
      errorText: '#A33A2F',
      // DERIVED — §B.6's Disabled state is "grayed background"; Subtle
      // (the one documented light-neutral surface) is reused.
      disabledBackground: { light: '#F7F9FB', dark: '#F7F9FB' },
    },
    table: {
      // SOURCE — header background "Subtle" (documented "table
      // headers, panels").
      // DERIVED — header text uses the Secondary-text convention.
      // HSL form: all 4 fields below feed `hsl(var(--x))`-wrapped vars
      // (`--table-header-bg`/`-text`, `--table-row-hover-bg`/
      // `-selected-bg`).
      headerBackground: { light: 'hsl(210 33% 98%)' /* #F7F9FB */, dark: 'hsl(210 33% 98%)' /* #F7F9FB */ },
      headerText: { light: 'hsl(227 21% 39%)' /* #4F5878 */, dark: 'hsl(227 21% 39%)' /* #4F5878 */ },
      // DERIVED — Hover uses the same Highlight-as-hover convention as
      // `surfaces.interactiveSubtle`/`navigation.item.hover` above.
      rowHoverBackground: { light: 'hsl(203 72% 94%)' /* #E6F3FB */, dark: 'hsl(203 72% 94%)' /* #E6F3FB */ },
      // SOURCE — §B.11 documents Selected as a real, distinct state
      // from Hover ("light blue background, visually distinct from
      // hover") — "Selected" (#C0DDEE) is the exact documented color
      // for exactly this purpose.
      rowSelectedBackground: { light: 'hsl(202 58% 84%)' /* #C0DDEE */, dark: 'hsl(202 58% 84%)' /* #C0DDEE */ },
      // rowLoadingPlaceholderColor / sortIndicatorColor: §B.11
      // documents that these STATES exist (skeleton-shimmer loading
      // rows, a sort-direction icon) but gives no distinct color for
      // either beyond the neutral palette already captured above —
      // correctly left unset rather than inventing a value.
    },
    badge: {
      // Mirrors `color.semantic` above, same duplication convention
      // VoiceForce's own config uses (components.badge is a `.pick` of
      // color.semantic's shape, not a reference to it).
      variants: {
        positive: { text: { light: '#2E6B3F', dark: '#2E6B3F' }, fill: { light: '#E3F0E6', dark: '#E3F0E6' }, border: { light: '#2E6B3F', dark: '#2E6B3F' } },
        caution: { text: { light: '#8A5A0B', dark: '#8A5A0B' }, fill: { light: '#FDF1DC', dark: '#FDF1DC' }, border: { light: '#8A5A0B', dark: '#8A5A0B' } },
        negative: { text: { light: '#A33A2F', dark: '#A33A2F' }, fill: { light: '#F6E3E1', dark: '#F6E3E1' }, border: { light: '#A33A2F', dark: '#A33A2F' } },
        pending: { text: { light: '#0C8FD9', dark: '#0C8FD9' }, fill: { light: '#E6F3FB', dark: '#E6F3FB' }, border: { light: '#0C8FD9', dark: '#0C8FD9' } },
        neutral: { text: { light: '#4F5878', dark: '#4F5878' }, fill: { light: '#EDF1F5', dark: '#EDF1F5' }, border: { light: '#4F5878', dark: '#4F5878' } },
      },
    },
    alert: {
      // default: FALLBACK — no distinct "neutral info" banner documented;
      // page surface + default text, matching VoiceForce's own convention.
      // destructive: SOURCE — §B.10's Error banner genuinely has a
      // colored (not neutral) background ("red/pink background"),
      // matching `color.semantic.negative.solid` above exactly.
      variants: {
        default: { light: { background: '#EEF3F7', foreground: '#121B54' }, dark: { background: '#EEF3F7', foreground: '#121B54' } },
        destructive: {
          light: { background: '#F6E3E1', foreground: '#A33A2F', border: '#A33A2F' },
          dark: { background: '#F6E3E1', foreground: '#A33A2F', border: '#A33A2F' },
        },
        // success / warning: correctly omitted — matches VoiceForce's
        // own `alert.tsx` component shape, which has no success/warning
        // variant implemented today (schema fields stay optional).
      },
    },
  },

  // Session 16.4.3.1 — DERIVED: none of KATON's documented design
  // standards specify a dialog-size concept at all (only control/input/
  // button heights). Reuses VoiceForce's exact 80vw/80vh/1400x960
  // values rather than inventing a KATON-specific size with no source.
  dialogs: {
    large: { widthVw: 80, heightVh: 80, maxWidthPx: 1400, maxHeightPx: 960 },
  },
};
