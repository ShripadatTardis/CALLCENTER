import type { VoiceForceThemeConfig } from './schema';

/**
 * Session 7.7 — build-time theme generation.
 *
 * Converts a validated `VoiceForceThemeConfig` into the exact `:root`/
 * `.dark` CSS custom property declarations `src/index.css` previously
 * hand-maintained. This is EXTRACTION's inverse: Session 7.6/7.6.1/7.6.2/
 * 7.6.3 extracted real CSS values INTO the config; this module turns the
 * config back INTO CSS text, so the config becomes the one source of
 * truth and `src/index.css`'s generated block becomes build output, not
 * hand-authored source.
 *
 * Deliberately NOT a general-purpose "every schema field" generator —
 * it emits exactly the named custom properties `src/index.css` already
 * declares (plus the two new `--nav-*` properties Session 7.7 Task 5
 * introduces for the navigation active-text states), each with an
 * explicit comment citing its schema source. A field with no CSS custom
 * property counterpart (most of `color.interactive.action`'s cyan
 * scale, `shadow`, `heights`, `icons`, `typography`, `charts`, `cards`,
 * `components.*`) is NOT emitted here — those remain literal Tailwind
 * utility classes at their call sites, unchanged, per Session 7.7's own
 * scope (badges/tables/cards/charts/typography migrate in Sessions
 * 7.8–7.10, not here).
 *
 * `--radius` is also NOT emitted — the schema stores its already-
 * resolved pixel derivatives (`radii.panel`/`control`/`tag`), not the
 * base rem value, and radii/cards migration is explicitly deferred.
 *
 * `--sidebar-accent-foreground`, `--sidebar-primary`, `--sidebar-
 * primary-foreground`, `--sidebar-ring` are also NOT emitted from the
 * config — Session 7.6.3 confirmed (by grep) they are consumed only by
 * the unused `src/components/ui/sidebar.tsx` primitive, which nothing
 * imports. The generator script preserves their literal current values
 * verbatim (see `.tooling/scripts/generate-theme-css.mjs`) rather than
 * dropping them, to avoid any risk to that unused-but-still-compiled
 * code path, while not pretending the config is their source.
 */

interface Declaration {
  name: string;
  value: string;
  comment: string;
}

function hsl(value: string): string {
  // Values in this config are already full `hsl(...)` strings or hex/
  // rgb literals (Session 7.6's own convention — see
  // docs/SESSION_7_5_UI_CONFIG_SCHEMA.md). A CSS custom property used
  // via Tailwind's `hsl(var(--x))` wrapper must itself be the bare
  // triple, not a nested `hsl(...)` call — strip the wrapper when
  // present so the emitted variable matches what `src/index.css`
  // always declared (e.g. `--background: 210 20% 98%;`, not
  // `--background: hsl(210 20% 98%);`).
  const match = value.match(/^hsl\((.+)\)$/);
  return match ? match[1] : value;
}

export function generateRootDeclarations(config: VoiceForceThemeConfig): Declaration[] {
  const { color, borders, components, navigation } = config;
  return [
    { name: '--background', value: hsl(color.surfaces.base.light.background), comment: 'color.surfaces.base.light.background' },
    { name: '--foreground', value: hsl(color.surfaces.base.light.foreground), comment: 'color.surfaces.base.light.foreground' },
    { name: '--card', value: hsl(color.surfaces.raised.light.background), comment: 'color.surfaces.raised.light.background' },
    { name: '--card-foreground', value: hsl(color.surfaces.raised.light.foreground), comment: 'color.surfaces.raised.light.foreground' },
    { name: '--popover', value: hsl(color.surfaces.overlay.light.background), comment: 'color.surfaces.overlay.light.background' },
    { name: '--popover-foreground', value: hsl(color.surfaces.overlay.light.foreground), comment: 'color.surfaces.overlay.light.foreground' },
    { name: '--primary', value: hsl(color.roles.primary.light.background), comment: 'color.roles.primary.light.background' },
    { name: '--primary-foreground', value: hsl(color.roles.primary.light.foreground), comment: 'color.roles.primary.light.foreground' },
    { name: '--secondary', value: hsl(color.roles.secondary.light.background), comment: 'color.roles.secondary.light.background' },
    { name: '--secondary-foreground', value: hsl(color.roles.secondary.light.foreground), comment: 'color.roles.secondary.light.foreground' },
    { name: '--muted', value: hsl(color.roles.muted.light.background), comment: 'color.roles.muted.light.background' },
    { name: '--muted-foreground', value: hsl(color.roles.muted.light.foreground), comment: 'color.roles.muted.light.foreground' },
    { name: '--accent', value: hsl(color.surfaces.interactiveSubtle.light.background), comment: 'color.surfaces.interactiveSubtle.light.background' },
    { name: '--accent-foreground', value: hsl(color.surfaces.interactiveSubtle.light.foreground), comment: 'color.surfaces.interactiveSubtle.light.foreground' },
    { name: '--destructive', value: hsl(color.semantic.negative.solid.light.background), comment: 'color.semantic.negative.solid.light.background' },
    { name: '--destructive-foreground', value: hsl(color.semantic.negative.solid.light.foreground), comment: 'color.semantic.negative.solid.light.foreground' },
    { name: '--border', value: hsl(borders.default.color.light), comment: 'borders.default.color.light' },
    { name: '--input', value: hsl(borders.field.color.light), comment: 'borders.field.color.light' },
    { name: '--ring', value: hsl(components.input.focusBorder.light), comment: 'components.input.focusBorder.light' },
    { name: '--sidebar-background', value: hsl(color.surfaces.sidebar.light.background), comment: 'color.surfaces.sidebar.light.background' },
    { name: '--sidebar-foreground', value: hsl(color.surfaces.sidebar.light.foreground), comment: 'color.surfaces.sidebar.light.foreground' },
    { name: '--sidebar-border', value: hsl(color.surfaces.sidebar.light.border ?? borders.default.color.light), comment: 'color.surfaces.sidebar.light.border' },
    { name: '--sidebar-accent', value: hsl(navigation.item.hover.light.background), comment: 'navigation.item.hover.light.background' },
    // Mode-independent navigation values (Session 7.7 Task 5) — declared
    // once in :root only; `.dark` does not override them, so they
    // cascade unchanged into dark mode, exactly reproducing today's
    // mode-independent Tailwind classes (no `dark:` variant existed for
    // these before this session either).
    { name: '--nav-focus-ring', value: color.interactive.action.default.focusRing ?? '', comment: 'color.interactive.action.default.focusRing (mode-independent, matches today\'s single focus-visible:outline-cyan-400 class)' },
    { name: '--nav-active-background', value: navigation.item.active.background, comment: 'navigation.item.active.background (mode-independent, confirmed no real dark override exists — Session 7.6.3 §5)' },
    { name: '--nav-active-foreground', value: navigation.item.active.foreground, comment: 'navigation.item.active.foreground (mode-independent)' },
    // Appearance-aware navigation values — declared in both :root and
    // `.dark` (see generateDarkDeclarations below).
    { name: '--nav-heading-active-text', value: navigation.item.headingActiveText?.light ?? '', comment: 'navigation.item.headingActiveText.light' },
    { name: '--nav-item-active-text', value: navigation.item.expandedActiveText?.light ?? '', comment: 'navigation.item.expandedActiveText.light' },
  ];
}

