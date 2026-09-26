# Session 7.2 — Product Information Architecture & UI Facelift

Scope: navigation, page-shell, and presentation only. No backend capability
added, no domain logic rewritten, no route paths changed.

## 1. Product hierarchy

Seven VoiceForce product pillars, defined in `src/components/layout/pillarNav.ts`:

| Pillar | Meaning |
|---|---|
| Observe | Understand what AI agents are doing |
| Control | Intervene in AI operations |
| Operationalize | Turn conversations into business work |
| Integrate | Connect VoiceForce to external systems/channels |
| Improve | Improve agents from interaction evidence |
| Measure | Operational and economic performance |
| Govern | Identity, security, audit and resilience |

This is a **navigation/grouping model**, not a new domain concept — it
answers "what kind of work am I doing," and is entirely separate from
Session 6.2's interaction classification hierarchy (Domain → Category →
Agent → Channel), which answers "which interactions am I looking at" and
lives inside Call Logs / Chat Logs / Interaction Quality / Customer 360 /
Analytics. The two are never conflated: no pillar UI reads or writes
`useClassification()`, and no classification UI was touched this session.

## 2. Old → new navigation mapping

| Pillar | Modules | Route (unchanged) |
|---|---|---|
| Observe | Dashboard, Live View, Call Logs, Chat Logs, Customers | `/dashboard`, `/live-view`, `/call-logs`, `/chat-logs`, `/customers` |
| Control | Initiate Call, Chat | `/initiate-call`, `/chat` |
| Operationalize | Outbound Campaigns, NPS Campaigns | `/outbound-campaigns`, `/nps-campaigns` |
| Integrate | WhatsApp Hub, Formatting Hub, AI Orchestrator | `/whatsapp-hub`, `/formatting-hub`, `/orchestrator` |
| Improve | AI Agents, Interaction Quality | `/ai-agents`, `/qa-review` |
| Measure | Analytics | `/analytics` |
| Govern | User Mgmt, Settings | `/user-management`, `/settings` |

Deviation from the prompt's illustrative mapping: **Govern was not left
empty.** The audit found User Mgmt and Settings are real, working,
pre-existing pages with no better pillar fit — "identity, security, audit
and resilience" is a closer match for them than any other pillar, and using
them avoids inventing a placeholder for a pillar that already has real
destinations. Per §2's "do not invent working pages just to fill empty
pillars," these are genuinely pre-existing routes, not new work.

**One routed page was deliberately left unlisted in the new navigation:**
`/reports` (`Reports.tsx`). It predates Session 7's real Analytics export,
is still 100%-mock (`useIndustryData`), and Session 7's plan explicitly
states export now lives inside Analytics, not a separate Reports page. The
route itself is untouched and still resolves (no bookmark breaks) — it's
just no longer linked from the sidebar, since surfacing it as a pillar
destination would imply it's a real, current capability. See
`src/components/layout/pillarNav.ts`'s `UNLISTED_ROUTES`.

`AI Agents` was previously hard-excluded from the sidebar by a leftover
Lovable-baseline filter (`item.name !== 'AI Agents'`, present since the
original commit, predating every real session). Now that Session 6 made
this page real, that exclusion was removed — AI Agents is correctly shown
under Improve, per the prompt's own explicit mapping.

## 3. Terminology decisions

- **"Live View Dashboard" → "Live View"** (page header only) — matches the
  sidebar label exactly; the word "Dashboard" was redundant and confusing
  next to the actual Dashboard page. Route (`/live-view`) unchanged.
