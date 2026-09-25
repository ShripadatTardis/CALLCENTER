# Session 7 — Analytics / Reports: Plan

Planning and audit only, per instruction. No implementation in this pass.

## 1. Current Analytics/Dashboard audit

**`src/pages/Analytics.tsx` — 100% mock, Lovable-era, unconnected to any real hook.**
Built entirely on `useIndustryData()` (the same generic mock generator already found and
retired in Sessions 6/6.1 for AI Agents/QA Review). Every number is either hardcoded,
`Math.random()`, or computed from mock `callLogs`:
- Header KPI tiles: Total Interactions (mock count), FCR (computed from mock `callLogs`,
  fine in shape but wrong data source), Avg Handle Time (mock), **Intent Accuracy: hardcoded
  `'94.7'`** with a hardcoded `+2.1% from last week` under every tile — `+15.3%`, `+4.1%`,
  `-8%`, `+2.1%` are all literal strings, never computed from anything.
- **Call Volume & Resolution Trends** chart: `callVolumeData` is a hardcoded 7-row array
  (Mon–Sun, fixed numbers) — never refreshes, never reflects real call volume.
- **Query Distribution by Intent** pie chart: intent names come from mock `callLogs`, but
  each slice's *value* is `Math.floor(Math.random() * 30) + 15` — re-randomizes every render.
- **Hourly Performance Metrics** line chart: hardcoded 9-row array, fabricated "performance"
  concept with no defined meaning or source.
- **Resolution Metrics** card: hardcoded `89.2%` / `7.3%` / `3.5%` progress bars — First
  Call Resolution / **"Second Call Resolution"** (a concept that appears nowhere else in
  this codebase and has no backend definition) / Escalation Rate.
- **Customer Satisfaction** card: hardcoded `78% / 18% / 4%` sentiment split and a hardcoded
  `4.2/5.0` "Average Satisfaction Score" — a fabricated composite with no defined formula,
  no real field, and no relationship to the real per-call `sentiment_score` field used
  elsewhere in this app.
- **AI Learning & Improvement Opportunities** card: three fully fabricated narrative
  insights ("Complex technical issues account for 68% of escalations") each with a
  no-op button (`Review Training Data`, `Expand Templates`, `Optimize Handlers` — no
  `onClick` anywhere).
- **Date Range** and **Export Report** header buttons: no-op, no `onClick`.

**`src/pages/Dashboard.tsx` — already real** (Session 3 rewrite, confirmed via its own
code comment and by reading the hooks it uses): `useAnalyticsMetrics()` (FCR, escalation
rate, AHT), `useCallData({page_size:5})` (active calls, recent calls list),
`useAgents()` + `AgentActivityPanel`/`countActiveCallsByAgent` (Active Agents tile, derived
not fabricated). Session 3 already correctly *removed* Avg Sentiment/CSAT tiles because no
backend field exists for either — same principle Session 7 must keep applying. Two
`Quick Actions` buttons (**Review Escalations**, **Analytics Report**) remain no-op (no
`onClick`) — minor, listed in the mock/no-op inventory below, not Session 7's primary
target but worth closing while touching this area.

**`src/pages/LiveView.tsx`** — not audited in depth (out of Session 7's scope: it's
current-operations-focused, not historical/trend), but confirmed by definition (§16) to
stay that way — Live View is not touched by this plan.

## 2. Mock/no-op inventory

| Item | Location | Classification | Disposition |
|---|---|---|---|
| Total Interactions, FCR, AHT tiles | `Analytics.tsx` | mock (wrong source: `useIndustryData`) | replace with real source |
| Intent Accuracy `94.7%` | `Analytics.tsx` | hardcoded | replace with `metrics.avg_intent_accuracy` |
| `+15.3%` / `+4.1%` / `-8%` / `+2.1%` trend labels | `Analytics.tsx` | hardcoded, no formula | remove (no confirmed prior-period comparison API) |
| Call Volume & Resolution Trends chart | `Analytics.tsx` | hardcoded 7-row array | replace with `charts.call_volume` |
| Query Distribution by Intent pie | `Analytics.tsx` | `Math.random()` per render | replace with `outcomes` (real, but see §4/§15 — outcomes ≠ intent; rename/rescope) |
| Hourly Performance Metrics chart | `Analytics.tsx` | hardcoded, undefined metric | remove (no defined "performance" field exists) |
| Resolution Metrics (FCR/2nd-call/escalation bars) | `Analytics.tsx` | hardcoded, incl. fabricated "Second Call Resolution" concept | keep FCR + Escalation from real `metrics.*`; remove "Second Call Resolution" (no backend concept) |
| Customer Satisfaction (78/18/4%, 4.2/5.0) | `Analytics.tsx` | fully fabricated composite | remove (no CSAT/composite-sentiment field exists anywhere in the confirmed API) |
| AI Learning & Improvement Opportunities | `Analytics.tsx` | fully fabricated narrative + no-op buttons | remove |
| Date Range / Export Report buttons | `Analytics.tsx` | no-op | replace with real filter UI / real CSV export (§11, §13) |
| Review Escalations / Analytics Report buttons | `Dashboard.tsx` | no-op (pre-existing, minor) | wire to real destinations while touching this area, or remove if no clear target exists — small, unambiguous, in scope |