export function generateDarkDeclarations(config: VoiceForceThemeConfig): Declaration[] {
  const { color, borders, components, navigation } = config;
  return [
    { name: '--background', value: hsl(color.surfaces.base.dark.background), comment: 'color.surfaces.base.dark.background' },
    { name: '--foreground', value: hsl(color.surfaces.base.dark.foreground), comment: 'color.surfaces.base.dark.foreground' },
    { name: '--card', value: hsl(color.surfaces.raised.dark.background), comment: 'color.surfaces.raised.dark.background' },
    { name: '--card-foreground', value: hsl(color.surfaces.raised.dark.foreground), comment: 'color.surfaces.raised.dark.foreground' },
    { name: '--popover', value: hsl(color.surfaces.overlay.dark.background), comment: 'color.surfaces.overlay.dark.background' },
    { name: '--popover-foreground', value: hsl(color.surfaces.overlay.dark.foreground), comment: 'color.surfaces.overlay.dark.foreground' },
    { name: '--primary', value: hsl(color.roles.primary.dark.background), comment: 'color.roles.primary.dark.background' },
    { name: '--primary-foreground', value: hsl(color.roles.primary.dark.foreground), comment: 'color.roles.primary.dark.foreground' },
    { name: '--secondary', value: hsl(color.roles.secondary.dark.background), comment: 'color.roles.secondary.dark.background' },
    { name: '--secondary-foreground', value: hsl(color.roles.secondary.dark.foreground), comment: 'color.roles.secondary.dark.foreground' },
    { name: '--muted', value: hsl(color.roles.muted.dark.background), comment: 'color.roles.muted.dark.background' },
    { name: '--muted-foreground', value: hsl(color.roles.muted.dark.foreground), comment: 'color.roles.muted.dark.foreground' },
    { name: '--accent', value: hsl(color.surfaces.interactiveSubtle.dark.background), comment: 'color.surfaces.interactiveSubtle.dark.background' },
    { name: '--accent-foreground', value: hsl(color.surfaces.interactiveSubtle.dark.foreground), comment: 'color.surfaces.interactiveSubtle.dark.foreground' },
    { name: '--destructive', value: hsl(color.semantic.negative.solid.dark.background), comment: 'color.semantic.negative.solid.dark.background' },
    { name: '--destructive-foreground', value: hsl(color.semantic.negative.solid.dark.foreground), comment: 'color.semantic.negative.solid.dark.foreground' },
    { name: '--border', value: hsl(borders.default.color.dark), comment: 'borders.default.color.dark' },
    { name: '--input', value: hsl(borders.field.color.dark), comment: 'borders.field.color.dark' },
    { name: '--ring', value: hsl(components.input.focusBorder.dark), comment: 'components.input.focusBorder.dark' },
    { name: '--sidebar-background', value: hsl(color.surfaces.sidebar.dark.background), comment: 'color.surfaces.sidebar.dark.background' },
    { name: '--sidebar-foreground', value: hsl(color.surfaces.sidebar.dark.foreground), comment: 'color.surfaces.sidebar.dark.foreground' },
    { name: '--sidebar-border', value: hsl(color.surfaces.sidebar.dark.border ?? borders.default.color.dark), comment: 'color.surfaces.sidebar.dark.border' },
    { name: '--sidebar-accent', value: hsl(navigation.item.hover.dark.background), comment: 'navigation.item.hover.dark.background' },
    { name: '--nav-heading-active-text', value: navigation.item.headingActiveText?.dark ?? '', comment: 'navigation.item.headingActiveText.dark' },
    { name: '--nav-item-active-text', value: navigation.item.expandedActiveText?.dark ?? '', comment: 'navigation.item.expandedActiveText.dark' },
  ];
}

export function renderDeclarationBlock(declarations: Declaration[], indent = '  '): string {
  return declarations.map((d) => `${indent}${d.name}: ${d.value}; /* ${d.comment} */`).join('\n');
}
