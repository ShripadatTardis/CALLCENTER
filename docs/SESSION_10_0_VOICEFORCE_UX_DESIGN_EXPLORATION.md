# Session 10.0 — VoiceForce UX/UI Design Exploration

**Status:** three isolated, working prototype directions built and browser-verified. No winner
chosen. Production VoiceForce is unchanged except for one minimal, isolated route registration.
Stopping here for human visual selection, per the session's explicit stop point.

---

## 1. Executive summary

The current production VoiceForce UI is functionally mature (Sessions 1–9.2) but structurally
still an admin-dashboard shell: a permanently-expanded 256px sidebar, a large branding block, big
page headings, and cards nested inside cards, all of which compress the actual workspace. This
session built three genuinely different, working browser prototypes — Direction A (Compact
Enterprise), Direction B (Refined Workspace), Direction C (Operations Command Centre) — that all
use the same underlying VoiceForce concepts (the 7-pillar IA, the real campaign domain model, the
Agent Contract's partial/legacy state) but differ in density, chrome behavior, and interaction
model. All three replace the permanent sidebar with a ~48–56px icon rail plus an overlay flyout
nav that never pushes the workspace, and all three implement the corrected 7-step Create Campaign
flow (Scheduling removed, "Result Mapping" renamed to "Outcome Policy"). Nothing was ranked;
nothing was merged into production.

## 2. Existing rendered UI audit

Inspected live via the connected Claude browser (see §16): Dashboard, Outbound Campaigns, Create
Campaign (stepping through Basic Info, Scheduling, Result Mapping). Observed directly:

- Sidebar is a fixed `w-64` (256px) block at desktop width, containing a large logo+wordmark
  block, a domain-selector pill, and seven collapsible pillar sections — all permanently visible,
  none of it optional chrome.
- Dashboard's `PageHeader` renders a pillar label + `text-3xl` (30px) heading + a description line
  inline in the page flow (not a fixed top bar) — this block alone occupies roughly 150–180px of
  vertical space before any real content appears, on an ~811px-tall viewport (~19–22%).
- Create Campaign's wizard renders 8 horizontal pill-shaped step buttons in a full-width row above
  a bordered `Card`, whose `CardHeader` repeats the current step's name as a second heading before
  the actual step body starts — a genuine "container nesting" pattern (page → Card → CardHeader/
  CardContent → step body), exactly what §4 of the prompt flags.
- Cards are used pervasively as the default wrapper for nearly every content block, including
  single-purpose sections that don't represent an independent object.

## 3. Existing component-system audit

Confirmed via `package.json`, `tailwind.config.ts`, and `src/components/ui/*`: Tailwind CSS +
shadcn/ui (Radix primitives) is the current and only styling stack. Available primitives relevant
to this session's needs — `Button`, `Badge`, `Card`, `Separator`, `Progress`, `Sheet`, `Drawer`,
`Popover`, `Tooltip`, `Tabs`, `ScrollArea` — are all already present. **No new component system
was installed.** The Design Lab reuses `Button`, `Badge`, `Separator`, and `Progress` directly from
`src/components/ui/*`; everything else (rail, overlay nav, accordion, master/detail panel) is
plain Tailwind-styled markup, since none of those specific shell patterns exist as reusable
primitives today and building three one-off variants directly was simpler than adding a fourth
shared abstraction this session doesn't need to commit to.

## 4. Existing chrome/workspace observations

See the quantified comparison in §9. In short: production reserves ~17% of a 1512px-wide desktop
viewport to the permanent sidebar alone, plus another ~19–22% of vertical space to the page header
block, before any operational content is visible — well past the ~10% chrome budget this session
targets.

## 5. Shared design principles

All three directions:
- Use the same `PILLARS` data (Observe/Control/Operationalize/Integrate/Improve/Measure/Govern)
  and the same demo campaign records (`src/design-lab/demoData.ts`), so comparisons are about
  chrome/density/interaction, not content differences.
- Default to a collapsed icon-only rail; full navigation is a temporary overlay (`position:
  absolute` flyout panel with a dismiss backdrop) that never resizes or pushes the workspace grid.
- Implement the corrected 7-step Create Campaign flow: Basic Info → Call Agent → Agent Contract →
  Audience → Input Mapping → **Outcome Policy** → Review & Launch. Scheduling does not exist in any
  of the three.
- Show the Agent Contract's partial/legacy state as a compact inline badge + one line of
  explanatory copy — never a large permanent "API limitation" panel.
- Show Review & Launch as a real pre-flight summary with per-item status (ready/info) and inert
  (non-functional) Save as Draft / Launch Now actions.
- Use only real domain concepts for demo data — campaign name, status, Call Agent, target counts,
  attempted/reconciled/unclassified counts, and success rate only where a real classified rate
  would exist (`null` displayed as `—`, never a fabricated percentage).

## 6. Direction A — Compact Enterprise

Maximum density. 52px icon rail; overlay flyout nav (absolute-positioned, `bg-black/20` backdrop
dismiss). Campaign list is a dense `<table>` with 7 columns visible at once, 11–13px type, minimal
row padding. Create Campaign uses a horizontal pill stepper close in spirit to production's
current pattern but compacted (small pills, no separate card header repeating the step name — the
step body sits directly under the stepper). Optimized for an operator who already knows the
product and wants the shortest path from list to detail. Files: `src/design-lab/DirectionA.tsx`.

## 7. Direction B — Refined Workspace

Apple-HIG-informed restraint (content-first hierarchy, progressive disclosure, calm typography) —
**not** Apple visual imitation: no traffic-light chrome, no SF-style icons, no translucency/glass,
no macOS window furniture. 56px rail with slightly more generous icon spacing than A. Campaign
list is a divided list (no table/borders), generous line-height, muted secondary text. Create
Campaign uses a **single-page accordion** instead of a stepper: each stage is a row that expands
in place when active and collapses to a checkmark + one-line label once complete; future stages
are visible but dimmed and unclickable until reached. This is a genuinely different interaction
model from A/C, not a reskin. Files: `src/design-lab/DirectionB.tsx`.

## 8. Direction C — Operations Command Centre

Dark, status-forward, built for someone actively monitoring/running campaigns rather than casually
browsing. Top strip surfaces live counts ("1 running", "132 unclassified") next to the breadcrumb
at all times. Campaign list is a 2-column card grid with a `Progress` bar and a status dot per
card, not a table. Create Campaign uses a **master/detail** layout: a persistent stage list on the
left (inside the workspace, not app chrome) and a detail panel on the right — a third distinct
interaction model. Files: `src/design-lab/DirectionC.tsx`.

## 9. Chrome/workspace comparison

All measurements are visual estimates from the browser-rendered screenshots and the Tailwind
classes actually used — not pixel-perfect measurements, stated as approximations per the session's
own instruction not to claim false precision.

| | Sidebar/rail width | Header height | Page padding | Container nesting | Est. workspace share (1512×811) |
|---|---|---|---|---|---|
| **Production (current)** | 256px fixed | ~150–180px (inline heading block, no fixed top bar) | 24px (`p-6`) | 3 levels (page → Card → CardHeader/CardContent) | ~65–70% |
| **Direction A** | 52px + overlay | 44px top bar | 12px (`p-3`) | 1 level (bordered div per step/section) | ~93–95% |
| **Direction B** | 56px + overlay | 48px top bar | 24px (`px-6 py-5`) | 0–1 level (dividers, no card borders in list) | ~90–92% |
| **Direction C** | 52px + overlay | 44px top bar | 12px (`p-3`) | 1 level (card grid items are genuine objects, not decorative wrappers) | ~93–95% |

All three directions meet the ~90%/≤10% target on an approximate basis; production does not.
Direction B intentionally trades a few points of density for more breathing room, consistent with
its "Refined" brief, and still clears ~90%.

## 10. Create Campaign redesign

All three implement the same 7 logical stages; none use exactly production's current horizontal-
pill model unmodified (A keeps a pill stepper but strips the redundant card-header repetition; B
replaces it with a single-page accordion; C replaces it with master/detail). In every direction the
operator can always see: where they are (highlighted stage), what's complete (checkmark/dimming),
what's next (the only enabled forward action), how to go back (Back/Cancel or clicking a completed
stage), and launch-readiness (Review & Launch's status column).

## 11. Outcome Policy findings

Renamed from "Result Mapping" to "Outcome Policy" in the step list and in all three directions'
UI copy, per §12 of the prompt — this is a display-copy change inside the Design Lab only;
production's actual step is untouched. Each direction's Outcome Policy screen explicitly frames the
Call Centre → VoiceForce Outcome Policy → operational handling chain in one short sentence, then
lists the configured rules as a flat set of "when X, then Y" statements — no invented outcome
taxonomy, no fabricated agent-specific expected outcomes (which don't exist yet, per §12 below).

## 12. Seeded-result-rule investigation

Read `src/lib/defaultResultRules.ts` (the same values `src/server/campaigns/resultRules.ts` seeds
server-side per Session 5's original design) directly rather than assuming. Finding: the two
seeded rules —

```
escalation_trigger = escalated  → needs_review (not success)
outcome = resolved              → resolved (success)
```

are **generic, conservative default rules — not authoritative Call Agent-specific expected
outcomes.** They are not arbitrary/fabricated in the sense of referencing nonexistent fields: both
`escalation_trigger` and `outcome` are real, confirmed `call-data` fields already used elsewhere in
this app (Call Logs, Analytics). But they are not sourced from any Call Agent Contract's
`expectedOutcomes` — that field is empty for every real agent today (`contractCompleteness:
'partial'`, confirmed live in Session 9.1/9.2). The code's own comment (`defaultResultRules.ts`)
already states this explicitly: "conservative defaults... never a guessed business-specific
default." **Recommendation, not implemented here:** the Design Lab's Outcome Policy screens present
these as ordinary configured rules on a real object (`campaign_result_rules`), never as if they
were Call Agent-declared outcomes — which is already the correct honest framing found in
production's current Result Mapping step. No change to defaults is proposed; they should remain as
a sensible starting point an operator edits, exactly as Session 5/9.1 designed them.

## 13. Review & Launch redesign

Each direction's Review & Launch shows: Campaign name, Call Agent, Agent Contract state ("Partial —
legacy contract"), Audience (target count), Outcome Policy (rule count) — each with a status
indicator (green dot/checkmark = ready, blue dot = informational). No genuine BLOCKER state is
demonstrated in the demo data (none of the demo campaigns are missing a required real field), so
the Design Lab does not fabricate one — the READY/INFORMATION states are real per this data;
BLOCKER styling exists in the row/status vocabulary (a red-toned variant) but has no demo instance
to render, which is itself honest given the demo dataset. Save as Draft / Launch Now are rendered
but inert — no click handler performs any action, network call, or navigation.

## 14. Accessibility/HIG review

Self-performed directly against Apple's HIG principles (the `design-reviewer` subagent could not be
dispatched from this fork — subagent spawning is disallowed for a fork; the `apple-hig` skill's own
documented fallback for that case is to perform the audit manually using its guidelines, which is
what was done). Findings, classified as instructed:

| Finding | Classification | Action |
|---|---|---|
| Muted text (`text-slate-400`, ~2.9:1 on white) used at 11–13px in several places in A and B — fails WCAG AA for body text | **Applicable to enterprise web** | **Fixed** — bumped to `text-slate-500` (~4.6:1) across both files |
| Direction A's icon buttons used `focus:outline` (fires on mouse click too) instead of `focus-visible:outline` (keyboard-only), inconsistent with B/C | Applicable to enterprise web, low severity | **Fixed** — normalized to `focus-visible` in A |
| Icon-only rail buttons are 36×36px (`w-9 h-9`), below Apple's 44pt touch-target recommendation but above WCAG 2.1 AA's 24×24px minimum | Optional | Not changed — flagged for the chosen direction's production implementation session to decide (44px is trivial to adopt if desired) |
| All icon-only nav controls already have both `aria-label` and `title` | Applicable to enterprise web — already satisfied | No action needed |
| Direction C has no light-mode variant (intentionally dark); A/B have no explicit `prefers-color-scheme` dark variant | Apple-platform-specific (system dark-mode adaptation) / optional for a fixed-theme prototype | Not changed — each direction's theme is a deliberate part of its identity, not an oversight |
| No `prefers-reduced-motion` guard | Optional — the only motion present is default color/opacity transitions on hover/focus, not animation of position or scale, so no guard is required per WCAG's own scope | Not changed |
| Overlay flyout nav is dismissible via backdrop click; keyboard `Escape`-to-close was not wired | Applicable to enterprise web, low severity | **Not fixed in this pass** — noted as a real, small gap for whichever direction reaches implementation |

Two of the three fixable, applicable findings were fixed directly in the Design Lab (contrast,
focus-visible consistency), per the session's instruction to resolve obvious applicable problems
before presenting. The remaining items are genuinely open/optional and are left for the human
decision + Session 10.1, not resolved here.

## 15. Responsive findings

All three directions were built and verified only at desktop width (~1512×811, the available
browser viewport — see §16) in this pass. Each direction's rail/overlay pattern (an icon rail with
an overlay flyout, never a layout that pushes content) is inherently closer to a mobile-friendly
model than production's current fixed sidebar (which already collapses to icon-only below `md` per
Session 7.2's responsive fix) — but a dedicated small-viewport pass (drawer-style overlay, stacked
KPI/campaign cards, touch target sizing) was not performed in this session and should not be
assumed complete. This is an honest gap, not a claim of mobile-readiness.

