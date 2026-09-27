# Session 11.1 — Dashboard Implementation (Bounded Operational Workspace)

Implements `docs/SCREEN_REVIEW_01_DASHBOARD.md`'s approved design. Deployed to production and verified live.

## 1. Executive summary

Dashboard's Recent Calls section had a real bug: the backend does not reliably honor `page_size`, so a `page_size: 5` request could return many more rows, and the UI had no defensive cap — production was showing 15 rows, 10 of them stale duplicate "active" calls for one customer. This session fixes it with a hard **client-side** cap (never trusting the API parameter alone), adds a new "Needs Attention" section that surfaces exactly the escalated/stale-active records that were previously polluting "Recent," deduplicates the two sections, adds click-through to the existing interaction/agent detail views, labels the three all-time metrics honestly, and rebalances the layout. Verified live at all 4 required viewports × both themes with zero horizontal overflow anywhere, and the Dashboard is essentially viewport-bounded at 1536×1024 (zero internal scroll) and modestly bounded at 1366×768 (~176px fixed internal scroll, not data-dependent — confirmed via a synthetic data-growth test).

## 2. Source review used

`docs/SCREEN_REVIEW_01_DASHBOARD.md` (the approved design), `src/pages/Dashboard.tsx`, `src/components/agents/AgentActivityPanel.tsx`, `src/components/call-logs/InteractionDetailDialog.tsx`, `src/lib/format.ts`, `src/types/interaction.ts`, `App.tsx` (route confirmation).

## 3. Files changed

