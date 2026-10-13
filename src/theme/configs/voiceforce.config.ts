/**
 * Session 7.6 / 7.6.1 — VoiceForce Baseline Configuration (EXTRACTION,
 * NOT REDESIGN).
 *
 * Against the Session 7.6.1 revised schema (src/theme/schema.ts), which
 * resolved all seven gaps the original Session 7.6 extraction attempt
 * found. Every field below is a real, literal, cited current VoiceForce
 * value — see docs/SESSION_7_6_VOICEFORCE_BASELINE_EXTRACTION.md for the
 * full gap-resolution record and docs/SESSION_7_5_UI_CONFIG_SCHEMA.md for
 * the VoiceForce→KATON→universal-schema mapping table.
 *
 * This file has zero consumers. Nothing imports it. Not activated.
 */

import type { VoiceForceThemeConfig } from '../schema';

export const voiceforceBaselineConfig: VoiceForceThemeConfig = {
  meta: {
    id: 'voiceforce',
    name: 'VoiceForce (baseline — current production appearance)',
    version: '0.2.0',
  },

  typography: {
    families: {
      // No custom font is loaded anywhere in this codebase (confirmed:
      // no @font-face, no Google Fonts link, no `fontFamily` extension
      // in tailwind.config.ts) — Tailwind's own default `font-sans`
      // stack is VoiceForce's real, truthful current value.
      interface: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
    },
    // Every step below is a REAL arbitrary-pixel size found in the
    // codebase (grep -rohE "text-\[[0-9]+px\]", counts cited). None
    // pairs a custom line-height at any call site — `lineHeightSource:
    // 'inherited-default'` records this honestly (gap F) rather than
    // inventing a line-height value. Ordered smallest to largest.
    scale: [
      { name: '9px', sizePx: 9, lineHeightSource: 'inherited-default', weight: 400, usage: '33 occurrences — dense badges/labels' },
      { name: '10px', sizePx: 10, lineHeightSource: 'inherited-default', weight: 400, usage: '56 occurrences — compact table/metadata text' },
      { name: '11px', sizePx: 11, lineHeightSource: 'inherited-default', weight: 400, usage: '151 occurrences — the most common size, dense operational body text' },
      { name: '12px', sizePx: 12, lineHeightSource: 'inherited-default', weight: 400, usage: '33 occurrences' },
      { name: '13px', sizePx: 13, lineHeightSource: 'inherited-default', weight: 400, usage: '29 occurrences' },
      { name: '14px', sizePx: 14, lineHeightSource: 'inherited-default', weight: 400, usage: '6 occurrences' },
      { name: '16px', sizePx: 16, lineHeightSource: 'inherited-default', weight: 600, usage: '3 occurrences — headings' },
      { name: '18px', sizePx: 18, lineHeightSource: 'inherited-default', weight: 600, usage: '1 occurrence — page title' },
    ],
  },

  color: {
    // Session 7.6.2 — every `withAppearance`-wrapped field below carries
    // the REAL `.dark` override from src/index.css alongside the
    // already-verified `:root` (light) value. None invented.
    surfaces: {
      base: { // --background / --foreground
        light: { background: 'hsl(210 20% 98%)', foreground: 'hsl(222.2 84% 4.9%)' },
        dark: { background: 'hsl(222.2 84% 4.9%)', foreground: 'hsl(210 40% 98%)' },
      },
      raised: { // --card / --card-foreground
        light: { background: 'hsl(0 0% 100%)', foreground: 'hsl(222.2 84% 4.9%)' },
        dark: { background: 'hsl(222.2 84% 4.9%)', foreground: 'hsl(210 40% 98%)' },
      },
      overlay: { // --popover / --popover-foreground
        light: { background: 'hsl(0 0% 100%)', foreground: 'hsl(222.2 84% 4.9%)' },
        dark: { background: 'hsl(222.2 84% 4.9%)', foreground: 'hsl(210 40% 98%)' },
      },
      // Real current value of --accent/--accent-foreground, the neutral
      // hover-state surface (ghost button hover, dropdown item hover) —
      // gap B: structurally separated from `brand.decorative` below so
      // the two real, different concepts can never collide again.
      interactiveSubtle: {
        light: { background: 'hsl(210 40% 96.1%)', foreground: 'hsl(222.2 47.4% 11.2%)' },
        dark: { background: 'hsl(217.2 32.6% 17.5%)', foreground: 'hsl(210 40% 98%)' },
      },
      sidebar: { // --sidebar-background / --sidebar-foreground / --sidebar-border (Session 7.6.3)
        light: { background: 'hsl(0 0% 98%)', foreground: 'hsl(240 5.3% 26.1%)', border: 'hsl(220 13% 91%)' },
        dark: { background: 'hsl(222.2 47.4% 11.2%)', foreground: 'hsl(210 40% 98%)', border: 'hsl(217.2 32.6% 17.5%)' },
      },
    },
    roles: {
      primary: { // --primary / --primary-foreground
        light: { background: 'hsl(222.2 47.4% 11.2%)', foreground: 'hsl(210 40% 98%)' },
        dark: { background: 'hsl(210 40% 98%)', foreground: 'hsl(222.2 47.4% 11.2%)' },
      },
      secondary: { // --secondary / --secondary-foreground
        light: { background: 'hsl(210 40% 96.1%)', foreground: 'hsl(222.2 47.4% 11.2%)' },
        dark: { background: 'hsl(217.2 32.6% 17.5%)', foreground: 'hsl(210 40% 98%)' },
      },
      muted: { // --muted / --muted-foreground (also the real source of what the pre-revision schema called "secondaryText" — folded in here, not duplicated)
        light: { background: 'hsl(210 40% 96.1%)', foreground: 'hsl(215.4 16.3% 46.9%)' },
        dark: { background: 'hsl(217.2 32.6% 17.5%)', foreground: 'hsl(215 20.2% 65.1%)' },
      },
    },
    brand: {
      // VoiceForce has not deliberately chosen a sparing-use decorative
      // brand accent distinct from `roles.primary` — left unset rather
      // than fabricating one. (KATON's config populates this with its
      // real "Katon blue" value; VoiceForce's config legitimately omits
      // it, per the schema's `.optional()` on this field.)
    },
    interactive: {
      // Real `cyan-*` usage, transcribed directly from grep evidence
      // (docs/SESSION_7_6_VOICEFORCE_BASELINE_EXTRACTION.md §3/§C) and
      // Tailwind's own published hex values for each named shade — every
      // one of the 7 real shades found is preserved below under a
      // generic semantic name (gap C), none dropped, none renamed to a
      // VoiceForce- or Tailwind-specific label beyond what's needed to
      // identify the Tailwind source shade for traceability.
      action: {
        // The single most common real role: default link/interactive
        // text + the real default focus-ring color.
        default: { text: '#0E7490' /* cyan-700, light-mode link text */, focusRing: '#22D3EE' /* cyan-400, the most common focus-visible:outline-cyan-400 value */ },
        variants: {
          linkTextDark: { text: '#22D3EE' }, // cyan-400, dark-mode link text (32 occurrences)
          solidBackground: { background: '#0891B2' }, // cyan-600, solid interactive background (e.g. the active sidebar pillar) — 12 occurrences
          solidBackgroundHover: { background: '#06B6D4' }, // cyan-500 — 7 occurrences
          focusRingAlt: { focusRing: '#06B6D4' }, // cyan-500, used as an alternate focus-ring shade — 24 occurrences
          border: { border: '#0891B2' }, // cyan-600 — 6 occurrences
          borderStrong: { border: '#0E7490' }, // cyan-700 — 3 occurrences
          linkTextLight: { text: '#67E8F9' }, // cyan-300, a lighter link-text shade — 7 occurrences
          textStrong: { text: '#155E75' }, // cyan-800, the darkest real text shade found — 1 occurrence
          darkSurface: { background: '#083344' }, // cyan-950, a dark-mode-only surface use — 2 occurrences
        },
      },
    },
    semantic: {
      // Real values, transcribed directly from src/components/ui/badge.tsx
      // (`positive`/`escalated`/`warning` variants) for the tinted
      // text+fill presentation, and src/components/ui/alert.tsx /
      // src/index.css's --destructive for the solid presentation.
      // Session 7.6.3: text/fill/border now carry Badge.tsx's real
      // `dark:` Tailwind classes alongside the already-verified light
      // values — none invented (hex->rgb conversions of Tailwind's own
      // published shade values, same convention as color.interactive.action).
      positive: {
        // badge.tsx `positive`: border-emerald-600/40 bg-emerald-500/10
        // text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400
        text: { light: 'rgb(4 120 87)', dark: 'rgb(52 211 153)' }, // emerald-700 / emerald-400
        fill: { light: 'rgb(16 185 129 / 0.1)', dark: 'rgb(16 185 129 / 0.1)' }, // emerald-500/10, unchanged by mode
        border: { light: 'rgb(5 150 105 / 0.4)', dark: 'rgb(16 185 129 / 0.4)' }, // emerald-600/40 / emerald-500/40
        // VoiceForce has no real "solid positive" component today (no
        // success Alert exists) — this is the Tailwind emerald-500
        // value as the honest best-available real color, used nowhere
        // yet; see gap report for this caveat. Session 7.6.2: light
        // and dark are honestly identical (no second real value exists).
        solid: {
          light: { background: 'rgb(16 185 129)', foreground: 'rgb(255 255 255)' },
          dark: { background: 'rgb(16 185 129)', foreground: 'rgb(255 255 255)' },
        },
      },
      negative: {
        // badge.tsx `escalated`: border-red-600/40 bg-red-500/10
        // text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400
        text: { light: 'rgb(185 28 28)', dark: 'rgb(248 113 113)' }, // red-700 / red-400
        fill: { light: 'rgb(239 68 68 / 0.1)', dark: 'rgb(239 68 68 / 0.1)' }, // red-500/10, unchanged by mode
        border: { light: 'rgb(220 38 38 / 0.4)', dark: 'rgb(239 68 68 / 0.4)' }, // red-600/40 / red-500/40
        solid: { // --destructive / --destructive-foreground — the real, currently-used solid destructive presentation (Alert's destructive variant, destructive Button variant). Session 7.6.2: --destructive genuinely differs by appearance mode; --destructive-foreground does not (both modes: hsl(210 40% 98%)).
          light: { background: 'hsl(0 84.2% 60.2%)', foreground: 'hsl(210 40% 98%)' },
          dark: { background: 'hsl(0 62.8% 30.6%)', foreground: 'hsl(210 40% 98%)' },
        },
      },
      caution: {
        // badge.tsx `warning`: border-amber-600/50 bg-amber-500/10
        // text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400
        text: { light: 'rgb(180 83 9)', dark: 'rgb(251 191 36)' }, // amber-700 / amber-400
        fill: { light: 'rgb(245 158 11 / 0.1)', dark: 'rgb(245 158 11 / 0.1)' }, // amber-500/10, unchanged by mode
        border: { light: 'rgb(217 119 6 / 0.5)', dark: 'rgb(245 158 11 / 0.4)' }, // amber-600/50 / amber-500/40 (opacity itself also changes, not just hue)
        // No real "solid caution" component exists today either — same
        // caveat as positive.solid above. Session 7.6.2: light and dark
        // are honestly identical (no second real value to assert).
        solid: {
          light: { background: 'rgb(245 158 11)', foreground: 'rgb(255 255 255)' },
          dark: { background: 'rgb(245 158 11)', foreground: 'rgb(255 255 255)' },
        },
      },
    },
  },

  spacing: [4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 40, 48], // Tailwind's own default scale, unmodified (confirmed: no `spacing` extension in tailwind.config.ts)

  radii: {
    tag: 4, // calc(var(--radius) - 4px)
    control: 6, // calc(var(--radius) - 2px)
    panel: 8, // var(--radius)
    card: 8, // VoiceForce has no distinct card radius from panel today — same real value, not an omission
    pill: 'full',
  },

  borders: {
    // --border / --input — Session 7.6.2: both genuinely differ by
    // appearance mode, and remain equal to each other in both modes.
    default: { widthPx: 1, color: { light: 'hsl(214.3 31.8% 91.4%)', dark: 'hsl(217.2 32.6% 17.5%)' } }, // --border
    field: { widthPx: 1, color: { light: 'hsl(214.3 31.8% 91.4%)', dark: 'hsl(217.2 32.6% 17.5%)' } }, // --input (same current value as --border, structurally distinct token)
    focusRingWidthPx: 2, // `ring-2` on every focus-visible primitive (button.tsx, input.tsx — confirmed)
  },

  heights: {
    default: {
      primaryAction: 40, // Button's `default` size, h-10
      control: 36, // Button's `sm` size, h-9 — "everything else" per KATON's own framing
      formField: 40, // Input's `default` size, h-10
      filterField: 36, // the real most-common filter-bar field height observed across recent sessions' table-toolbar work
      topBar: 56, // Layout.tsx top bar — confirmed value
      sidebarWidth: 224, // Sidebar.tsx width — confirmed value
    },
    variants: {
      // Real, additional control-height variants this codebase genuinely
      // uses (gap E) — Button's `xs` size (a documented, deliberate
      // Phase-2B centralization, src/components/ui/button.tsx) and `lg`
      // size, and Input's `sm` size.
      compact: { primaryAction: 28, control: 28, formField: 32, filterField: 32, topBar: 56, sidebarWidth: 224 }, // Button `xs` (h-7) / Input `sm` (h-8)
      comfortable: { primaryAction: 44, control: 44, formField: 40, filterField: 36, topBar: 56, sidebarWidth: 224 }, // Button `lg` (h-11)
    },
  },

  icons: {
    library: 'lucide',
    strokeWidth: 2, // Lucide's own unmodified default
    default: { sizePx: 16 }, // the most common explicit icon size across this codebase's recent work (h-4 w-4 / size={16})
    variants: {
      tight: { sizePx: 12 }, // h-3
      compact: { sizePx: 14 }, // h-3.5
      comfortable: { sizePx: 20 }, // h-5, used for primary nav icons
    },
  },

  shadow: {
    // Real values, all 6 distinct Tailwind shadow utilities found in use
    // (gap D) — `default` is the most common (shadow-md, 10 occurrences);
    // every other real value preserved as a named variant, none dropped.
    default: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)', // shadow-md (Tailwind's own default value)
    variants: {
      subtle: '0 1px 2px 0 rgb(0 0 0 / 0.05)', // shadow-sm
      elevated: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)', // shadow-lg
      prominent: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)', // shadow-xl
      maximum: '0 25px 50px -12px rgb(0 0 0 / 0.25)', // shadow-2xl
      none: '0 0 #0000', // shadow-none (Tailwind's own literal value)
    },
  },

  cards: {
    // headerBackground / paddingPx: no single current value found — Card
    // usage does not consistently apply a distinct header background,
    // and padding varies by call site; correctly left unset.
  },

  navigation: {
    item: {
      // --sidebar-foreground at the real `/60` opacity modifier used in
      // Sidebar.tsx's default pillar-icon state. Session 7.6.2:
      // --sidebar-foreground genuinely differs by appearance mode.
      defaultForeground: { light: 'hsl(240 5.3% 26.1% / 0.6)', dark: 'hsl(210 40% 98% / 0.6)' },
      // --sidebar-accent / --sidebar-foreground. Session 7.6.2: both
      // genuinely differ by appearance mode.
      hover: {
        light: { background: 'hsl(240 4.8% 95.9%)', foreground: 'hsl(240 5.3% 26.1%)' },
        dark: { background: 'hsl(217.2 32.6% 17.5%)', foreground: 'hsl(210 40% 98%)' },
      },
      active: { background: '#0891B2', foreground: 'rgb(255 255 255)' }, // real value: bg-cyan-600 text-white, Sidebar.tsx's active-pillar state (same real shade as color.interactive.action.variants.solidBackground — expected, not a duplication, see schema.ts's own note on this field). Session 7.6.2: a hardcoded Tailwind utility color, not a :root/.dark CSS custom property — no confirmed second value, intentionally left unwrapped (see gap report).
    },
    // topBar: no distinct top-bar surface color found separate from
    // `color.surfaces.base` — correctly left unset.
  },

  charts: {
    seriesPalette: ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#94A3B8', '#8884d8'], // real hex values, VoiceAnalyticsTab.tsx / ChatAnalyticsTab.tsx
    gridlineColor: '#f0f0f0', // the real, repeated CartesianGrid stroke value
    // axisColor / tooltipBackground / tooltipText: no explicit current
    // value found (Recharts' own unstyled defaults are in effect).
  },

  breakpoints: { sm: 640, md: 768, lg: 1024, xl: 1280 }, // Tailwind's own stock defaults

  components: {
    button: {
      // Session 7.6.2: primary/secondary/danger/quiet all track real
      // CSS custom properties that genuinely differ by appearance mode.
      variants: {
        primary: { light: { background: 'hsl(222.2 47.4% 11.2%)', foreground: 'hsl(210 40% 98%)' }, dark: { background: 'hsl(210 40% 98%)', foreground: 'hsl(222.2 47.4% 11.2%)' } }, // --primary / --primary-foreground
        secondary: { light: { background: 'hsl(210 40% 96.1%)', foreground: 'hsl(222.2 47.4% 11.2%)' }, dark: { background: 'hsl(217.2 32.6% 17.5%)', foreground: 'hsl(210 40% 98%)' } }, // --secondary / --secondary-foreground
        quiet: { foreground: { light: 'hsl(222.2 47.4% 11.2%)', dark: 'hsl(210 40% 98%)' } }, // ghost variant — no background in its default state, hover uses color.surfaces.interactiveSubtle. Foreground tracks --primary.
        danger: { light: { background: 'hsl(0 84.2% 60.2%)', foreground: 'hsl(210 40% 98%)' }, dark: { background: 'hsl(0 62.8% 30.6%)', foreground: 'hsl(210 40% 98%)' } }, // --destructive / --destructive-foreground
      },
      // busyIndicatorColor: omitted — no Busy state exists in button.tsx today; no current value to extract.
    },
    input: {
      // Session 7.6.2: all four track real CSS custom properties that
      // genuinely differ by appearance mode.
      defaultBorder: { light: 'hsl(214.3 31.8% 91.4%)', dark: 'hsl(217.2 32.6% 17.5%)' }, // --border
      focusBorder: { light: 'hsl(222.2 84% 4.9%)', dark: 'hsl(212.7 26.8% 83.9%)' }, // --ring
      filledText: { light: 'hsl(222.2 84% 4.9%)', dark: 'hsl(210 40% 98%)' }, // --foreground
      // errorBorder / errorText: omitted — confirmed absent from input.tsx today.
      disabledBackground: { light: 'hsl(210 20% 98%)', dark: 'hsl(222.2 84% 4.9%)' }, // --background
    },
    table: {
      // Session 7.6.2: all four track real CSS custom properties that
      // genuinely differ by appearance mode.
      headerBackground: { light: 'hsl(0 0% 100%)', dark: 'hsl(222.2 84% 4.9%)' }, // --card
      headerText: { light: 'hsl(215.4 16.3% 46.9%)', dark: 'hsl(215 20.2% 65.1%)' }, // --muted-foreground
      rowHoverBackground: { light: 'hsl(210 40% 96.1% / 0.5)', dark: 'hsl(217.2 32.6% 17.5% / 0.5)' }, // --muted at the real `/50` opacity modifier
      rowSelectedBackground: { light: 'hsl(210 40% 96.1%)', dark: 'hsl(217.2 32.6% 17.5%)' }, // --muted, full opacity (confirmed distinct from hover, Session 7.5 §3.5)
      // rowLoadingPlaceholderColor / sortIndicatorColor: omitted — confirmed absent from table.tsx today.
    },
    badge: {
      // Session 7.6.3: same real badge.tsx values as color.semantic
      // above, duplicated at this schema path per the existing
      // convention (components.badge is a `.pick` of color.semantic's
      // shape, not a reference to it) — now including the real border
      // color and dark-mode text/border values.
      variants: {
        positive: {
          text: { light: 'rgb(4 120 87)', dark: 'rgb(52 211 153)' },
          fill: { light: 'rgb(16 185 129 / 0.1)', dark: 'rgb(16 185 129 / 0.1)' },
          border: { light: 'rgb(5 150 105 / 0.4)', dark: 'rgb(16 185 129 / 0.4)' },
        },
        caution: {
          text: { light: 'rgb(180 83 9)', dark: 'rgb(251 191 36)' },
          fill: { light: 'rgb(245 158 11 / 0.1)', dark: 'rgb(245 158 11 / 0.1)' },
          border: { light: 'rgb(217 119 6 / 0.5)', dark: 'rgb(245 158 11 / 0.4)' },
        },
        negative: {
          text: { light: 'rgb(185 28 28)', dark: 'rgb(248 113 113)' },
          fill: { light: 'rgb(239 68 68 / 0.1)', dark: 'rgb(239 68 68 / 0.1)' },
          border: { light: 'rgb(220 38 38 / 0.4)', dark: 'rgb(239 68 68 / 0.4)' },
        },
      },
    },
    alert: {
      // Session 7.6.2: default tracks --background/--foreground;
      // destructive tracks --background/--destructive — both genuinely
      // differ by appearance mode. Session 7.6.3: destructive's real
      // border (`border-destructive/50` light, `dark:border-destructive`
      // full-opacity dark) added; default has no explicit border
      // override in alert.tsx today (inherits borders.default.color),
      // correctly left unset rather than duplicated.
      variants: {
        default: { light: { background: 'hsl(210 20% 98%)', foreground: 'hsl(222.2 84% 4.9%)' }, dark: { background: 'hsl(222.2 84% 4.9%)', foreground: 'hsl(210 40% 98%)' } },
        destructive: {
          light: { background: 'hsl(210 20% 98%)', foreground: 'hsl(0 84.2% 60.2%)', border: 'hsl(0 84.2% 60.2% / 0.5)' },
          dark: { background: 'hsl(222.2 84% 4.9%)', foreground: 'hsl(0 62.8% 30.6%)', border: 'hsl(0 62.8% 30.6%)' },
        }, // alert.tsx's real implementation: background stays default, only text/border recolor
        // success / warning: omitted — confirmed absent from alert.tsx today.
      },
    },
  },
};