## 16. Browser capability used

"Playwright MCP unavailable locally because the Playwright browser download timed out; connected
Claude browser capability used for visual inspection." All screenshots in this session (production
Dashboard, production Create Campaign, and all three Design Lab directions including nav-overlay
and multi-step interactions) were captured via the connected Claude-in-Chrome browser tools
(`navigate`, `computer` screenshot/click), not Playwright and not source-code inspection alone.

## 17. Figma/Playwright tooling limitation note

Figma MCP remains unavailable (OAuth discovery fails, no Figma MCP tool registered in this
session) — not troubleshot, per instruction. Working browser prototypes replaced Figma designs
entirely for this session, as directed. Playwright remains unavailable locally per §16 above; not
reattempted.

## 18. Files added/changed for Design Lab

New, fully isolated:
- `src/design-lab/demoData.ts` — static, clearly-labeled design-demo data (pillars, demo
  campaigns, create-flow steps, demo agent contract, demo outcome rules). Never imported by any
  production page/hook/service.
- `src/design-lab/DirectionA.tsx`
- `src/design-lab/DirectionB.tsx`
- `src/design-lab/DirectionC.tsx`
- `src/design-lab/DesignLabIndex.tsx` — landing page linking to A/B/C.

Changed (minimal, additive, the one shared touch permitted by §9/§24):
- `src/App.tsx` — added 4 new route entries (`/design-lab`, `/design-lab/a`, `/design-lab/b`,
  `/design-lab/c`) and their imports. No existing route, import, or line was modified or removed.
  These routes are not linked from production navigation (`Sidebar.tsx` is untouched) and require
  no authentication (`ProtectedRoute` is not used for them, since they render only static demo
  data and never touch real hooks/services/Supabase).

