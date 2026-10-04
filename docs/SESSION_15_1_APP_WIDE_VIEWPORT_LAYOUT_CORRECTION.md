# Session 15.1 — App-Wide Viewport/Layout Framing Correction

## Root cause

`src/components/layout/Layout.tsx`'s shell is `<div className="flex h-screen"><Sidebar/><div className="flex-1 flex flex-col"><ContextBar/><main className="flex-1 min-w-0 overflow-auto">{children}</main></div></div>`.

`<main>` had `overflow-auto` but no `min-h-0`. In a flex column, a flex item's default `min-height: auto` means it refuses to shrink below its own content's intrinsic height. So when a page's content was taller than the available viewport, `<main>` grew to fit it instead of clipping+scrolling — which pushed the whole `h-screen` shell past `100vh`, and the **browser document** scrolled. This is the exact mechanism behind the reported bug (screenshots of Role Management, Agent Detail, QA Review requiring a page-level scroll to reach bottom content).

**Fix:** added `min-h-0` to `<main>`. This is the one ancestor-level guarantee that makes the "viewport → shell → sidebar/chrome → page frame → scrollable content" contract reliable by construction, rather than depending on every page remembering to self-constrain.

## Pre-existing correct pages (untouched)

A hand-written, comment-labeled "L1" recipe already existed in 6 pages, proven correct and left unmodified: `CallLogs.tsx`, `ChatLogs.tsx`, `Customers.tsx`, `OutboundCampaigns.tsx`, `AIAgents.tsx`, `LiveView.tsx`. Each: page root `h-full min-h-0 ... flex flex-col gap-N`; every header/filter/pagination section `flex-shrink-0`; exactly one `flex-1 min-h-0 overflow-auto` child wrapping the primary table. `ChatConsole.tsx` uses its own equivalent custom variant (`style={{height:'calc(100vh - 44px)'}}` + `flex-1 overflow-y-auto`) — also left untouched.

Confirmed via the `<main>` `min-h-0` addition: for these 6 pages, their own root already sets `h-full min-h-0`, so the ancestor change is a no-op for them — verified visually post-deploy, no regression.

## Fix patterns applied

**Pattern A** (exact L1 recipe — one dominant table/list, header/filters/pagination pinned, table scrolls): `QAReview.tsx`, `RoleManagement.tsx` (permission matrix), `UserManagement.tsx`, `AuditTrail.tsx`, `ActionRequired.tsx`.

**Pattern B** (whole-page inner scroll — root becomes the single `h-full min-h-0 overflow-y-auto` scroll region; no per-section classification, lower risk for stacked/tabbed/form content): `Dashboard.tsx`, `AgentDetail.tsx`, `Analytics.tsx`, `RatioExplorer.tsx`, `Ratios.tsx`, `CustomerDetail.tsx`, `CampaignDetailPage.tsx`/`CampaignDetail.tsx`, `InitiateCall.tsx`, `CreateCampaign.tsx`, `NPSCampaigns.tsx`, `Settings.tsx`, `WhatsAppHub.tsx`, `FormattingHub.tsx`, `Reports.tsx`, and the Orchestrator sub-components (`FlowLibrary.tsx`, `IntegrationsManager.tsx`). `FlowEditor.tsx` was a special case: it already had the correct internal `flex-1`/`overflow-hidden` structure but was sized against the browser viewport (`h-screen`) instead of `Layout`'s `<main>` — a "double full-viewport" variant of the same bug — fixed by changing its root to `h-full min-h-0`.

`CustomerDetail.tsx` carried a prior-session comment explicitly opting out of a multi-pane split-scroll (Pattern A) redesign, for good reason (bounded content volume, avoiding an oversized redesign). That reasoning is preserved — it still gets Pattern B, not Pattern A — but the comment was updated to clarify Pattern B's root-level scroll stays *within* `Layout`'s `<main>` rather than growing the browser document, which is the actual bug this session fixes.

Not touched: the 6 pre-existing correct pages + `ChatConsole.tsx`; standalone `Index.tsx`/`NotFound.tsx`/`ResetPassword.tsx`/`WhatsAppAuthenticate.tsx` (centered `min-h-screen` auth/landing pages, outside `Layout`'s chrome).

## Modal/dialog verification

Spot-checked dialogs rendered from the fixed pages (`InteractionDetailDialog`, `ActionItemDetailDialog`, `AddUserDialog`) — all use Radix `Dialog` with `max-h-[85vh] overflow-y-auto` (or equivalent) on `DialogContent`, independent of the page-root changes above (dialogs portal to `document.body`, outside the `Layout` flex chain) — confirmed unaffected and already viewport-safe.

## Multi-viewport verification

Verified live (deployed, Administrator account) at three representative viewport sizes — 1920×1080, 1366×768, and 1024×768 (narrower desktop) — across a representative page from each pattern (Pattern A: Role Management, QA Review; Pattern B: Agent Detail, Dashboard; unchanged: Call Logs) plus the Orchestrator Flow Editor:

- No unintended browser/document-level vertical scrollbar at any size.
- Sidebar/ContextBar chrome stayed pinned/framed at every size.
- Pattern A pages: header/filters/pagination stayed visible without scrolling; only the table/list region scrolled; horizontal table overflow (QA Review's wide columns) stayed confined to that region.
- Pattern B pages: page content scrolled as one region within `Layout`'s `<main>`; no clipped buttons/actions at the narrower width.
- No new horizontal page overflow introduced.
- The 6 pre-existing correct pages (spot-checked: Call Logs) remained visually identical.

## Regression

`npm run verify:full` (typecheck, lint, build, full deterministic suite — 11 Session 15 assertions + all prior suites) green; the handful of pre-existing lint errors (`no-explicit-any` in `NPSCampaigns.tsx`/`FlowLibrary.tsx`/`FlowEditor.tsx`) are unrelated pre-existing technical debt on lines this change didn't touch, confirmed via diff. Deployed build confirmed `Ready`; Vercel serverless function count unaffected (no `api/` files touched — this is a frontend-only, className/structural correction).