No mock operational analytics should remain after Session 7 per this inventory.

## 3. Confirmed API/data sources

**`GET /api/v1/analytics/metrics`** (via existing proxy `api/analytics/metrics.ts` —
already passes through arbitrary query params unmodified, confirmed by reading its code;
**no proxy change needed**). Confirmed request/response shape, cross-checked against
`docs/Analytics_Metrics_API.docx` (extracted this session), `src/types/api/analytics.ts`'s
own code comment ("CORRECTED against a real live response... 2026-09-24"), and the
post-outage verification pass:

Query params: `window` (`1h|6h|12h|24h|7d|30d`, takes precedence), `direction`
(`inbound|outbound`; anything else → both), `date_from`/`date_to` (`YYYY-MM-DD`, used only
when `window` absent).

Response: `{success, filters: {window, direction, date_from, date_to}, metrics: {...},
charts: {call_volume[], latency_over_time[], concurrency[]}, outcomes[], calls_by_agent[],
aht_distribution[]}`.

`metrics.*` fields, **exact semantics preserved from the API doc, not relabeled**:
- `total_calls` — **completed calls only**.
- `calls_in_window` — **all calls started in the window, any outcome** (this is the
  dashboard-style "Total Calls" figure — the two must never be swapped or blended).
- `fcr_rate`, `avg_aht_seconds`, `escalation_rate`, `resolved_count`, `escalated_count`,
  `avg_intent_accuracy` (0–100), `live_concurrent_calls` (not window-scoped),
  `peak_concurrency`, `avg_turn_latency_ms`, `p95_turn_latency_ms`.

**Current frontend type gap (must be fixed as part of implementation, not a backend
gap)**: `src/types/api/analytics.ts` currently types ONLY `date_from`/`date_to` on the
query DTO and only 6 of the 12 documented `metrics` fields — `window`, `direction`,
`avg_intent_accuracy`, `live_concurrent_calls`, `peak_concurrency`,
`avg_turn_latency_ms`, `p95_turn_latency_ms`, plus the entire `charts`/`outcomes`/
`calls_by_agent`/`aht_distribution` objects are present in the real API (confirmed) but
untyped/unconsumed. The type file's own comment already flags this as deliberately
deferred, not a defect ("left for a future session's scope, not implemented
speculatively now") — Session 7 is that future session.

**`GET /api/v1/call-data`** via `api/calls/data.ts` / `useCallData` — bounded/paged, already
used by Call Logs, Dashboard, Agent Detail, Customer 360. Reused for anything
`analytics/metrics` doesn't already aggregate (e.g. inbound-vs-outbound split isn't in
`metrics` directly — `direction` is a *filter*, not a breakdown field — so a combined
inbound+outbound view needs two calls or client-side tagging).

**`GET /api/v1/chat/sessions`** via `api/chat/logs.ts` / `useChatLogs` — paged, filters
`customer_id/contact_id/agent_id/status/page/page_size`. No `window`/`date_from`/`date_to`
filter exists on this endpoint (confirmed absent from the documented contract) — any
Chat time-window analytics must filter client-side over fetched pages, or aggregate over
whatever page range is fetched — **not** a server-aggregated time series like Voice has.

**Campaigns**: `api/campaigns.ts` (`?action=list` etc.) — real `campaigns`/
`campaign_targets`/`campaign_executions`/`campaign_results`/`campaign_followups`
via `src/hooks/campaigns/*`. `CampaignOverviewStats.tsx` already contains the
authoritative target-level success-rate formula (see §7).

**Customer 360**: `src/hooks/customers/*` (`useCustomers`, `useCustomerDetail`,
`useCustomerInteractions`) — category-authorized, already-established patterns.

## 4. Metric catalogue — exact source/formula per metric

