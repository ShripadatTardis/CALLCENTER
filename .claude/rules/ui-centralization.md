# CALLCENTER — Centralized UI Development Standard

The CALLCENTER application supports multiple customer-specific UI
configurations (currently **VoiceForce** and **KATON**) through one
shared component and theme architecture, built across Sessions
7.3–7.11. All new or modified UI must preserve this design.

## RULE 1 — Single source of truth

Presentation values must originate from the existing centralized
theme configuration:

- `src/theme/schema.ts`
- `src/theme/configs/voiceforce.config.ts`
- `src/theme/configs/katon.config.ts`
- `src/theme/generateCssVariables.ts`
- `src/lib/typography.ts`

Do not introduce independent styling systems.

## RULE 2 — No new localized design values

Do not introduce new hardcoded values for: colours, typography
sizes, font weights, line heights, spacing scales, padding/margins,
component heights, dialog dimensions, tab dimensions, border radii,
shadows, icon sizes, or hover/selected/focus presentation.

Use existing shared tokens and component variants. When a required
reusable design property has no appropriate token, extend the
universal schema, populate every supported customer configuration,
and extend the existing CSS generator where required.

## RULE 3 — Semantic styling

Use semantic presentation roles (e.g. primary action, secondary
action, positive/negative/pending/neutral status, standard panel,
dense panel, page title, panel heading, table body). Do not name
schema properties after arbitrary literal colours or individual
screen names. Preserve actual business-status distinctions.

## RULE 4 — Customer independence

The same React components must work with every supported customer
configuration. Do not introduce customer-specific screen components,
customer-name conditionals in TSX, customer-specific CSS overrides,
parallel theme engines, or duplicated customer stylesheets. Customer
differences belong in configuration values, not separate
implementations.

## RULE 5 — Light/dark independence

Customer configuration and appearance mode (Light/Dark/System) are
separate dimensions. Preserve both. Do not confuse customer
selection with the existing appearance preference.

## RULE 6 — Presentation vs structure

React components own structural composition and functional
behaviour. Central configuration owns reusable visual presentation
values. Do not attempt to express every structural layout decision
as a theme property — fixed structural relationships and responsive
layout algorithms may remain in components. Reusable dimensions and
visual standards must still be centrally configurable.

## RULE 7 — Existing functionality

Styling changes must not alter business logic, API integrations,
authentication/authorization, QA evaluation/scoring, data mappings,
campaign workflows, or navigation behaviour. Preserve functional
usability.

## RULE 8 — No blind migrations

Do not automatically replace all Tailwind values. Use semantic
judgment. Preserve intentional density differences in operational
tables, QA workspaces, and dashboards. Existing documented
exceptions remain valid unless explicitly included in a migration
task.

## RULE 9 — CSS generation correctness

Tailwind utility classes must be statically discoverable — do not
construct Tailwind class names through runtime string interpolation
(this has caused a real, previously-shipped zero-CSS regression in
this codebase). Verify generated CSS rules actually exist. When
using HSL variables, ensure the resulting CSS colour expression is
valid (e.g. wrap bare HSL triples in `hsl(...)`). A successful
typecheck alone does not prove that CSS renders correctly.

## RULE 10 — Sub-agent compliance

All sub-agents and implementation forks must follow this rule. The
coordinating agent is responsible for verifying that delegated
changes comply — sub-agents must not bypass the centralized
configuration through local styling shortcuts.

## RULE 11 — Verification

For every UI implementation:

1. Check actual token/component consumption.
2. Verify that new values do not bypass the central configuration.
3. Run `npm run typecheck`.
4. Run `npm run verify:full`.
5. Verify generated CSS where styling changed.
6. Test the affected UI in VoiceForce.
7. Verify KATON compatibility where applicable.
8. Report exceptions honestly.

For significant presentation changes, prove that changing a central
configuration value changes the corresponding rendered UI without
editing individual screen code.

## RULE 12 — Existing gaps

The application still contains documented legacy typography and
presentation literals (see `docs/SESSION_7_10_1_CONFIGURATION_COVERAGE_COMPLETION.md`
and `docs/SESSION_7_10_2_TYPOGRAPHY_CONSUMER_MIGRATION.md` for the
current disclosed inventory). Do not treat these as authorization to
introduce additional hardcoded values. Do not undertake unrelated
legacy migrations without explicit approval.