Removal, when a direction is selected: delete the 5 files above and revert the 5 added lines in
`App.tsx` — no migration, no other file touched, nothing else to unwind.

## 19. Confirmation production business behavior was untouched

- `git diff --stat` scoped to this session's changes shows only the 5 new `src/design-lab/*` files
  and the additive import/route block in `src/App.tsx` — zero other files touched.
- No file under `api/`, `src/server/`, `supabase/migrations/`, or any existing `src/pages/*`/
  `src/hooks/*`/`src/services/*` was modified.
- Vercel function count confirmed unchanged: **11 → 11** (`find api -name "*.ts" ! -name "_*" | wc
  -l`).
- No database migration was run.
- No call to `POST /api/v1/call` or any other Call Centre/Partner API endpoint occurred.
- Verification was performed against a local `npm run dev` server (not a production deploy) to
  avoid any risk to the live app while iterating — a `vercel --prod` deploy was attempted once,
  failed on an expired CLI auth session, and was not retried, since local dev-server inspection via
  the connected browser fully satisfied the "real rendered browser inspection" requirement without
  needing to touch the production deployment at all.
- `tsc --noEmit`, `npm run build`, and `npm run lint` all pass; lint sits at the same 56-error
  pre-existing baseline with zero new errors introduced by any Design Lab file.

## 20. Questions for human visual selection

These are open — no recommendation is made:

1. Which base density feels right for daily operator use: A's maximum density, B's more spacious
   restraint, or C's operations-monitoring balance?
2. Is a dark-by-default operations view (C) desirable for Outbound Campaigns specifically, or
   should the whole product stay light with status color used more sparingly (A/B's approach)?
3. Which Create Campaign interaction model reads clearest for a first-time operator building a
   campaign: A's compact pill stepper, B's single-page accordion, or C's master/detail?
4. Should the chosen direction's icon-only rail targets grow from 36px toward Apple's 44px
   recommendation, or is 36px an acceptable tradeoff for density on this desktop-first product?
5. Is any element of one direction (e.g. B's accordion Create Campaign, C's live status strip, A's
   dense table) worth combining into a different direction's overall chrome/density, rather than
   adopting one direction wholesale?
6. Should the overlay nav's keyboard `Escape`-to-close gap (§14) be fixed as part of whichever
   direction is chosen, before or during Session 10.1?

---

*No winner was chosen. No prototype was merged into production. Session 10.1 (production
implementation of the selected direction) has not been started.*