| Metric | Source | Formula/Note |
|---|---|---|
| Calls in Window | `metrics.calls_in_window` | direct, all outcomes |
| Completed Calls | `metrics.total_calls` | direct, completed only |
| FCR | `metrics.fcr_rate` | direct |
| Avg AHT | `metrics.avg_aht_seconds` | direct |
| Escalation Rate | `metrics.escalation_rate` | direct |
| Resolved / Escalated counts | `metrics.resolved_count` / `metrics.escalated_count` | direct |
| Avg Intent Accuracy (Voice) | `metrics.avg_intent_accuracy` | direct, 0–100 scale |
| Avg Turn Latency / P95 | `metrics.avg_turn_latency_ms` / `metrics.p95_turn_latency_ms` | direct |
| Live Concurrency | `metrics.live_concurrent_calls` | direct, **not** window-scoped |
| Peak Concurrency | `metrics.peak_concurrency` | direct, window-scoped |
| Call Volume over time | `charts.call_volume` | direct, bucketed, ≤200 points |
| Latency over time | `charts.latency_over_time` | direct, bucketed |
| Concurrency over time | `charts.concurrency` | direct, bucketed |
| Outcomes distribution | `outcomes` | direct (`{name,value}` for Resolved/Escalated/Other) |
| Calls by Agent | `calls_by_agent` | direct (`{agent,count}`) — raw count only, no other per-agent breakdown in this endpoint |
| AHT Distribution | `aht_distribution` | direct histogram |
| Chat sessions in period | `chat/sessions` (paged) | `data.pagination.total_records` for the current filter/page set — **not** a true time-windowed count unless combined with client-side date filtering over fetched rows (flagged, §11/§12) |
| Chat sessions by agent | `chat/sessions?agent_id=` | one paged call per agent, or client-side group-by over a fetched page — no server-side group-by exists |
| Chat avg confidence | `chat/sessions[].confidence` | client-side mean over fetched rows (chat has no aggregate-metrics endpoint) |
| Chat avg latency | `chat/sessions[].latency_ms` | client-side mean over fetched rows |
| Chat authenticated share | `chat/sessions[].authenticated` | client-side ratio over fetched rows |
| Chat message_count avg | `chat/sessions[].message_count` | client-side mean |
| Campaign targets / attempted / pending | `campaign_targets`/`campaign_executions` counts | direct counts, reuse `useCampaignDetail`/`useCampaigns` |
| Campaign reconciled / unresolved | `campaign_executions.reconciliation_status` | direct counts |
| **Campaign Success Rate** | `campaign_targets.effective_result_id` → joined `campaign_results.is_success` | **exact reuse of `CampaignOverviewStats.tsx`'s existing formula**: `totalSuccess / totalClassified` where `totalClassified = count(targets with effective_result_id set)`, `totalSuccess = count(is_success=true among those)`. Never a raw `campaign_results` row count. Unclassified targets (`totalTargets - totalClassified`) surfaced separately, never folded in. |
| Unique customers | `customers` count via Customer 360 | direct, category-authorized |
| Customers with multiple interactions | `customers.totalInteractions > 1` | client-side filter over authorized list |
| Inbound vs outbound interaction mix | `customer_interactions.direction` | client-side aggregate, category-authorized |
| Escalated / repeat-contact customers | `customer_interactions.escalationCount` / repeat visits | client-side aggregate, category-authorized |

## 5. Voice analytics scope

**Build**: an "Overview" (all-channel, mostly Voice-driven since Voice is the only
channel `/analytics/metrics` covers) + a dedicated "Voice" tab: call volume over time
(`charts.call_volume`), outcome distribution (`outcomes`), FCR/AHT/Escalation tiles
(`metrics.*`), AHT distribution (`aht_distribution`), intent accuracy (`avg_intent_accuracy`),
concurrency (`charts.concurrency` + `live_concurrent_calls`/`peak_concurrency`), latency
over time (`charts.latency_over_time` + `avg_turn_latency_ms`/`p95_turn_latency_ms`),
calls by agent (`calls_by_agent`, linking into Agent Detail per §9). Inbound-vs-outbound
split via the `direction` filter (two fetches, one per direction, or a toggle — not a
single combined field). All server-aggregated — **zero manual pagination of `call-data`
required for this tab**, since every candidate metric already has a named `metrics`/`charts`
field.

## 6. Chat analytics scope

