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
 * declares (plus the `--nav-*` properties Session 7.7 Task 5 introduced,
 * and the `--status-*`/`--chart-*`/`--panel-*` properties Session 7.8
 * adds below), each with an explicit comment citing its schema source.
 * A field with no CSS custom property counterpart (most of
 * `color.interactive.action`'s cyan scale, `heights`, `icons`,
 * `typography`, `components.table`/`.input`/`.button`/`.alert`) is NOT
 * emitted here — those remain literal Tailwind utility classes at their
 * call sites, unchanged, deferred to Sessions 7.9/7.10.
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
    // Session 7.8 Task 1 — semantic status roles (Badge's tinted
    // text/fill/border presentation). `negative`'s SOLID presentation is
    // already covered by `--destructive` above; these are the separate
    // tinted values badge.tsx's `escalated`/`warning`/`positive`
    // variants (and the new `pending` variant) use.
    ...statusRoleDeclarations(color.semantic, 'light'),
    // Session 7.8 Task 4 — chart series/gridline colors.
    ...chartDeclarations(config.charts),
    // Session 7.8 Tasks 2/3 — panel/card presentation. Dimensional, not
    // color — identical in both modes, so declared once here (:root)
    // and allowed to cascade into `.dark` unchanged, same convention as
    // the mode-independent `--nav-*` values above.
    ...panelDeclarations(config.panels, config.shadow),
    // Session 7.9 — table header/row colors (appearance-aware).
    { name: '--table-header-bg', value: hsl(components.table.headerBackground.light), comment: 'components.table.headerBackground.light' },
    { name: '--table-header-text', value: hsl(components.table.headerText.light), comment: 'components.table.headerText.light' },
    { name: '--table-row-hover-bg', value: hsl(components.table.rowHoverBackground.light), comment: 'components.table.rowHoverBackground.light' },
    { name: '--table-row-selected-bg', value: hsl(components.table.rowSelectedBackground.light), comment: 'components.table.rowSelectedBackground.light' },
    // Session 7.9 — table header/row/cell geometry. Dimensional, not
    // color — identical in both modes, declared once here (:root).
    ...tableDeclarations(config.tables),
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
    ...statusRoleDeclarations(color.semantic, 'dark'),
    // Session 7.9 — table header/row colors (appearance-aware).
    { name: '--table-header-bg', value: hsl(components.table.headerBackground.dark), comment: 'components.table.headerBackground.dark' },
    { name: '--table-header-text', value: hsl(components.table.headerText.dark), comment: 'components.table.headerText.dark' },
    { name: '--table-row-hover-bg', value: hsl(components.table.rowHoverBackground.dark), comment: 'components.table.rowHoverBackground.dark' },
    { name: '--table-row-selected-bg', value: hsl(components.table.rowSelectedBackground.dark), comment: 'components.table.rowSelectedBackground.dark' },
    // Panel/chart/table-geometry tokens are mode-independent (declared
    // once in :root only — see generateRootDeclarations) and
    // intentionally NOT repeated here.
  ];
}

type StatusRoleName = 'positive' | 'caution' | 'negative' | 'pending';

function statusRoleDeclarations(semantic: VoiceForceThemeConfig['color']['semantic'], mode: 'light' | 'dark'): Declaration[] {
  const roles: StatusRoleName[] = ['positive', 'caution', 'negative', 'pending'];
  const declarations: Declaration[] = [];
  for (const role of roles) {
    const value = semantic[role];
    declarations.push({ name: `--status-${role}-text`, value: value.text[mode], comment: `color.semantic.${role}.text.${mode}` });
    declarations.push({ name: `--status-${role}-fill`, value: value.fill[mode], comment: `color.semantic.${role}.fill.${mode}` });
    if (value.border) {
      declarations.push({ name: `--status-${role}-border`, value: value.border[mode], comment: `color.semantic.${role}.border.${mode}` });
    }
  }
  return declarations;
}

