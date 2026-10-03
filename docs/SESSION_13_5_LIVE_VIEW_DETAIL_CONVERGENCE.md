# Session 13.5 — Live View → Shared Interaction Detail Convergence (DEC-LIVE-01)

**Scope:** replace Live View's own hand-built, inferior interaction-detail dialog with the mature shared `InteractionDetailDialog` already used by Call Logs, Campaign Detail, and Customer Detail. Consistency/correctness task, not a Live View redesign — filters, metrics strip, Agent Load panel, and the Escalation Alerts panel are all untouched.

---

## 1. What was duplicated, confirmed by inspection

Live View's previous per-row `<Dialog>` (one `Dialog` instance literally per table row, up to 20 at once) hand-rendered its own detail markup, independently reimplementing — with less capability and no live-update awareness — functionality the shared `InteractionDetailDialog` already has:

| Capability | Old Live View dialog | Shared `InteractionDetailDialog` |
|---|---|---|
| Duration / FCR / Intent confidence / Sentiment | Partial (duration, sentiment only) | Full `MetricStrip` |
| Authentication / Escalation / Campaign | Not shown | Shown |
| Call Summary / tags | Not shown | Shown |
| Recording | Not shown | Shown, with graceful "not available" state |
| Transcript | Static `interaction.transcript` slice only, last 6 entries, no search | `ConversationTranscript` — searchable, full history, live-polls for an active call via `useInteractionTranscript` |
| Agent Outcome (Session 13.2) | Not shown | Shown when genuinely populated |
| `call.analysis.*` | Rendered directly | Not used — `analysis.*` was already confirmed (Session 11.2's own report) to be a 1:1 duplicate of already-shown top-level fields, never genuinely unique data |

The old dialog also used `call.analysis.*`, the known duplicate structure the Phase 2 audit and Session 11.2's own documentation already flagged — never restored (§14).

## 2. What changed

**`src/pages/LiveView.tsx`** — the per-row `<Dialog>`/hand-built markup is gone. Each row's "View Details" is now a plain `Button` that sets `{ callId, phone }` state (stable identity — never a snapshotted `Interaction` object, so a 4s poll can never close the dialog or swap its contents under another id, §12). A single `LiveCallDetailDialog` instance renders at the page level, resolving the interaction to show two ways:

1. **Still in the active subset** — `calls.find(c => c.interactionId === selected.callId)` from the same live, 4s-polling `calls` array the table already renders from. This is the path that keeps Duration/Sentiment/transcript genuinely live, entirely via `InteractionDetailDialog`'s own existing `interaction.status === 'active'` branch (`useInteractionTranscript` with `poll: true`) — no Live-specific polling logic was added or duplicated.
2. **No longer in the active subset** (the call completed and rolled off `status=active` between polls) — a one-shot, non-polled lookup by phone + call_sid (`src/lib/callLookup.ts`, new — the same phone-search-then-filter-by-id pattern already proven independently in `InitiateCall.tsx` and `CampaignDetail.tsx`; extracted here only for Live View's own new call site, the two existing inline copies are untouched, zero regression risk to either). Three honest states: a brief loading spinner, the real final `InteractionDetailDialog` once the completed call's data is found, or an explicit "this call has ended… final details are not available yet" message if it hasn't materialized in Call Data yet — never fabricated.

No change was made to `InteractionDetailDialog` itself — its existing `isActive`/polling behavior already covered everything Live View needed. No shared-component extension was required (§11's "if the shared component requires a small generic extension" did not apply here).

## 3. Preserved Live-specific behavior

Untouched: the 4s poll (`useLiveCallData`), the "Refreshing…" indicator, the metrics strip, status/intent/search filters, the Agent Load panel, and the Escalation Alerts panel. The table's own `connecting`/`in-progress`/`escalated` status-badge logic is unchanged.

## 4. Stable selection semantics

- Selection state is `{ callId, phone } | null`, not an `Interaction` object — re-resolved from the live array on every render, so the dialog's content updates in step with each poll exactly like `InteractionDetailDialog`'s own internal update logic for any other screen.
- A call disappearing from the active subset does not close the dialog or show stale data under the old id — it triggers the one-shot completed-call lookup described above.
- `onClose` always just clears `selected` to `null`; there is no code path that can reassign the dialog to a different interaction id while open.

## 5. Verification

- `npm run typecheck` / `npm run build` / `npx eslint` — all clean on every touched file.
- `npm run verify:full` — all suites green (no deterministic suite specifically targets Live View's presentational logic — the resolution logic reuses `findCallBySidAndPhone`, which is itself a thin wrapper over `fetchCallData`, already exercised by existing integration points; no new pure-logic module was introduced here worth a dedicated esbuild-bundled unit suite).
- Per §15, **no telephone call was placed** to manufacture an active state for verification. Live browser verification used whatever real active/historical calls existed in the deployed environment at verification time; see the Integration section of the final completion report for what was and wasn't observable (an explicit limitation is stated if no genuinely active call existed at verification time, rather than manufacturing one).
- Customer/Call regression (§16) and Session 13.3 regression (§17) verified live — see the combined completion report.

## 6. Decision Register

`DEC-LIVE-01` marked implemented after deployed verification succeeded — see `docs/CALL_CENTRE_PHASE_4_DECISION_REGISTER.md`.
