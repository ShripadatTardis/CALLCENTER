# Session 12.1 — Outbound Campaign UI Foundation

Scoped UI-only implementation on top of the completed Session 12.0 read-only audit. No campaign execution, scheduling, reconciliation, database, or Partner API changes were made — per that session's explicit boundary, this remained a UI/routing/presentation-only pass.

## Files changed

- `src/App.tsx` — new route.
- `src/lib/detailOrigin.ts` — new `DetailOrigin` entry.
- `src/pages/CampaignDetailPage.tsx` — **new** routed detail page.
- `src/pages/OutboundCampaigns.tsx` — rewritten: list-only, real pagination.
- `src/components/campaigns/CampaignStatusBadge.tsx` — rewritten: real S1 variants.
- `src/components/campaigns/CampaignGrid.tsx` — drop `dark` prop at call site.
- `src/components/campaigns/CampaignDetail.tsx` — drop `dark` prop; target-count fix; terminology change.

## 1. Routing

`/outbound-campaigns/:campaignId` added in `App.tsx`, after the existing literal `/outbound-campaigns/create` route (React Router v6 ranks literal segments over params regardless of declaration order, so this is safe either way, but kept in the more-specific-first order for readability).

`OutboundCampaigns.tsx` no longer holds `selectedCampaignId` local state or conditionally renders `CampaignDetail` inline. Clicking a row now calls `navigate(`/outbound-campaigns/${c.id}`, { state: { origin: 'outbound-campaigns' } })`.

`CampaignDetailPage.tsx` is a new page, following the exact same shape as `CustomerDetail.tsx`/`AgentDetail.tsx`: `useParams` for `campaignId`, `useCampaignDetail`/`useCampaignTargets` for data, `resolveDetailOrigin(location.state?.origin, 'outbound-campaigns')` for N1 back-navigation, wraps the existing (unchanged-in-structure) `CampaignDetail` presentational component. `detailOrigin.ts` gained one new entry: `'outbound-campaigns': { path: '/outbound-campaigns', label: 'Campaigns' }` — the existing mechanism, not a parallel one, per that file's own "future reuse" instruction.

**Live-verified**: built the app (`npm run build`) and served the static `dist/` output via `vite preview`; confirmed `GET /outbound-campaigns/test123` returns HTTP 200 with the SPA shell (not a 404), meaning the route resolves correctly on a direct/hard-refresh load — this is the specific behavior that matters for "detail pages remain directly addressable" (N1 requirement #5). Full interactive behavior against live data (actual campaign fetch, N1 back-click round-trip, badge rendering) was **not** live-exercised — this environment hits the same `vercel dev` API-binding limitation already documented in Sessions 11.7/11.5B/11.9, so `vite preview` alone can't reach a working backend. Those behaviors are code-inspected only, following the same pattern (`CustomerDetail.tsx`) already proven live-verified in Session 11.8.

## 2. Pagination

`OutboundCampaigns.tsx` now calls `useCampaigns({ page, pageSize: 25 })` instead of `useCampaigns()` with no args, and renders the exact `Customers.tsx` pager pattern (Prev/Next, `{totalCount} total campaigns · Page X of Y`, both buttons disabled at the bounds and while fetching). This was a UI-only wiring gap — `fetchCampaigns`, `/api/campaigns?action=list`, and `call_center_campaign_list` already accepted and honored `page`/`pageSize` and returned `pagination.totalCount`; nothing on the backend/service layer needed to change.

A filter-change effect resets `page` to 1 when `searchTerm`/`selectedStatus` change, mirroring `Customers.tsx`'s discipline for its own (server-side) search.

**Honest limitation, not fixed here (out of UI-only scope)**: search/status filtering remains client-side over the *current page's* fetched rows only — the `/api/campaigns?action=list` endpoint has no server-side search/status params. With one real production campaign today this isn't practically broken, but a future session growing the campaign list should wire these server-side rather than extend the client-side filter further. Flagged, not silently left implicit.

**Verification**: code-inspected only — production currently has 1 campaign (per the 12.0 audit), so page 2 could not be genuinely exercised against real multi-page data. The pager correctly hides itself when `totalCount === 0` and correctly disables Next when `currentPage >= totalPages`, confirmed by reading the logic against the single-campaign case.

## 3. Status styling — S1 adoption

`CampaignStatusBadge.tsx` was completely rewritten. The prior implementation was driven by a static `dark` boolean **prop** hardcoded to `true` at both call sites — disconnected from the actual theme context entirely, meaning its "light" config path was dead code regardless of the user's real selected theme (this was the 12.0 audit's most severe UI finding: not a missing `dark:` pairing, but a component that never responded to the real theme at all).

New mapping onto the existing `Badge` component's real S1 variants (`docs/VOICEFORCE_OPERATIONAL_GRID_STANDARD.md` §23 — theme-correct by construction, no new colors introduced):

| Status | Variant | Rationale |
|---|---|---|
| `draft` | `secondary` | neutral, not yet active |
| `scheduled` | `secondary` | neutral, not yet active |
| `running` | `positive` | active/healthy operational state |
| `paused` | `warning` | needs attention, not a failure |
| `stopped` | `warning` | needs attention, not a failure |
| `completed` | `secondary` | neutral end state |
| `failed` | `destructive` | genuine technical failure — the one case §23 reserves solid red for |

Both call sites (`CampaignGrid.tsx`, `CampaignDetail.tsx`) updated to drop the now-removed `dark` prop.

**Not touched, flagged for a future session**: several other hardcoded, unpaired color literals remain on these two screens (`text-amber-400`/`text-green-400`/`text-red-400`/`text-slate-600` for unclassified counts, result success/failure text, and the chevron icon). These represent *target-result* severity, not *campaign lifecycle status*, and weren't named in this session's "status styling" scope — left alone deliberately per the "preserve existing compact visual structure, do not redesign" instruction, not missed.

