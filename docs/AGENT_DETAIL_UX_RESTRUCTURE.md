# Agent Detail — UX Restructure & Density Pass

**Scope:** presentation/information-hierarchy only. Zero backend changes, zero new APIs/tables/metrics, zero changed calculations. Every value shown is sourced exactly the same way it was before this session — only composition, layout, and (in one case) a field label changed.

---

## Previous hierarchy

1. Back button
2. Heading (name, Default badge, agent ID)
3. Full-width "Call Agent Contract — Call Centre" card: Direction/Persona/Language rows, then the full Session 13.3 contract (Expected Inputs/Expected Outcomes/Output Fields, each always rendered with their own "— none declared" header when empty) — always expanded, always visible
4. MetricStrip: Calls handled / Chats handled / Campaigns
5. Full-width "Customer 360 category mapping" card
6. Three large side-by-side cards (Business Outcomes / Conversational Quality / Technical Performance), each with an always-visible paragraph of provenance/limitation prose underneath its metrics
7. Campaign Usage MetricStrip (when applicable)
8. Recent Interactions table

On a typical viewport, reaching Recent Interactions required scrolling past a dominant, always-expanded contract block and three tall metric cards — most of which was identity/provenance text, not the operational numbers an operator actually needs first.

## New hierarchy

**A. Compact Agent Header** — the heading, plus one dense info bar (`Direction · Persona · Language · Category · Calls handled · Chats handled · Campaigns`) replacing what used to be 4 separate blocks (contract-card identity rows, a standalone MetricStrip, and a standalone Customer360 card). Counter hints (`Most recent 100 call-data rows`, etc.) are preserved as native tooltips (`title=`) rather than dropped.

**B. Operational Performance** — one compact responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`) of label/value rows replacing three large side-by-side cards. All the previously always-visible provenance prose (4 sentences total, verbatim, nothing summarized away) moved into a new `DataNotes` component — a small icon-only button opening a Radix `Popover` (keyboard-operable: Tab to focus, Enter/Space to open, Escape to close, proper focus return) rather than permanent paragraph text under every group.

**C. Agent Contract** — the full Session 13.3 contract exposure, now a `Collapsible` section (`aria-expanded`/`aria-controls` wired, same disclosure-button pattern already established in `CustomerActivityPanel.tsx`/`CampaignConfigurationHistory.tsx`), **collapsed by default**, with an at-a-glance summary in the trigger row and `Source: {contractSource}` always visible even collapsed.

**D. Campaign Usage** — structurally unchanged (same `MetricStrip`, same data), just positioned lower on a now-shorter page.

**E. Recent Interactions** — structurally and functionally unchanged; given more visual priority simply because everything above it is now shorter.

## Density changes

| Element | Before | After |
|---|---|---|
| Identity + contract-identity + counters + Customer360 | 4 stacked blocks | 1 heading + 1 info bar |
| Operational metrics | 3 full-width cards, ~9 rows + 3 paragraphs always visible | 1 compact grid, 9 rows; provenance in an on-demand popover |
| Agent Contract | Always expanded, full height | Collapsed by default, 1-line summary |

Combined effect: the identity/contract/counters portion of the page is reduced by roughly half its prior vertical footprint (per the brief's 40–50% target), and the Agent Contract — often the single tallest element on the page for a rich-contract agent like EMI Reminder — starts fully collapsed.

## Agent Contract disclosure behavior

- Collapsed trigger row shows: chevron, "Agent Contract" label, a summary (`"{n} inputs · {n} expected outcomes · {n} output fields"`, or the zero-contract sentence below, or `"Not yet published by Partner API"` for a legacy/partial contract), and `Source: {contractSource}` right-aligned.
- Expanding reveals exactly the same three subsections (Expected Inputs / Expected Outcomes / Output Fields) with exactly the same per-field detail (type, required/optional, format, allowed values, nullable) as before this session — no Session 13.3 content was removed, only re-contained.
- A legacy/partial contract (no live Partner API contract data) keeps its existing explanatory paragraph, now inside the collapsible rather than a separate always-expanded card.

## Zero-contract behavior

Previously, an agent with no declared inputs/outcomes/outputs (e.g. Inbound Banking Assistant) rendered three separate "— none declared" headers, one per subsection. Now, when a contract is `complete` but all three arrays are empty, the entire contract body collapses to one sentence: **"No declared inputs, outcomes or output fields for this agent."** The contract source remains visible in the (still collapsed-by-default) trigger row regardless. The page's overall section structure (A/B/C/D/E) is identical between a rich-contract agent and a zero-contract agent — no conditional layout branching beyond the existing, already-honest empty states.

## Intent terminology correction

"Intent accuracy (voice)" was relabeled **"Intent confidence (voice)"** (and the chat equivalent kept its existing "Intent confidence (chat)" label, already correct). The underlying `call-data.intent_accuracy` field is the model's own classifier confidence score, not a measured accuracy against a human-verified ground-truth label — this exact finding was already established and documented for Ratio Explorer's equivalent registry entry in Session 13.6 (`src/server/analytics/ratioRegistry.ts`'s `intent_accuracy` entry: *"the model's own classifier confidence score — not a measured accuracy against a human-verified ground-truth label"*). This session's change is label-only: the same field, the same aggregation, the same value — only the user-facing name was corrected to stop claiming measured accuracy it never had. The corresponding provenance note was folded into the `DataNotes` popover content, unchanged in substance.

## Preserved data semantics

Unchanged in this session: Agent API data source, full Agent Contract schema/values (Session 13.3), Calls/Chats/Campaigns counts, Customer 360 category mapping, Business Outcome/Conversational/Technical metric values and their source fields, Campaign Usage values and the Session 11.5A "latest effective result" policy, Recent Interactions identity resolution and Voice/Chat drill-through, Agent ID matching. No new API calls, no new calculations, no new backend capability.

## Regression verification

- `npm run typecheck` / `npm run build` / `npx eslint` — all clean.
- `npm run verify:full` — all existing suites green (no `AgentDetail.tsx`-specific deterministic suite exists or was needed — this is a presentation-only page with no pure-logic module to unit test; regression is verified via typecheck/build/lint plus live browser checks below).
- HIG design review performed — see the session's completion report for the result and any fixes applied.
- Live browser verification against the deployed app for both agent shapes (EMI Reminder — rich contract; Inbound Banking Assistant — zero contract) and the regression checklist (Agent list → Agent Detail, Back navigation, Recent Voice → Call Detail, Recent Chat → Chat Session Detail, Initiate Call's dynamic Agent Inputs unaffected, Campaign Agent Contract consumption unaffected) — see the completion report.

This is a presentation-layer session only and does not change the Phase 4 Decision Register.