- **"Interaction Quality"** (Session 6.1's rename) is used consistently —
  no stray "QA Review" label found in any header; the route `/qa-review`
  is intentionally left as-is (route preservation, not user-facing).
- **"AI Agents"** kept as-is (not shortened to "Agents") — it's already the
  established, permission-gated label and renaming it wasn't necessary for
  clarity.
- No other renames were made. Existing stable labels (Dashboard, Call Logs,
  Chat Logs, Customers, Initiate Call, Chat, Outbound Campaigns, NPS
  Campaigns, WhatsApp Hub, Formatting Hub, AI Orchestrator, Analytics, User
  Mgmt, Settings) are unchanged.

## 4. Route preservation

Zero routes were added, removed, or renamed in `src/App.tsx` (untouched —
diff is empty). Every existing bookmarked URL continues to resolve to the
same page it did before this session. Only the **sidebar's grouping,
order, and collapsibility** changed.

## 5. Sidebar redesign

`src/components/layout/Sidebar.tsx` was rewritten to render `PILLARS` from
the new `pillarNav.ts` module, grouped under collapsible headers:

- The pillar containing the current route is always expanded (computed via
  `findPillarForPath()`), regardless of any persisted collapsed state, so
  the active page is never hidden.
- Expand/collapse state persists in `localStorage`
  (`callcenter.sidebar.expandedPillars`) — best-effort, wrapped in
  try/catch, never blocks rendering if unavailable.
- Each pillar toggle is a semantic `<button>` with `aria-expanded`,
  `aria-controls`, keyboard-operable by default (native button), and a
  visible focus ring (`focus-visible:ring-2`).
- Existing per-item `permission` gating (`hasPermission(user, ...)`) is
  preserved exactly — a pillar with zero visible items (all filtered out by
  permission) is hidden entirely, same behavior as before.
- The domain indicator (`IndustryIndicator`, showing "Banking & Financial
  Services") is rendered above the pillar list, visually and structurally
  separate from it — confirmed to already be a UI-level context label (from
  `IndustryContext`), not a persisted entity, consistent with Session 6.2's
  own prior finding. This session did not change that.
- User profile footer (`UserProfile`) is unchanged.

## 6. Page identity (headers)

New shared `src/components/layout/PageHeader.tsx` — renders "Pillar" (small
uppercase eyebrow) + page title + one-line description, replacing each
page's inline `<h1>`/`<p>` pair. Applied to: Dashboard, Call Logs, Chat
Logs, Interaction Quality, Chat, Customers, AI Agents, Outbound Campaigns,
Live View, Initiate Call, NPS Campaigns, Analytics, WhatsApp Hub (13 pages).

**Not yet converted** (existing headers live inside nested child components,
not the page file itself — converting them would mean touching
`FormattingHub.tsx`/`Orchestrator`'s child components rather than a
one-line page-level swap, which was judged out of this session's narrow
shell-only scope): Formatting Hub, AI Orchestrator, Customer Detail, Agent
Detail. These pages are functionally unchanged and keep their existing
headers — flagged here as a deferred, not silently-dropped, follow-up.

## 7. Dashboard changes

Header swapped to `PageHeader` ("VoiceForce / Dashboard"). The existing
real Session 3 data (5 KPI tiles, Recent Calls, Quick Actions,
`AgentActivityPanel`) is otherwise untouched — it was already a genuine,
non-fabricated operational snapshot (confirmed via its own in-code comment
from Session 3), so no restructuring into per-pillar subsections was done;
doing so risked visual regression for no real informational gain, since the
existing tiles already read coherently as one operational snapshot. This is
a deliberate light-touch decision, not an oversight.

## 8. Shared visual language

`PageHeader` is the one new shared primitive this session introduces — a
small uppercase pillar label + `text-3xl font-bold` title + description,
matching the existing shadcn/ui + Tailwind visual language already used
throughout the app (no new component library, no new color system). No
other shared primitives (cards, tables, filters, empty/error states) were
altered — those already have consistent treatment from prior sessions.

## 9. Domain context

Confirmed unchanged and correctly separate: `IndustryIndicator` (driven by
`IndustryContext`) sits above the pillar navigation, is not part of any
pillar group, and its content ("Banking & Financial Services") is not
hardwired into the pillar labels or module names — the seven pillars read
as domain-agnostic.

## 10. Cross-navigation

Not added this session — existing cross-navigation (Agent Detail's
drill-downs, Customer 360's interaction drill-down, Analytics'
`calls_by_agent` → Agent Detail links) was already built in Sessions 6/7/
7.1. This session's scope was the pillar shell itself; no new cross-links
were judged necessary beyond what already exists.

## 11. Responsive behavior

Sidebar width changed from a fixed `w-64` to `w-16 md:w-64` — below the
`md` breakpoint it collapses to icon-only (labels, branding text, and the
domain indicator hidden via `hidden md:block`/`hidden md:inline`), so it no
longer consumes excessive width on narrow viewports. This is a modest,
targeted responsive fix, not a full off-canvas mobile drawer redesign (none
existed before this session, and building one was judged beyond "page-shell
facelift" scope). Session 7.1's collapsible filter/grouped-tree behavior on
individual pages was not touched.

## 12. Distinction: product hierarchy vs. interaction classification

| | Product hierarchy (this session) | Interaction classification (Session 6.2) |
|---|---|---|
| Question answered | "What kind of work am I doing?" | "Which interactions am I looking at?" |
| Where it lives | Sidebar navigation, page headers | Inside Call Logs / Chat Logs / Interaction Quality / Customer 360 / Analytics |
| Data source | Static config (`pillarNav.ts`) | `GET /api/agents?action=classification`, live category/agent mapping |
| Security-relevant? | No | Yes (server-side authorization) |

No file in this session imports or modifies `useClassification`,
`interactionGrouping.ts`, or `GroupedInteractionTree.tsx`.

## 13. Future capability slots

Govern has two real destinations today (User Mgmt, Settings) — no
placeholder needed. No other pillar required a "Coming later" placeholder,
since every pillar in the prompt's mapping already has at least one real
module. Per §15/§14, no future capability (Kill call, Pause AI, Takeover,
Transfer, dispositions, complaints, callback queues, webhooks, regression
testing, economics, auth overhaul) was implemented or stubbed.

## 14. Deferred functionality

- `FormattingHub`/`Orchestrator`/`CustomerDetail`/`AgentDetail` page headers
  not yet converted to `PageHeader` (see §6) — cosmetic-only follow-up.
- Off-canvas/drawer-style mobile sidebar (current fix is icon-only collapse,
  not a full mobile nav pattern).
- `/reports` route's own mock content was not touched or removed — only
  unlinked from navigation (see §2).