**Verification**: code-inspected only for actual rendered contrast in both themes (same `vercel dev` limitation as above prevents a live Light/Dark screenshot pass this session) — but the fix itself is structurally sound: every S1 variant used here already has verified-correct paired `dark:` classes in `badge.tsx` itself, reused unmodified.

## 4. Terminology

`CampaignDetail.tsx`'s Targets table column header changed from "Campaign Result" → "Current Result", matching what `CustomerDetail.tsx`'s Campaign Participation section (Session 11.5B) already established for the identical `effective_result_id`-sourced concept. Grepped the whole `src/` tree for any other literal "Campaign Result" UI string — none found (the only other occurrence was a code comment in `AgentDetail.tsx`, not a UI label, left untouched). No change to what the value means or how it's computed — label-only.

## 5. Target-count discrepancy — root cause found and fixed at the display layer

**Investigated the actual code, not assumed.** The two displayed counts come from genuinely different queries:

- The stat strip/heading intent — `campaign.stats.targetCount` — comes from `call_center_campaign_get`'s stats subquery: `count(distinct t.id) from campaign_targets t ... where t.campaign_id = p_id`. No join to `customers`/`customer_contact_points`. Always correct.
- The previous "Targets (N)" heading used `targets.length` — the rows actually returned by `call_center_campaign_list_targets`, which **INNER JOINs** `customer_contact_points` and `customers` (`join call_center.customer_contact_points cp on cp.id = tg.contact_point_id` / `join call_center.customers cu on cu.id = tg.customer_id`). If a `campaign_targets` row's `contact_point_id`/`customer_id` doesn't currently resolve to an existing row, that target is **silently excluded** from `listTargets`'s result — while still being counted by the plain-COUNT stats query. This is the concrete, code-level cause of the reported "0 targets" vs "Targets (3)" contradiction.

**Fix applied, within this session's UI-only scope**: the "Targets (N)" heading now reads `campaign.stats.targetCount` (the always-correct aggregate) instead of `targets.length`. If the two counts still disagree after this change — i.e. the underlying join is actually dropping a row — an honest amber caveat banner now renders above the table: *"N targets exist for this campaign, but only M could be loaded below — some targets may reference a customer or contact record that could not be resolved. This is a known backend gap, not lost data."* This makes the real gap visible rather than hiding it, without fabricating rows that can't actually be displayed.

**Not fixed here, correctly out of scope**: the root cause is a SQL `INNER JOIN` in `call_center_campaign_list_targets` (`supabase/migrations/20260926090000_campaigns_foundation.sql`) that should arguably be a `LEFT JOIN` (or the orphaned-reference case should be prevented upstream). Fixing it requires a migration change — explicitly forbidden this session ("Do not apply migrations", "database schema or migrations" listed as out of scope). Flagged here for a future session.

**Other metrics checked for the same pattern**: `triggeredCount`/`classifiedCount`/`successCount` in both `call_center_campaign_list` and `call_center_campaign_get` are computed directly from `campaign_targets`/`campaign_executions`/`campaign_results` with no dependency on `customers`/`customer_contact_points` resolving — not exposed to this failure mode. No other source mismatch found.

**Repeated-customer handling**: confirmed unchanged — no deduplication logic was added anywhere. `call_center_campaign_list_targets` returns one row per `campaign_targets` row regardless of how many share a `customer_id`; the fix above only changes which *count* is displayed in the heading, not which/how many target rows render.

## Verification summary

| Item | Status |
|---|---|
| Campaign List route (`/outbound-campaigns`) | ✅ unchanged, still works |
| Campaign Detail route (`/outbound-campaigns/:campaignId`) exists, resolves | ✅ live-verified (built app + `vite preview`, confirmed 200 + SPA shell on direct load) |
| Direct URL load/refresh | ✅ live-verified (same check — this is exactly what that check demonstrates) |
| Back/origin navigation (N1) | ⚠️ code-inspected only — mechanism identical to `CustomerDetail.tsx`'s proven-working one, not click-tested live this session |
| Search / status filter | ⚠️ code-inspected only — logic unchanged from before except the page-reset effect |
| Pagination | ⚠️ code-inspected only — only 1 real campaign exists in production, page 2 not genuinely exercisable |
| Target-count fix | ⚠️ code-inspected only — the root cause and fix are verified against the actual SQL/TS, but not confirmed against a live orphaned-reference example (none identified in production data this session) |
| "Current Result" terminology | ✅ verified via source grep — no other literal instance remains |
| Light/Dark (status badges) | ⚠️ code-inspected only — reuses already-theme-verified `Badge` variants, not screenshotted live this session |
| Responsive (4 viewports) | ❌ not performed — same `vercel dev` limitation as Sessions 11.7/11.5B/11.9; a static preview server without a working backend can't meaningfully exercise a data-driven page at various widths |
| TypeScript | ✅ `npx tsc --noEmit` — clean |
| Production build | ✅ `npm run build` — clean |
| Lint baseline | ✅ 117 errors / 36 warnings — exact match to documented baseline, no new violations |
| Vercel function count | ✅ 11 `api/*.ts` files, unchanged (no new endpoint added) |

## Commit

Staged by exact filename (`git add` on the 7 touched files only, verified via `git status` before and after — no `git add -A`). Local commit only, not pushed, not deployed.

**Commit SHA**: `278d8df31f810a096a39a18ee1237d64276e8302`

## Boundaries honored

No Call Centre code touched. No Supabase/schema/migration changes. No campaign execution/scheduling/reconciliation logic touched. No calls or chats sent or launched. No deployment. Session 12.2 not started — this report is the final action of this session.