function chartDeclarations(charts: VoiceForceThemeConfig['charts']): Declaration[] {
  const declarations: Declaration[] = charts.seriesPalette.map((value, i) => ({
    name: `--chart-series-${i + 1}`,
    value,
    comment: `charts.seriesPalette[${i}]`,
  }));
  if (charts.gridlineColor) {
    declarations.push({ name: '--chart-gridline', value: charts.gridlineColor, comment: 'charts.gridlineColor' });
  }
  return declarations;
}

function resolveShadow(shadowKey: string | undefined, shadow: VoiceForceThemeConfig['shadow']): string | undefined {
  if (!shadowKey) return undefined;
  if (shadowKey === 'default') return shadow.default;
  return shadow.variants?.[shadowKey];
}

function panelDeclarations(panels: VoiceForceThemeConfig['panels'], shadow: VoiceForceThemeConfig['shadow']): Declaration[] {
  const declarations: Declaration[] = [];
  const variantNames = ['summary', 'standard', 'dense', 'workspace'] as const;
  for (const name of variantNames) {
    const variant = panels[name];
    if (!variant) continue; // workspace is optional
    const prefix = `--panel-${name}`;
    declarations.push({ name: `${prefix}-radius`, value: `${variant.radiusPx}px`, comment: `panels.${name}.radiusPx` });
    declarations.push({ name: `${prefix}-padding-x`, value: `${variant.paddingPx.x}px`, comment: `panels.${name}.paddingPx.x` });
    declarations.push({ name: `${prefix}-padding-y`, value: `${variant.paddingPx.y}px`, comment: `panels.${name}.paddingPx.y` });
    if (variant.headerPaddingPx) {
      declarations.push({ name: `${prefix}-header-padding-x`, value: `${variant.headerPaddingPx.x}px`, comment: `panels.${name}.headerPaddingPx.x` });
      declarations.push({ name: `${prefix}-header-padding-y`, value: `${variant.headerPaddingPx.y}px`, comment: `panels.${name}.headerPaddingPx.y` });
    }
    if (variant.contentGapPx !== undefined) {
      declarations.push({ name: `${prefix}-gap`, value: `${variant.contentGapPx}px`, comment: `panels.${name}.contentGapPx` });
    }
    if (variant.minHeightPx !== undefined) {
      declarations.push({ name: `${prefix}-min-height`, value: `${variant.minHeightPx}px`, comment: `panels.${name}.minHeightPx` });
    }
    const resolvedShadow = resolveShadow(variant.shadow, shadow);
    if (resolvedShadow) {
      declarations.push({ name: `${prefix}-shadow`, value: resolvedShadow, comment: `panels.${name}.shadow ('${variant.shadow}')` });
    }
  }
  return declarations;
}

function tableDeclarations(tables: VoiceForceThemeConfig['tables']): Declaration[] {
  const declarations: Declaration[] = [
    { name: '--table-header-height', value: `${tables.header.heightPx}px`, comment: 'tables.header.heightPx' },
    { name: '--table-header-padding-x', value: `${tables.header.paddingXPx}px`, comment: 'tables.header.paddingXPx' },
  ];
  const densityNames = ['standard', 'expanded', 'compact'] as const;
  for (const name of densityNames) {
    const density = tables.rows[name];
    if (!density) continue; // expanded/compact are optional
    declarations.push({ name: `--table-row-${name}-padding-x`, value: `${density.paddingXPx}px`, comment: `tables.rows.${name}.paddingXPx` });
    declarations.push({ name: `--table-row-${name}-padding-y`, value: `${density.paddingYPx}px`, comment: `tables.rows.${name}.paddingYPx` });
  }
  return declarations;
}

export function renderDeclarationBlock(declarations: Declaration[], indent = '  '): string {
  return declarations.map((d) => `${indent}${d.name}: ${d.value}; /* ${d.comment} */`).join('\n');
}
