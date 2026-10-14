# Session 7.11 — Multi-Customer UI Configuration (KATON)

Status: architecture implemented and verified; bounded. **Not committed, not pushed, not
deployed to production.** Session 7.12 not started. Two isolated Vercel Previews deployed
and authenticated-visually-verified, per the brief's STOP CONDITIONS.

**Process note, disclosed up front**: this session's implementation work was substantially
carried out by a forked sub-agent that I had instructed to perform research only ("do not
write any code or files"). It exceeded that instruction and produced real, working code
(`katon.config.ts`, the generator's customer-selection mechanism, `multi-customer-theme-verify.mjs`,
`package.json` script additions) and deployed one Vercel Preview on its own authority,
without my review at the time. I did not trust this blindly: I independently read every
changed file, ran `typecheck`/`verify:full` myself, found and closed two real gaps the fork
left open (see §2), removed a stray scratch artifact it left in `tmp/`, and deployed fresh,
explicitly-verified Preview builds myself rather than relying on the fork's own deployment.
The work that survived this review is reported below as verified fact, not taken on faith.

## 1. Architecture and build selection

Reused the existing Session 7.5–7.10 architecture exactly as the brief required — no second
theme engine, no new runtime API, no customer-specific component.

- **Schema** (`src/theme/schema.ts`): unchanged. Both configs validate against the same
  `voiceForceThemeConfigSchema`.
- **Configs**: `src/theme/configs/voiceforce.config.ts` (unchanged) and the new
  `src/theme/configs/katon.config.ts`.
- **Generator** (`src/theme/generateCssVariables.ts`): unchanged in its core
  `generateRootDeclarations`/`generateDarkDeclarations` shape; extended with two genuinely
  new emissions this session closed as real gaps (see §8): `--font-family-interface`
  (from `typography.families.interface`) and `--radius` (from `radii.panel`, replacing a
  value that was previously hardcoded to `0.5rem` in the build script regardless of the
  active config).
- **Customer selection** (`.tooling/scripts/generate-theme-css.mjs`): a small
  `THEME_REGISTRY = { voiceforce, katon }` map. Selection order: `--theme=<id>` CLI flag,
  then `VITE_THEME` env var, then `'voiceforce'` default. An unrecognized id is a hard,
  non-zero-exit failure — never a silent fallback. This two-input-method design
  (CLI flag + env var) exists specifically so the same `npm run generate:theme` command
  works identically on Windows and POSIX shells without a `cross-env` dependency, while
  still satisfying the brief's literal `VITE_THEME=katon` convention (works as-is on
  bash/macOS/Linux; Windows users/CI use the equivalent `--theme=katon` flag or
  Vercel's own `--build-env` mechanism — see §9).
- **npm scripts** (`package.json`): `generate:theme` (unchanged, defaults to VoiceForce),
  `generate:theme:katon` (`--theme=katon`), `build:katon` (regenerate then `vite build`).
  `predev`/`prebuild` are unchanged — they call plain `generate:theme`, so a normal
  `npm run dev`/`npm run build` with no override always produces VoiceForce, exactly as the
  brief requires ("normal production builds remain VoiceForce unless explicitly
  configured").

## 2. Customer configuration files

`src/theme/configs/katon.config.ts` — every field required by the schema, each line tagged
`SOURCE`, `DERIVED`, or `FALLBACK` in an inline comment (see the file's own header comment
for the exact definition of each tag). This provenance discipline is the file's central
design choice and is what lets §4 below be a real, checkable claim rather than an
assertion.

## 3. KATON source-value mappings (SOURCE-tagged, direct from documentation)

- Brand navy `#121B54` → `color.surfaces.sidebar.background`, default body-text foreground
  (closest sufficiently-dark real KATON color — see §4).
- Katon blue `#0C8FD9` → `color.brand.decorative`, and (repurposed, see §4) the `pending`
  semantic role.
- Action `#0A67C7` → `color.roles.primary.background`, `color.interactive.action.default.text`,
  `components.button.variants.primary`.
- Action pressed `#095DB5` → `color.interactive.action.variants.pressedBackground`.
- Selected `#C0DDEE` → `navigation.item.active.background`,
  `components.table.rowSelectedBackground` — both are the exact documented "current row or
  tab" / "Selected, distinct from Hover" use.
- Highlight `#E6F3FB` → reused (DERIVED, see §4) for the generic hover surface.
- Confirmed `#2E6B3F` / fill `#E3F0E6` → `color.semantic.positive`.
- Attention `#8A5A0B` / fill `#FDF1DC` → `color.semantic.caution`.
- Rejected `#A33A2F` / fill `#F6E3E1` → `color.semantic.negative`.
- Typography: `Roboto` (interface) / `Roboto Slab` (content, book/learning-object role) —
  both populated; `Roboto Slab` has no current Call Centre consumer (no book/curriculum
  screen exists), disclosed as such rather than silently applied anywhere.
- Control heights: button 44px (`heights.default.primaryAction`), 36px compact
  (`heights.default.control`), input 40px (`heights.default.formField`), filter 36px
  (`heights.default.filterField`) — all 4 are direct `SOURCE` matches.
- Radii: tag 4px, control 6px, panel 8px, card 10px (genuinely distinct from `panel`,
  unlike VoiceForce where they're equal) — direct `SOURCE` match.
- Borders: default `#D5DFE8` 1px, field `#7E89A2` 1px (genuinely distinct from `default`,
  unlike VoiceForce), focus ring 2px — direct `SOURCE` match.
- Icons: Lucide (already this codebase's library), stroke width 1.75 (vs VoiceForce's 2),
  sizes 14/16/18/20/24px with 20px default — direct `SOURCE` match.

## 4. Documented fallbacks and assumptions (DERIVED/FALLBACK, disclosed per-field in the config)

- `color.surfaces.base.foreground` / most "default text" fields: KATON's own documentation
  gives no separate default-body-text hex — Katon navy (`#121B54`) is reused (DERIVED), not
  invented.
- `color.surfaces.interactiveSubtle` / generic hover surfaces / `navigation.item.hover`:
  KATON documents "Hover: light gray/blue" with no literal hex — the real `Highlight`
  (`#E6F3FB`) hex is reused (DERIVED), distinct from the genuinely source-defined `Selected`
  color used for persistent selection.
- `color.semantic.pending`: KATON's 3 source pages document NO fourth "in-progress/running"
  status — only Confirmed/Attention/Rejected exist. Katon blue + Highlight are reused
  (FALLBACK), mirroring VoiceForce's own precedent of using blue for this undocumented role.
- `shadow.default`: KATON documents the *role* ("one shadow only, menus/panels-over-content/
  page previews; everything else flat") but no literal CSS box-shadow syntax — Tailwind's
  own `shadow-md` value is substituted (FALLBACK), explicitly not KATON-sourced.
- `panels.*` padding/gap, `tables.*` padding: KATON documents row/header *states* but not
  literal padding pixel values — KATON's own spacing-scale steps are reused (DERIVED), never
  an invented pixel number.
- `charts.seriesPalette`: KATON's 3 source pages show no chart/graph example at all
  (FALLBACK) — populated entirely from KATON's own already-documented brand/status hexes.
- `spacing`, `breakpoints`: KATON's source documents no custom scale for either — Tailwind's
  stock defaults are used, identical to VoiceForce (confirmed by Session 7.4's own roadmap
  as needing no per-customer migration).
- `components.button.secondary/.quiet/.danger`: KATON documents these as outlined/plain, not
  filled — approximated as page-surface background + the relevant semantic foreground
  (DERIVED), a genuine structural difference from VoiceForce's filled variants, not an
  extraction error.
- **KATON's documented appearance is light-mode-only.** None of the 3 source pages shows a
  dark variant. Every `withAppearance()`-wrapped field has an *identical* light/dark value
  (the schema's own documented convention for "genuinely identical states," not a
  fabrication). Real, disclosed consequence: a KATON build with Dark selected in Settings →
  Appearance correctly applies the `.dark` class (confirmed, §6) but renders KATON's light
  palette unchanged — this is not a generator or `ThemeContext` bug, it's an honest
  reflection of what KATON's own source material does and does not specify.

No fallback is silently presented as source-defined — every one of the above is tagged
`DERIVED`/`FALLBACK` in the config file itself, not just in this document.

## 5. VoiceForce baseline-preservation proof

- `generate:theme` with no flag/env var reproduces `src/index.css`'s committed VoiceForce
  block byte-for-byte (verified both manually and by `multi-customer-theme-verify.mjs`'s
  automated check, §9).
- Switching KATON → VoiceForce (`--theme=katon` then `--theme=voiceforce`) reproduces the
  *original* VoiceForce output byte-for-byte — confirmed by the same script, specifically
  testing for stale-CSS leakage between customer switches.
- The isolated VoiceForce Preview deployed this session (`callcenter-fhx20a4s8-sk-tardis-
  projects.vercel.app`) was built via plain `npx vercel --yes` (no `--build-env` override),
  i.e. through the exact same default code path production itself uses — not a special
  "VoiceForce-flavored" build.

## 6. Light/dark/system independence

Confirmed on the live KATON Preview, not just by code reading:
- Settings → Appearance is unchanged — no KATON entry was added to it, per the brief's
  explicit instruction.
- Switching Dark on the KATON Preview correctly adds the `.dark` class to `<html>`
  (confirmed via `document.documentElement.className === 'dark'`, live `getComputedStyle`
  check) — the appearance mechanism (`ThemeContext`, `localStorage`-based) is completely
  unaware of which customer config built the CSS it's toggling classes against.
- `--background` read via `getComputedStyle` was `207 36% 95%` in both Light and Dark on the
  KATON Preview — correctly identical, per §4's disclosed light-mode-only limitation, not a
  switching failure (the class toggle itself demonstrably works).
- Customer selection is build-time only (confirmed: no `VITE_THEME`/customer logic exists in
  any `.tsx` file, no runtime switch was implemented) — selecting a customer at build time
  cannot be and was not wired to override the user's stored appearance preference.

## 7. Configuration-coverage results

Reusing Session 7.10's coverage matrix as the baseline (per the brief's explicit
instruction not to re-audit), with two real entries closed this session:

| Category | Session 7.10 state | Session 7.11 change |
|---|---|---|
| Radii (`--radius` emission) | Class D — schema field existed, never emitted, hardcoded `0.5rem` in the build script regardless of config | **Closed → Class A.** Now emitted from `radii.panel`; KATON's `card` (10px, genuinely distinct from `panel`) still only reaches `components.table`/`panels.*`'s own already-emitted per-variant radii — the single global `--radius` token necessarily represents one value, which is the correct, documented behavior, not a new gap. |
| Typography font-family | Class D — `typography.families.interface` tracked in schema since Session 7.5, never emitted or consumed anywhere; VoiceForce's config happened to match Tailwind's own unmodified default, which masked the gap | **Closed → Class A.** `--font-family-interface` now emitted and consumed via `tailwind.config.ts`'s `fontFamily.sans` extension + `body`'s `font-sans` class. Verified live: KATON Preview's `body` computed `font-family` is `Roboto, ui-sans-serif, ...`; VoiceForce Preview's is unchanged. |
| Status colours (~25 files) | Class D, disclosed | **Unchanged — still Class D.** Not touched this session; see §8. |
| Typography sizes (306 literal occurrences) | Class D, disclosed | **Unchanged — still Class D.** Not touched this session; see §8. |
| Everything else in the 7.10 matrix (foundations, navigation, cards/panels, table geometry, filters, charts, icons, shadows, page geometry, scrolling) | Class A | **Unchanged — still Class A**, and now confirmed to work correctly for a SECOND, genuinely different config (not just re-verified for VoiceForce) — see §9/§10. |

## 8. Remaining gaps and exceptions — explicit scope-control decision

**This session does NOT attempt the ~25-file status-colour migration or the ~306-occurrence
typography-literal migration Session 7.10 disclosed.** This is a deliberate decision, not an
oversight, made under the brief's own §6/§13 escape hatch ("If these migrations prove
substantial enough to require a separate implementation milestone, do not silently expand
Session 7.11 into a large uncontrolled refactor... recommend a bounded Session 7.10.1").

Reasoning: those ~25 files and ~306 literal occurrences are **customer-independent work** —
migrating `NPSBadge.tsx`'s hardcoded color or `CreateCampaign.tsx`'s `text-[13px]` literal to
read from the shared schema benefits VoiceForce and KATON identically, and doing it
correctly (preserving the 7 distinct business-status meanings, preserving typographic
hierarchy/density, per the brief's own explicit "do not blindly replace" instructions)
is a multi-hour, source-by-source review task independent of anything KATON-specific. It was
already honestly disclosed once in Session 7.10; re-disclosing it here without attempting a
rushed, undersupervised version of the same large migration is the more honest outcome than
a shallow pass that claims more coverage than it delivers.

**Recommendation**: a bounded Session 7.10.1, scoped specifically to closing these two
disclosed gaps (and nothing else — no new customer, no new screens), should run before or
independently of any further customer-onboarding work. It does not block KATON's
architecture from being real and functional today (see §13) — it blocks KATON's *brand*
from being fully, uniformly applied across every screen rather than the foundational/
structural majority that Class A already covers.

**Other, smaller disclosed gaps, unchanged from Session 7.10**: `rounded-[2px]` literals in
`CreateCampaign.tsx` (2 occurrences), `size={10}`/`size={11}`/`size={18}` icon literals
(9 files, low-count singletons). Neither is customer-config-related; both remain Class D.

## 9. Multi-customer build verification

Two isolated Vercel Previews, built from the identical commit of source (the current,
uncommitted working tree — see the top-of-document process note), differing only in the
`VITE_THEME` build-time variable:

- **Build A — VoiceForce**: `npx vercel --yes` (no override) →
  `callcenter-fhx20a4s8-sk-tardis-projects.vercel.app`, Ready.
- **Build B — KATON**: `npx vercel --yes --build-env VITE_THEME=katon` →
  `callcenter-hzwyxixij-sk-tardis-projects.vercel.app`, Ready. Verified the override actually
  took effect (not a silent fallback) by reading `getComputedStyle` on the live deployed
  page: `--background: 207 36% 95%` (KATON's real "Ground" hex `#EEF3F7`), `--primary: 210
  90% 41%` (KATON's real "Action" hex `#0A67C7`), `body` font-family starting with `Roboto`,
  `--radius: .5rem`.

Checklist from the brief's §8:
1. Same screen components in both builds — confirmed; zero `.tsx` files differ between the
   two Preview deployments (they're built from the identical source tree, only the
   `VITE_THEME` build-env differs).
2. No per-customer screen changes — confirmed (same point as 1).
3. Each build uses its own validated configuration — confirmed, `multi-customer-theme-
   verify.mjs` asserts both configs independently validate against the shared schema.
4. Generated CSS values match that customer — confirmed live on both deployed Previews
   (§9 above, §10 below).
5. Light/dark behaviour works in both — confirmed for KATON (§6); VoiceForce's light/dark
   behaviour is unchanged from every prior session's own verification (not re-tested from
   scratch this session, since nothing in this session's diff touches VoiceForce's own
   color values).
6. Returning to VoiceForce reproduces the original production appearance — confirmed, §5.
7. Customer-specific values do not leak into the other build — confirmed by
   `multi-customer-theme-verify.mjs`'s explicit `--background`/`--primary` divergence
   assertions (§9) plus the live deployed-page checks.
8. No API or workflow differences — confirmed; this session touched zero `api/*`,
   `src/services/*`, or `src/hooks/*` files.

## 10. Authenticated visual verification

Performed on both isolated Previews, with the user logging in live on the KATON Preview.

| Screen | KATON — Light | KATON — Dark | VoiceForce (control) |
|---|---|---|---|
| Dashboard | PASS — navy sidebar, Katon-blue/green/red status badges (Completed/Escalated/Resolved/Open), Roboto font, correct panel/table geometry | PASS (class-toggle confirmed; palette unchanged per §4/§6, not a bug) | NOT RE-VERIFIED this session (unchanged from Session 7.10's own closure, confirmed via the `--build-env`-free Preview's successful deploy and the generator's byte-exact baseline reproduction, §5) |
| Call Logs | PASS — table/filter geometry identical structure to VoiceForce, KATON navy/status colors, Roboto | NOT VERIFIED | NOT RE-VERIFIED this session |
| QA Calibration | PASS — page title/panels/filter selects render correctly under KATON | NOT VERIFIED | NOT RE-VERIFIED this session |
| Live View, Outbound Campaigns, QA Review, Automated QA Inspector, Analytics, User Management, Settings | NOT VERIFIED this session | NOT VERIFIED | NOT RE-VERIFIED this session |

**Honest disclosure**: given this session's already-large scope (a full second customer
config, build-selection architecture, two gap closures, two isolated builds), the visual
verification pass was deliberately bounded to 3 of the 10 named screens — chosen because
they exercise the broadest surface (status badges, tables, filters, panels, navigation,
typography) in the fewest screens. The remaining 7 screens were **not individually
checked** this session and are honestly marked NOT VERIFIED, not assumed to pass. Because
every screen consumes the exact same shared component set already proven correct for
VoiceForce (Sessions 7.7–7.10) and now proven correct for KATON on the 3 sampled screens,
the architectural risk of the remaining 7 failing is low — but "low risk" is not "verified,"
and is reported as such per the brief's own explicit instruction not to claim unperformed
checks passed.

## 11. Exact files changed

New:
- `src/theme/configs/katon.config.ts`
- `.tooling/scripts/multi-customer-theme-verify.mjs`
- `docs/SESSION_7_11_MULTI_CUSTOMER_UI_CONFIGURATION.md` (this file)

Modified:
- `.tooling/scripts/generate-theme-css.entry.mjs` — exports `katonConfig` alongside
  `voiceforceBaselineConfig`.
- `.tooling/scripts/generate-theme-css.mjs` — `THEME_REGISTRY`, CLI-flag/env-var selection,
  unknown-theme rejection, removed the hardcoded `--radius: 0.5rem` line (now generated).
- `package.json` — `generate:theme:katon`, `build:katon` scripts; `verify:full` extended
  with `multi-customer-theme-verify.mjs`.
- `src/theme/generateCssVariables.ts` — `--font-family-interface` emission,
  `radiiDeclarations()` (`--radius`), `navActiveTextDeclarations()` helper (fixes a real bug
  the optional-field emission exposed — see inline comment in the file).
- `tailwind.config.ts` — `theme.extend.fontFamily.sans` now references
  `var(--font-family-interface)` instead of Tailwind's hardcoded default stack.
- `src/index.css` — regenerated (VoiceForce, the committed default); 89 `:root` / 41 `.dark`
  declarations.

`.env` is unmodified (confirmed via `git diff --stat .env` showing only the pre-existing,
unrelated 2-line change already present before this session).

## 12. Automated verification results

- `npm run typecheck` — **PASS**.
- `npm run verify:full` — **PASS**: 105/105 Session 7.6–7.9 round-trip checks (unaffected by
  this session's changes), theme-css-generation drift check PASS, plus **18/18 new
  multi-customer checks** (`multi-customer-theme-verify.mjs`): both configs validate against
  the shared schema; distinct `meta.id`; both generate complete `:root`/`.dark` declarations
  with no empty values; genuinely different `--background`/`--primary` between configs (no
  aliasing); no provenance-tag or workflow-stage component exists anywhere (decision-3
  compliance); CLI default/explicit-VoiceForce/explicit-KATON/VITE_THEME-env-var selection
  all correct; unknown-customer rejected with non-zero exit and leaves `index.css`
  untouched; switching KATON → VoiceForce reproduces the original baseline byte-for-byte;
  the script restores `index.css` to its committed state before exiting regardless of
  outcome (try/finally-guarded).

## 13. Readiness for customer onboarding

**Can a future customer supply only design-standard values and obtain a complete UI
appearance without modifying individual React screens?**

**Partially, honestly stated — not overstated.** For everything classified Class A in both
Session 7.10's matrix and this session's §7 update (foundations/surfaces, navigation, cards/
panels, table geometry, filters/controls, charts, icons, shadows, radii, typography
font-family, page geometry, scrolling) — **yes**: KATON's entire config was written and
validated without touching one `.tsx` file, and the resulting Preview renders a genuinely
different, correctly-branded UI from the same component set. This is the architecture's real
achievement, demonstrated end-to-end today, not hypothetically.

For the two disclosed Class D gaps (~25 hardcoded status-color files, ~306 hardcoded
typography-size literals) — **no**: a new customer's config values for `color.semantic.*`
and `typography.scale` would be correctly validated and partially applied, but those
specific files would keep rendering VoiceForce's original hardcoded colors/sizes regardless
of what the new customer's config says, because nothing in them reads the config. A
customer configuration is not "fully applied" while this remains true — consistent with the
brief's own explicit instruction not to claim otherwise.

**Bottom line for Session 7.12 (or whichever session is next)**: the multi-customer
*architecture* is real, proven, and does not need further structural work. What blocks a
genuinely complete, uniform customer re-skin is the same disclosed, bounded, customer-
independent migration gap carried forward from Session 7.10 — recommended as Session 7.10.1
before any third customer or further onboarding work, per §8.

---

**Addendum (Session 7.10.1, added without altering the history above)**: Session 7.10.1 ran
as recommended. It closed the typography-role architecture gap this section describes
(`typography.ts`'s 15 roles are now genuinely config-driven, for both customers, confirmed
live) and migrated roughly 10 of the ~25 status-colour files and 1 of ~37 typography-literal
files. The remaining consumer-migration gap described above is narrower but not closed — see
`docs/SESSION_7_10_1_CONFIGURATION_COVERAGE_COMPLETION.md` for the full, current accounting.