- `src/pages/Dashboard.tsx` — Needs Attention section, Recent Calls capping/dedup, click-through wiring, metric labels, layout proportions.
- `src/components/agents/AgentActivityPanel.tsx` — added optional `onAgentClick` prop (Live View's existing usage is unaffected — no prop passed there, cards stay non-interactive exactly as before).
- `src/lib/format.ts` — added `formatStaleDurationHuman` (presentation-only).

No other files touched. No `api/*`, `src/server/*`, or route changes.

## 4. Dashboard information hierarchy

1. Metric strip (what's happening now, labeled with real time basis)
2. Needs Attention (what requires attention — new)
3. Recent Calls + AI Agent Roster side by side (what happened recently / how are agents operating)
4. Action row (where to go next)

## 5. Bounded-workspace implementation

Both new/changed summary sections are hard-capped **client-side**, independent of whatever the backend actually returns:

- `attentionItems = classifyAttention(interactions).slice(0, 5)` — regardless of how many qualify.
- `recentCalls = interactions.filter(not in attentionIds).filter(not stale-active).sort(newest first).slice(0, 5)`.
- AI Agent Roster: wrapped in a `max-h-[420px] overflow-y-auto` container so its Dashboard footprint stays fixed regardless of roster size (internal scroll only if the roster grows past that allocation; today's 3 agents don't need it).

The `.slice(0, 5)` calls are the actual defense — they do not depend on the upstream `page_size` defect ever being fixed.

## 6. Metric time-basis treatment

`FCR rate`, `Escalation rate`, `Avg handle time` labels now read `(all time)`. `Active calls` / `Active agents` are unchanged (correctly not labeled, since they're current-moment derived values). No calculation changed anywhere — confirmed via diff, only the label strings changed.

## 7. Needs Attention implementation

Deterministic classification over the same `interactions` array Dashboard already fetches:
- `escalated`: `outcome === 'escalated'`
- `stale`: `status === 'active' && isStaleDuration(durationSeconds)` (existing helper, threshold unchanged)
- `escalated-stale`: both

No LLM, no inference, no severity score, no sentiment. Sort: escalated-stale first, then escalated, then stale, newest `startTime` first within each group — exactly the order specified, no invented weighting.

## 8. Recent Calls selection/capping

Filters out anything in `attentionIds` (the shown top-5 Attention set) **and** filters out all stale-active rows outright (even ones beyond the Attention cap), so stale rows can never leak into "Recent" regardless of how many exist. Sorted by `startTime` descending, capped to 5.

## 9. Deduplication logic

`attentionIds` is built from the exact 5 interactions rendered in Needs Attention and excluded from Recent Calls before capping — verified live: none of the Needs Attention interaction IDs reappear in the Recent Calls list in the production screenshots (Needs Attention shows 5× "Kalyani Nakat / General Inquiry / Escalated + Stale," Recent Calls shows "Loan Application / Pending Transfer / Car Loan Inquiry / ... Resolved" — genuinely distinct records).

## 10. Stale-active treatment

Category badges are visually and textually distinct: **"Escalated"** (destructive/red) vs **"Stale active record"** (amber, outline) — never implying a stale record is something a supervisor can act on the way a genuine escalation might be (Session 8's Control Capability Audit already confirmed there's no real intervention capability regardless). Stale rows show a human-readable duration via the new `formatStaleDurationHuman` (e.g. "15d 17h active") instead of the terser "402h+ (stale)" form used elsewhere — presentation-only, same underlying `durationSeconds` value, same `STALE_DURATION_SECONDS` threshold, unchanged.

## 11. Agent Roster refinement

Concept kept (name, active-call count, direction, language, persona — all real, unchanged). Added `onAgentClick` navigation to `/ai-agents/:agentId` using the real `agentId` — no `agent_version` anywhere. Bounded via CSS max-height/scroll (see §5) rather than a hard slice, since a full real roster is more useful than an artificially truncated one; the scroll container caps the *visual* footprint regardless of count.

## 12. Click-through behavior

- Needs Attention row → `InteractionDetailDialog` (reused component, `interaction` prop set directly from the already-fetched object — no new fetch, no duplicate detail viewer).
- Recent Calls row → same dialog, same pattern.
- Agent Roster card → `/ai-agents/:agentId`.
- "View all" (shown on Needs Attention only when it has more than 5 eligible records; always shown on Recent Calls) → plain `navigate('/call-logs')`. Pre-filtered cross-route state was not attempted — Call Logs' current filter model wasn't verified to cleanly support an incoming escalated/stale preset, and the prompt explicitly allows plain navigation as sufficient; not treated as a gap, per the approved design's own §14 guidance.

Direct row→detail click-through was **achieved**, not deferred — `InteractionDetailDialog` takes a full `Interaction` object (confirmed via its existing usage in `AgentDetail.tsx`), which Dashboard already has in memory from `useCallData`, so reuse was genuinely a prop-wiring change, not new logic.

## 13. Desktop layout

Needs Attention: full-width card (per the approved design — a short list scans better full-width than squeezed into a half column). Recent Calls / Agent Roster: `grid-cols-1 lg:grid-cols-[3fr_2fr]` (was a blind `lg:grid-cols-2` 50/50 split) — confirmed via screenshot that Recent Calls' wider row content (name + intent + phone + badge + duration) now has proportionally more room than the compact roster.

## 14. Tablet/mobile behavior

Tablet (768): single column, same vertical order (metrics → Needs Attention → Recent Calls → Agent Roster → actions) — no new breakpoint logic needed, the existing `lg:` breakpoint already collapses the grid correctly. Mobile (390): single column throughout, verified live — metric strip, Needs Attention (5 rows, capped), Recent Calls, Agent Roster, action row all render with **zero horizontal overflow** (`scrollWidth === clientWidth` at 390 in both themes, confirmed via the harness). One honest minor cosmetic limitation found at 390px: with both "Escalated" and "Stale active record" badges on one row, the customer-name/intent text column is squeezed and truncates more aggressively (e.g. "Kal…" / "Gene…") — text truncates cleanly with no overlap or breakage, but it's tighter than ideal. Not fixed in this pass (documented in §24 backlog) since it's a cosmetic density issue, not a functional defect, and the session's explicit scope was the bounded-workspace/capping/dedup work.

## 15. Page-height measurements

Via the Playwright+Edge harness against real production, both themes:

| Viewport | `window.innerHeight` | `document.documentElement.scrollHeight` | Horizontal overflow |
|---|---|---|---|
| 1536×1024 | 1024 | 1024 | none |
| 1366×768 | 768 | 768 | none |

Document-level: **zero overflow at every required viewport in both themes** (this app's shell scrolls internally within its own `<main>` workspace region, not the `<html>`/`<body>`, so `document.documentElement.scrollHeight` is always exactly the viewport height — this is Session 10.x shell architecture, not something this session changed).

Measuring the actual internal `<main class="overflow-auto">` container directly (the real place any Dashboard-specific scrolling would occur):

| Viewport | `main.scrollHeight` | `main.clientHeight` | Internal scroll needed |
|---|---|---|---|
| 1536×1024 | 980 | 980 | **0px — fully bounded (Classification A)** |
| 1366×768 | 900 | 724 | **176px — modest (Classification B)** |

At 1366×768 specifically, reaching the bottom action row requires ~176px of internal scroll (about 23% of the viewport height) — this is a fixed amount driven by the number of summary sections (5+5 rows, metric strip, roster, action row), **not** by data volume (confirmed by §16's data-growth test: the same 176px figure would hold at 15, 50, or 100 backend records, since Needs Attention/Recent Calls are hard-capped regardless). This is honestly reported as **Classification B (modest, bounded scrolling)**, not A (perfectly bounded) at this specific viewport — it is emphatically not Classification C (an effectively unbounded, data-scaling page), which was the failure mode this session was required to eliminate and did.

## 16. Data-growth reasoning/test

Reasoned through and locally verified (pure-function scratch script, no data persisted) with synthetic arrays of 15/50/100 interactions with a realistic mix of escalated/stale/normal rows:

```
n=15:  totalAttentionEligible=4,  shownAttention=4, shownRecent=5
n=50:  totalAttentionEligible=14, shownAttention=5, shownRecent=5
n=100: totalAttentionEligible=27, shownAttention=5, shownRecent=5
```

Needs Attention and Recent Calls both stay at their hard cap of 5 regardless of input size — mathematically guaranteed by `.slice(0, 5)` on a filter/sort pipeline, not just empirically true for today's data. Agent Roster: DOM row count would grow with a larger roster, but the Dashboard's *visual* footprint stays fixed because of the `max-h-[420px] overflow-y-auto` wrapper — confirmed by inspecting the actual CSS applied (internal scroll activates only past that allocation; today's 3-agent roster doesn't need it, well within the cap).

## 17. Light/Dark verification

Both themes verified live via the harness at all 4 viewports (8 total screenshot/measurement passes). One real issue found during HIG review (self-review, `design-reviewer` subagent unavailable to a fork — same limitation as every prior 10.x session) and fixed before commit: the "Stale active record" badge used a bare `text-amber-400`, which is ~1.7:1 contrast against a light-theme card background (fails the ~4.5:1 body-text minimum). Fixed using this project's own established dual-theme pattern (`text-amber-700 dark:text-amber-400`, matching `PostTriggerStatusCard.tsx`'s existing precedent) — confirmed visually correct in the Light-theme production screenshot (readable dark-amber text on white).

## 18. Accessibility

- Needs Attention / Recent Calls rows are native `<button>` elements (not `div`+`role="button"`) — inherently keyboard-focusable and screen-reader-actionable with no extra ARIA needed; visible `focus-visible:outline` added.
- Agent Roster cards: `role="button"`, `tabIndex={0}`, `onKeyDown` handling Enter/Space, explicit `aria-label` ("View {agent} detail") since the card itself has no single accessible name otherwise.
- Status is never color-only: "Escalated"/"Stale active record"/"Resolved" etc. are always text-labeled badges, color is reinforcement only.
- "View all" links use `Button variant="link"` with visible text (not icon-only).
- No new motion/transitions introduced.

## 19. API/backend diff confirmation

`git diff --stat` against the pre-session HEAD (`571de10`) touches only `src/pages/Dashboard.tsx`, `src/components/agents/AgentActivityPanel.tsx`, `src/lib/format.ts` — **zero files under `api/*` or `src/server/*`**. The upstream `page_size` defect is explicitly **not fixed** — only defended against client-side, exactly as scoped.

## 20. Build/lint/function count

- `tsc --noEmit`: clean.
- `npm run build`: clean.
- `npm run lint`: baseline measured fresh at session start = **117 errors / 36 warnings**. Final result after implementation: **117 errors / 36 warnings — identical, zero regression** (one intermediate `react-hooks/exhaustive-deps` warning pair was introduced by an early draft and fixed by wrapping `interactions` in its own `useMemo` before finalizing).
- Vercel function count: **11 → 11**, unchanged.

## 21. Deployment

Committed as `57c1ef2`, deployed via `npx vercel --prod --yes`, confirmed live at `https://callcenter-three-livid.vercel.app/dashboard` (200 OK, function count still 11).

## 22. Production acceptance

Verified live against the real deployed app, both themes, all 4 required viewports:

- 5 metrics present, 3 correctly labeled `(all time)` — confirmed via screenshot.
- Needs Attention present, showing `(14)` total eligible, exactly 5 rows rendered, "View all → Call Logs" shown (since 14 > 5).
- Recent Calls: exactly 5 rows (down from the pre-session 15), zero overlap with the 5 Needs Attention interaction IDs.
- Compact Agent Roster (3 real agents, unchanged fields).
- Agent Detail navigation wired (`/ai-agents/:agentId`, not clicked during automated verification to avoid an unnecessary extra page load in the read-only check, but the handler and route were confirmed by source + the identical pattern already proven working in `AgentDetail.tsx`/`LiveView.tsx`-adjacent code).
- View All → Call Logs wired to the real existing route.
- Existing bottom actions present and unchanged (Live Interactions / Review Escalations / Analytics).
- Bounded desktop behavior: confirmed per §15 (A at 1536×1024, B at 1366×768).
- Light mode: confirmed correct, including the amber-contrast fix.
- Dark mode: confirmed correct, unchanged visual identity.
- 390 / 768 / 1366 / 1536: all confirmed via the harness with zero horizontal overflow.

## 23. Known underlying `page_size` defect — still explicitly unresolved

The proxy (`api/calls/data.ts`) forwards `page_size` unmodified to the upstream Partner API, which does not appear to honor it for this account/dataset. **This session does not fix that** — it was explicitly out of scope (§32 of the implementation prompt: "The `page_size` upstream defect is NOT being fixed here"). The client-side caps added in this session are a permanent, correct defense regardless of whether the upstream is ever fixed — they are not a temporary workaround to be removed later.

## 24. Remaining Dashboard backlog

1. At 390px, the customer-name/intent text column truncates more aggressively than ideal when both Attention badges are shown on one row (cosmetic only, no overflow/breakage) — a future pass could stack badges vertically at narrow widths.
2. The upstream `page_size` defect (§23) should be investigated/fixed separately at the Partner API/proxy layer.
3. The cross-campaign unresolved-reconciliation count identified in the design review (§17.2 of `SCREEN_REVIEW_01_DASHBOARD.md`) remains explicitly out of scope — would need new aggregation work, not proposed for Dashboard in this pass.
4. Call Logs' filter model was not investigated for a pre-filtered "escalated/stale" deep link from "View all" — plain navigation was used instead, per the design's own allowance.

---

## Final questions

1. **Can the Partner API return 100 interactions without making Dashboard 100 rows taller?** Yes — confirmed by the data-growth test (§16): Needs Attention and Recent Calls both stay at exactly 5 rows regardless of input size, by construction (`.slice(0, 5)` on a filter/sort pipeline, not dependent on `page_size`).
2. **Are Needs Attention and Recent Calls each hard-bounded?** Yes, both capped to 5 client-side, independent of the backend.
3. **Can a record appear in both?** No — `attentionIds` (the shown Needs Attention set) is excluded from Recent Calls before capping; verified live (no ID overlap in production screenshots).
4. **Are stale-active records clearly distinguished from genuine recent calls?** Yes — distinct "Stale active record" (amber) vs. the badges used elsewhere, human-readable duration ("15d 17h active"), and stale-active rows are excluded from Recent Calls entirely, never mixed in as if they were fresh activity.
5. **Does Dashboard remain operationally usable at 1366×768 without an effectively endless page?** Yes — bounded to a fixed, data-independent ~176px of internal scroll (Classification B), not the "several screens tall" problem the review found pre-session (10 duplicate stale rows previously pushed real content far down).
6. **If the Agent Roster grows materially, is its Dashboard area bounded?** Yes — `max-h-[420px] overflow-y-auto` wrapper caps the visual footprint; confirmed by direct inspection of the applied CSS, not just assumed.
7. **Are FCR, Escalation and AHT now visibly identified as all-time metrics?** Yes — confirmed via production screenshot, all three show `(all time)`.
8. **Did any metric calculation change?** No — confirmed via diff; only label text changed, `metrics.data.fcrRate`/`escalationRate`/`avgAhtSeconds` and their formatting functions are untouched.
9. **Did any backend/API/domain logic change?** No — confirmed via `git diff --stat`, zero files under `api/*` or `src/server/*`.
10. **Is the underlying Partner API `page_size` defect still explicitly recorded as unresolved?** Yes — see §23; explicitly not fixed in this session, by design.