**Build, client-derived, clearly labeled as such**: sessions in period (paged
`chat/sessions`, count = `pagination.total_records` for the applied filter — note this
is a *filter-matched* count, not a true rolling-window count unless `status`/manual date
filtering is applied client-side), sessions by agent (`agent_id` filter, one call per
agent or a single unfiltered page with client-side group-by — prefer per-agent filtered
calls for accuracy over a client-truncated page), active/completed lifecycle split
(`status` filter or field), avg confidence, avg latency, authenticated share, message_count
average — all computed client-side over whatever page(s) are fetched, with the page size
and any "estimated from first N sessions" caveat stated in the UI. Intents: `intent` field
exists per-session; a distribution can be built the same way outcomes is for Voice.

**Do not fabricate**: chat FCR, chat resolution rate, chat business outcome, chat
sentiment — none of these have a real field. `status` (active/completed) is a lifecycle
state, not a resolution outcome, and must never be presented as such (per the prompt's
explicit instruction and Session 5.1's own established rule).

## 7. Campaign analytics scope

**Build**: campaigns launched (count), targets/attempted/pending (from
`campaign_targets`/`campaign_executions` status counts), reconciled vs unresolved
(`reconciliation_status`), **target-level success rate exactly as `CampaignOverviewStats.tsx`
already computes it** (§4), follow-ups due (`campaign_followups` due count).

**Constrained, mark explicitly**: because Trigger Call ↔ Call Data correlation remains
**NOT CONFIRMED** (post-outage verification, this session), campaign executions largely
stay `reconciliation_status = pending/unresolved` in the current live backend, meaning
`campaign_results` (and therefore the success-rate numerator/denominator) may be sparse
or empty against real data today. This is not an Analytics defect — the UI must show the
unclassified/pending count prominently (reusing `CampaignOverviewStats`'s existing
"Unclassified" tile pattern) so the constraint is visible, not hidden behind a `—` or a
misleadingly-confident 0%.

## 8. Customer analytics scope

**Build, high-level only**: unique customers, customers with >1 interaction, inbound vs
outbound interaction mix, escalated customers, channel mix (voice vs chat interaction
counts) — all computed from the already-authorized Customer 360 customer/interaction
list (`useCustomers`, category-scoped). **Do not build**: demographic/customer-marketing
analytics (no such data exists, and it's out of scope per the prompt). Customer 360
remains operational (detail/drill-down), not a CRM dashboard — this is a small
supplementary panel, not a new page.

## 9. Agent / Interaction-Quality overlap rules

**Analytics may show**: `calls_by_agent` (raw counts, direct from `metrics`) as a
lightweight comparison table/chart. Each row **links into the existing Agent Detail
page** (`/ai-agents/:agentId`) rather than re-deriving FCR/AHT/intent-accuracy/campaign
success client-side a second time — `agentPerformanceAggregator.ts` already owns that
computation and Analytics must not reimplement a second, potentially-divergent formula.

**Analytics may aggregate factual Interaction-Quality signals as trends**: FCR trend,
escalation trend, intent accuracy trend, sentiment distribution, auth rate, latency —
all derived the same way Voice analytics already computes them (§5), not by querying
Interaction Quality's per-row data a second time. **No overall "quality score" anywhere**
— this is the same rule Session 6 and 6.1 already established; Session 7 does not get an
exception.

## 10. Time-window/date-range semantics

`window` takes precedence over `date_from`/`date_to` when both are supplied (per the
documented contract) — the UI must only ever send one or the other, never both, to avoid
ambiguity.

**Empirically confirmed during Session 7 implementation** (live, against production):
`window=24h`'s `charts.*` bucket timestamps span exactly 24 hours ending at request
time (first bucket ~24h before the last, last bucket within ~8 minutes of request time),
displayed in the `Asia/Kolkata` (+05:30) timezone — this is a **rolling 24-hour window
ending "now"**, NOT calendar-day-aligned. `date_from`/`date_to` is the separate,
calendar-day-based alternative (inclusive, `< date_to + 1 day`, per the doc). The two
bases are genuinely different query modes, not two ways of asking the same question —
closing the open item this section originally flagged. The UI must:
- Display the active time basis explicitly and unambiguously (e.g. "Last 24h (rolling)"
  vs "Sep 20–Sep 25 (calendar)") — never a bare, ambiguous label.
- Never combine a `window`-based fetch and a `date_from`/`date_to`-based fetch into one
  chart/comparison without clearly labeling which basis each series uses.
- Chat's client-derived metrics (§6) use whatever page/filter was fetched — these must be
  labeled by what was actually fetched ("first N sessions matching filter"), never
  implied to be a true calendar/rolling window unless a client-side date filter was
  explicitly applied over the fetched rows.

## 11. Filters

| Filter | Backing | Honesty note |
|---|---|---|
| Time window (`window`) | `/analytics/metrics` `window` param | server-side, real |
| Date range (`date_from`/`date_to`) | `/analytics/metrics` params | server-side, real; mutually exclusive with `window` in the UI |
| Direction (`inbound/outbound/both`) | `/analytics/metrics` `direction` param, and `call-data` | server-side, real |
| Channel (Voice/Chat) | tab-level structural choice, not a single-query filter | N/A — separate data sources per §4/§10 |
| Agent | `calls_by_agent` (server aggregate) or `agent_id` filter on `chat/sessions`/`campaigns` | server-side where the endpoint supports it |
| Campaign | `campaign_id` scoping within Campaign analytics | server-side (existing campaign hooks) |
| Outcome | `outcomes` (server aggregate, Voice only) | server-side for Voice; **no equivalent for Chat** (§6) — do not offer this filter on the Chat tab |

Any filter requiring client-side filtering over already-fetched rows (Chat's date/status
combinations beyond its native `status` param, e.g.) is explicitly labeled as such in the
UI copy or a tooltip, per the prompt's instruction.

## 12. Charts

Keep only charts that map to a named source: Call Volume over time (`charts.call_volume`),
Outcome distribution (`outcomes`), AHT distribution (`aht_distribution`), Latency over
time (`charts.latency_over_time`), Concurrency over time (`charts.concurrency`), Calls by
Agent (`calls_by_agent`). Remove: the hardcoded Hourly Performance chart (no source),
the random-per-render Query-Distribution-by-Intent pie (no stable source — if an intent
breakdown is wanted later, it needs a real aggregate field, which doesn't currently
exist; not built this session). Every chart component carries a one-line source caption
(e.g. "Source: GET /analytics/metrics — charts.call_volume") for auditability, matching
this project's established documentation discipline.

## 13. Exports

Current `Export Report` button in `Analytics.tsx` is no-op — confirmed, no export logic
exists anywhere in the codebase (grepped). **Build**: CSV export for (a) the currently-
displayed Voice metrics/table view, (b) the call list (reuse Call Logs' already-fetched
rows if the user is on a call-list-shaped view, or a bounded fresh fetch matching current
filters), (c) an agent summary table (`calls_by_agent` + linked Agent Detail metrics,
client-composed), (d) a campaign summary table (`campaigns`+stats, client-composed).
Exported data must carry the exact same filter/time-window parameters as the on-screen
view (pass the same query object used for the display fetch into the CSV builder — no
separate/divergent fetch). **Do not build** PDF reporting — no existing requirement
references it anywhere in this project's docs/prompts.

## 14. Proposed UX/navigation

**One Analytics page with tabs**, per the prompt's stated preference, confirmed feasible:
`Analytics` (single sidebar item, unchanged position) → tabs `Overview | Voice | Chat |
Campaigns | Customers`. This avoids adding new sidebar items (§ prompt's minimal-nav
preference, consistent with every prior session's discipline) and keeps a single URL
route (`/analytics`) with tab state in the URL query string or local component state, not
new top-level routes. No "Reports" as a separate concept — reporting is the Export action
(§13) available within each tab, not a second page.

## 15. Fetch/performance strategy

- `/analytics/metrics` is the primary source for the Overview and Voice tabs — one fetch
  per active filter combination (window/direction), no manual `call-data` pagination
  needed for anything the endpoint already aggregates.
- Chat tab: paged `chat/sessions` fetches, bounded page size (reuse Chat Logs' existing
  page-size convention), client-side aggregation over the fetched page(s) only — never an
  unbounded "fetch all history" loop. If broader coverage is wanted later, that's a
  documented limitation (§21), not solved by looping pagination in this session.
  - Confirmed the endpoint's `total_records`/`total_pages` are available to communicate
    "N of M sessions" honestly in any client-derived stat.
- Campaigns tab: reuse existing `useCampaigns`/`useCampaignDetail` RPCs, no new fetch
  pattern.
- Customers tab: reuse existing category-authorized `useCustomers`, same page-size
  convention as Customer 360's own list.
- Agent comparison row/link: reuse `calls_by_agent` from the already-fetched
  `/analytics/metrics` response (no second fetch) for counts; drill-through to Agent
  Detail triggers that page's own existing fetches (no duplication).

## 16. Authorization considerations — REVISED for Session 6.2 (superseding the paragraph below)

**Outdated assumption removed.** This plan originally assumed Call Logs/Chat Logs/
Analytics were all intentionally all-access, matching what was (at the time) their
actual unenforced state. **Session 6.2 closed that gap**: `api/calls/data.ts` and
`api/chat/logs.ts` now apply real, server-side category/role authorization (the same
`customer360_categories`/`customer360_category_agents`/`role_customer360_categories`/
`role_customer360_access` primitives Customer 360 already used), via
`resolveAccessForRequest`. Session 7 must build Analytics on top of that model, not
the old assumption:

```
Role
  -> Authorized Categories
       -> Authorized Agents
            -> Authorized interaction universe
                 -> Analytics over that universe
```

**The rule, same one already proven in Customer 360 and Session 6.2**: an aggregate must
never reveal hidden interactions, hidden category volumes, or hidden agent volumes.

**The specific complication Analytics has that Call Logs/Chat Logs didn't**: `GET
/api/v1/analytics/metrics` has no `agent_id`/`category_id`/`domain` filter at all (§3) —
its response is a GLOBAL aggregate over every call in the requested window, regardless
of category. For an **all-access** role this is fine and correct to show directly
(their authorized universe genuinely is the global one). For a **scoped** role, showing
that global aggregate would leak hidden-category volume — exactly the class of bug
Session 6.2 found and fixed on Call Logs/Chat Logs, now avoided here by construction:

- All-access (`classification.allCategories === true`): render `/analytics/metrics`
  directly (Overview + Voice tabs) — server aggregate, honest.
- Scoped: never render the global snapshot. Instead derive Voice metrics from the same
  server-authorized call-data sample Call Logs already fetches (reusing
  `computeAgentCallMetrics` unchanged, the same formula Agent Detail uses — no second
  implementation), explicitly labeled as a bounded sample, not a window total. Metrics
  with no honest client-side derivation (turn latency, concurrency, time-series charts)
  show "Unavailable for scoped historical view" rather than a fabricated or leaked value.

**Chat** has no aggregate-metrics endpoint at all (§6/§9), so both role types get
client-derived metrics over the Session-6.2-authorized `chat/sessions` sample —
scoped-vs-all-access only changes which rows the server returns, not the derivation
code path.

**Campaigns**: audited separately (§11, unchanged from the original plan) — `api/
campaigns.ts` applies no category/role filtering today; every authenticated user sees
every campaign's aggregates. Preserved as-is; Session 7 does not invent a new
campaign-role permission model.

**Customers tab**: pulls from Customer 360's `useCustomers`/`fetchCustomerList`, which
**is** category-authorized — preserved exactly as-is, no bypass, no drill-down that
exposes hidden-category interaction detail (reuses the already-fixed
`InteractionDetailDialog`/`ChatSessionDetailDialog` invocation pattern from the
Customer 360 drill-down fix).

---
*Original paragraph, superseded above, kept for record:*

Aggregate Voice/Chat/Campaign analytics (via `/analytics/metrics`, `call-data`,
`chat/sessions`, campaign RPCs) carry **no per-customer identity** in their aggregate
form and are not gated by Customer 360's category/role model today (confirmed: none of
these endpoints route through `authorizationService.ts`) — this matches the existing
Dashboard/Call Logs/Chat Logs/Agent Detail precedent, all of which are already
effectively all-access for aggregate/operational data. **Document explicitly, per the
prompt's requirement**: the Analytics page (Overview/Voice/Chat/Campaigns tabs) is
intentionally all-access, consistent with every other operational (non-Customer-360)
screen in this app.

**The one place this changes**: the Customers tab (§8) pulls from Customer 360's
`useCustomers`, which **is** category-authorized — that authorization must be preserved
exactly as-is (no bypass), and the tab must not offer any drill-down that exposes
hidden-category interaction detail (reuse the already-fixed, authorization-safe
`InteractionDetailDialog`/`ChatSessionDetailDialog` invocation pattern from the
Customer 360 drill-down fix, never a raw unfiltered aggregate).

## 17. Backend gaps (explicit, not solved by inference)

- Campaign call correlation (Trigger Call ↔ Call Data) — **NOT CONFIRMED** (this session's
  post-outage verification). Constrains Campaign analytics' success-rate completeness (§7).
- Voice CIF/customer_id — absent on all confirmed read paths. Not relevant to Analytics'
  scope directly (Analytics doesn't need customer identity), noted for completeness.
- No per-call STT/LLM/TTS/RAG/Orchestrator latency breakdown API — confirmed absent
  (Session 6's own audit); Analytics uses only the confirmed aggregate
  `avg_turn_latency_ms`/`p95_turn_latency_ms`/`latency_over_time`, nothing per-call.
- No Langfuse trace API — confirmed absent; not surfaced anywhere in Analytics.
- No resource-monitoring API (GPU/CPU/RAM/Disk/Network) — confirmed absent; not
  surfaced anywhere in Analytics (would belong under Admin/System Health per the user's
  standing preference from Session 6, if it ever becomes API-confirmed).
- No QA evaluation backend — confirmed absent (Session 6.1); Analytics' quality-signal
  trends (§9) are factual aggregates only, never a QA/evaluation score.
- No Chat-side time-window/date-range query parameter — confirmed absent from the
  documented `chat/sessions` contract; Chat analytics are page/filter-scoped, not
  true rolling/calendar windows, unless client-side date filtering is layered on top
  (§6/§10).
- `window=24h` vs calendar-day semantics not fully re-derived live — flagged as a
  Session 7 verification task (§20), not assumed either way.

## 18. Exact files/hooks/services/components to change

**Types/services (expand, don't replace)**:
- `src/types/api/analytics.ts` — add `window`/`direction` to the query DTO; add
  `calls_in_window`, `avg_intent_accuracy`, `live_concurrent_calls`, `peak_concurrency`,
  `avg_turn_latency_ms`, `p95_turn_latency_ms` to `AnalyticsMetricsFields`; add
  `AnalyticsChartsDto` (`call_volume`/`latency_over_time`/`concurrency`, each
  `{t, ...}[]`), `AnalyticsOutcomeDto[]`, `AnalyticsCallsByAgentDto[]`,
  `AnalyticsAhtDistributionDto[]`, and extend `AnalyticsMetricsResponseDto` with
  `filters`, `charts`, `outcomes`, `calls_by_agent`, `aht_distribution`.
- `src/services/analytics/analyticsMapper.ts` (and `analyticsService.ts`,
  `analyticsKeys.ts`) — extend the mapper for the new fields; keep `AnalyticsMetrics`'s
  existing consumers (Dashboard) working unchanged (additive only).
- New `src/services/analytics/campaignAnalyticsAggregator.ts` /
  `chatAnalyticsAggregator.ts` / `customerAnalyticsAggregator.ts` (or one combined
  `analyticsAggregators.ts` — implementer's call) for the client-derived Chat/Campaign/
  Customer metrics, following the exact pattern already established by
  `agentPerformanceAggregator.ts` (pure functions over already-typed real data, no
  fabrication, explicit "unavailable" markers rather than guesses).
- New `src/hooks/analytics/useChatAnalytics.ts`, `useCampaignAnalytics.ts`,
  `useCustomerAnalytics.ts` (or extend `useAnalyticsMetrics.ts`'s sibling hooks folder) —
  thin wrappers composing existing hooks (`useChatLogs`, `useCampaigns`, `useCustomers`)
  with the new aggregators.

**Frontend — rewrite**:
- `src/pages/Analytics.tsx` — full rewrite: tabbed Overview/Voice/Chat/Campaigns/
  Customers structure, all charts/tiles sourced per §4, CSV export wired per §13, no
  `useIndustryData` import remaining.
- New `src/components/analytics/` subcomponents per tab (e.g.
  `AnalyticsOverviewTab.tsx`, `VoiceAnalyticsTab.tsx`, `ChatAnalyticsTab.tsx`,
  `CampaignAnalyticsTab.tsx`, `CustomerAnalyticsTab.tsx`,
  `AnalyticsTimeWindowControl.tsx` for the window/date-range selector with the explicit
  basis label from §10, `AnalyticsExportButton.tsx`).

**Minor, in-scope while touching this area**:
- `src/pages/Dashboard.tsx` — wire or remove the two no-op `Quick Actions` buttons
  (Review Escalations, Analytics Report) — small, unambiguous.

**No backend/proxy changes** — `api/analytics/metrics.ts` already passes through all
query params and the full response body unmodified; confirmed by reading its source.

## 19. Vercel function-count impact

**Zero new functions.** Current count is 11 (confirmed:
`find api -name "*.ts" ! -name "_*" | wc -l`). This entire session is a frontend/
client-aggregation build on top of already-existing, already-proxied endpoints
(`api/analytics/metrics.ts`, `api/calls/data.ts`, `api/chat/logs.ts`, `api/campaigns.ts`,
`api/customers/index.ts`) — no new route file is needed at any point in this scope.

## 20. Verification plan

1. `tsc --noEmit`, `npm run build`, `npm run lint` clean.
2. Confirm `find api ... | wc -l` still 11 after implementation.
3. Live: fetch `/analytics/metrics` with each of `window=1h|24h|7d` and a `date_from`/
   `date_to` pair spanning a known day; compare `calls_in_window` against a manual
   `call-data` count for the same period to empirically pin down whether `window=24h` is
   rolling-from-now or calendar-aligned, and record the finding in this doc's §10 (closing
   the open item flagged there) before or immediately after implementation.
4. Confirm `calls_in_window` vs `total_calls` are never swapped in any UI label (direct
   code review + one live screenshot comparison against the raw API response).
5. Confirm the Campaign tab's success-rate figure matches `CampaignOverviewStats.tsx`'s
   own number exactly for the same campaign set (same formula, same result) — no
   divergent second implementation.
6. Confirm the `calls_by_agent` row for a real agent, and its Agent Detail drill-through,
   show numbers consistent with what Agent Detail itself already displays (no second,
   competing formula).
7. Confirm Chat tab metrics are labeled with their actual fetched-page scope (not implied
   to be a full historical/rolling-window aggregate).
8. Confirm CSV export output matches the exact filters/time window active on screen at
   export time (spot-check one export against the visible table).
9. Confirm the Customers tab's authorization still holds — a category-scoped test role
   sees only its authorized customer/interaction counts (reuse the standing throwaway-
   test-role verification convention from every prior session this project has used).
10. Confirm no `Math.random()`, hardcoded percentage, or hardcoded trend label remains
    anywhere in `Analytics.tsx` or its new subcomponents (grep sweep).

## 21. Exact items explicitly deferred

- True Chat time-window/date-range querying (backend doesn't support it) — client-side
  page-scoped approximation only, documented as such in the UI.
- Full campaign-success-rate completeness — constrained by the still-open Trigger-Call↔
  Call-Data correlation gap; Analytics surfaces the constraint honestly rather than
  waiting on it.
- Any per-call STT/LLM/TTS/RAG/Orchestrator, Langfuse trace, or resource-monitoring
  surfacing — no backend API exists; not attempted.
- Any composite "quality score" — explicitly out of scope per house rule, not just
  "not yet built."
- PDF reporting — no existing requirement, not built.
- Rewiring/removing the two Dashboard `Quick Actions` no-op buttons is included as a
  small in-scope item (§18) but is not the primary deliverable — if it turns out to need
  more than a trivial fix, defer it and report rather than scope-creeping.

## Recommended implementation scope

```text
Build:
- Analytics.tsx full rewrite: tabbed Overview/Voice/Chat/Campaigns/Customers on one page,
  one sidebar item, matching this session's plan exactly.
- Expanded analytics DTO/mapper/service types covering the full confirmed
  /analytics/metrics contract (currently under-typed relative to the real API).
- Voice tab: fully server-aggregate-driven (metrics + charts + outcomes + calls_by_agent
  + aht_distribution) — no new backend calls needed beyond the existing proxy.
- Chat tab: client-derived aggregates over paged chat/sessions, clearly labeled as
  page/filter-scoped, not a true time series.
- Campaign tab: reuse of the existing, already-correct target-level success-rate formula
  and reconciliation-status breakdown, with the correlation-gap constraint surfaced
  honestly.
- Customer tab: small, category-authorized high-level panel, no new authorization logic.
- CSV export for Voice metrics/call list/agent summary/campaign summary, filter-consistent.
- Explicit time-basis labeling UI component (§10) resolving the window-vs-calendar
  ambiguity found in post-outage verification.
- Small Dashboard no-op button cleanup while in this area.

Do not build:
- A composite/overall quality score of any kind.
- A single blended Voice+Chat "interaction quality score."
- Chat FCR/resolution-rate/business-outcome/sentiment (no real field).
- "Second Call Resolution" or any other undefined/fabricated metric.
- PDF reporting.
- Per-call STT/LLM/TTS/RAG/Orchestrator, Langfuse trace, or resource-monitoring surfacing.
- A second per-agent quality formula competing with Agent Detail's.
- Demographic/customer-marketing analytics.

Defer:
- True Chat time-windowed querying, pending a backend date-range parameter on
  /chat/sessions (does not exist today).
- Full campaign correlation-dependent analytics, pending the Trigger-Call↔Call-Data
  identifier confirmation (tracked since Session 5, still open).
- Any resource/Langfuse/per-call-runtime surfacing, pending a confirmed public API
  (none exists; demo-UI-only per Session 6's audit).
```

Stop here. Do not implement Session 7 until this plan is approved.
