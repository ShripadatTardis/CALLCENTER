# Session 2 — Core Interaction Lifecycle: Implementation Plan

**Status:** Planning only. No code written. Builds on Session 1 (accepted and closed) — the transport layer, DTOs, mappers, and proxy described below already exist and are production-verified; this plan is entirely about consuming them from real screens for the first time.

**Objective:** Initiate Call → live interaction state → Interactions/Call Logs → Interaction Detail → Transcript → Recording, as one connected, live path.

---

## 1. Current-state inspection summary

**Initiate Call** (`src/pages/InitiateCall.tsx`, `src/hooks/useInitiateCall.ts`, `src/components/initiate-call/*`):
- `useInitiateCall.ts` calls `makeApiCall()`/`generateCallPayload()` from `src/utils/initiateCallApi.ts` — the hardcoded Vapi.ai `fetch` with the browser-exposed bearer token (Phase 1 audit finding, still live in code).
- Call history is `localStorage`-only, keyed `tardis_call_history_{userId}`, cleared on logout.
- **Found during this inspection, not previously documented:** the agent dropdown in `CallConfigurationForm.tsx` populates from `useIndustryData().agents` (industry-generated mock agents), while `useInitiateCall.ts`'s own history-labeling logic looks the selected ID up in the *completely different* `src/data/initiateCallAgents.ts` array. These two ID spaces never overlap, so `selectedAgentName` in call history resolves to `'Unknown Agent'` in practice today. Confirms there are **two** obsolete mock agent sources feeding this one screen, not one.
- `validatePhoneNumber()` (`src/utils/initiateCallValidation.ts`) is generic E.164-style validation, not Vapi-specific — already noted in Phase 2 as compatible with Trigger Call's `to_phone_number` requirement.
- `CallHistoryList.tsx` has no click/detail handler — no existing linkage to a detail view.

**Call Logs** (`src/pages/CallLogs.tsx`, `src/components/call-logs/AdvancedFilters.tsx`, `TranscriptViewer.tsx`) — unchanged since baseline, confirmed via `git log`:
- Reads `useIndustryData().callLogs`, re-maps into an `extendedCallLogs` shape with `Math.random()` sentiment/intent-accuracy regenerated every render, and a fabricated transcript from `getIndustrySpecificTranscript()`.
- `AdvancedFilters.tsx` collects rich filter state (date range, outcome checkboxes, sentiment slider, duration slider, intent/tag/agent checkboxes) but **never applies it to the rendered list** — confirmed non-functional even against mock data.
- `TranscriptViewer.tsx` is a dialog (not a route) with fully decorative audio controls (no `<audio>` element at all) and dead Bookmark/Export buttons.

**Session 1 foundation** (all production-verified, to be consumed, not changed except one small addition noted in §6):
- `src/services/transport/{httpClient,errors}.ts` — proxy client + normalized `ApiError`.
- `src/types/api/{calls,agents}.ts` — DTOs, both now confirmed against live responses (agents' shape and `call-data`'s `direction` field were corrected in Session 1's follow-up fix).
- `src/services/calls/{callsService,callsMapper,callsKeys}.ts` — `fetchCallData`, `fetchSessionTranscript`, `triggerCall`; `callsKeys.list(filters)` / `callsKeys.session(id)`.
- `src/services/agents/{agentsService,agentsMapper,agentsKeys}.ts` — `fetchAgents()` returning `{defaultAgentId, agents}`; `agentsKeys.lists()`.
- `src/types/interaction.ts` — normalized `Interaction`, `TranscriptEntry`.
- `src/lib/queryClient.ts` — configured `QueryClient`, already wired into `App.tsx`.
- **No `src/hooks/*` query hooks exist yet** — Session 1 was explicitly scoped to stop short of that. Session 2 is where the hooks layer (`Screens → Hooks → TanStack Query → Services`, per the approved architecture) gets its first real implementations.

---

## 2. Files to modify / create

**New hooks** (the first real hooks layer — `src/hooks/calls/`, `src/hooks/agents/` are new directories):
- `src/hooks/agents/useAgents.ts` — `useQuery(agentsKeys.lists(), fetchAgents)`.
- `src/hooks/calls/useCallData.ts` — `useQuery(callsKeys.list(filters), () => fetchCallData(filters))`.
- `src/hooks/calls/useTriggerCall.ts` — `useMutation(triggerCall)`, invalidates `callsKeys.lists()` on success.
- `src/hooks/calls/useInteractionTranscript.ts` — `useQuery(callsKeys.session(interactionId), () => fetchSessionTranscript(interactionId))`, with the polling `refetchInterval` behavior defined in §5.

**Small Session 1 extension** (see §6 — one field was scoped out of Session 1's normalized model but is needed for Interaction Detail):
- `src/types/api/calls.ts` — no change needed (`was_authenticated` already present on `CallDataEntryDto`).
- `src/types/interaction.ts` — add `wasAuthenticated?: boolean | null` to `Interaction`, move it into the "confirmed-safe" list in the header comment.
- `src/services/calls/callsMapper.ts` — map `dto.was_authenticated` into it.

**Modified screens/components:**
- `src/hooks/useInitiateCall.ts` — replace `makeApiCall`/`generateCallPayload`/`localStorage` history with `useTriggerCall()` + a small `useCallData({ page_size: 5 })` for the "Recent Calls" panel (see §3). Keeps its current external shape (`config`, `isLoading`, `callHistory`, `updatePhoneNumber`, `updateSelectedAgent`, `initiateCall`, `isInitiateCallDisabled`) so `InitiateCall.tsx` needs no changes.
- `src/components/initiate-call/CallConfigurationForm.tsx` — swap `useIndustryData().agents` for `useAgents()`; render `agent.displayName`, value `agent.agentId`.
- `src/components/initiate-call/CallHistoryList.tsx` — accept `Interaction[]` instead of `InitiatedCall[]`; render `phoneNumber`, `agentDisplayName`, `status`, `startTime`.
- `src/pages/InitiateCall.tsx` — no change expected (still renders the same two panels via the same hook return shape).
- `src/pages/CallLogs.tsx` — replace `useIndustryData()` + `getIndustrySpecificTranscript()` + `Math.random()` with `useCallData(filters)`; filter state lifts here and is passed to `AdvancedFilters` and into the query.
- `src/components/call-logs/AdvancedFilters.tsx` — rework per the mapping table in §7 (remove/flag fields with no live equivalent; wire the rest to actually filter).
- `src/components/call-logs/TranscriptViewer.tsx` — expand into the Interaction Detail view per §4/§5; keep the dialog pattern (see §4 for why).

**Retired (obsolete Vapi/mock code for Initiate Call only, per explicit scope):**
- `src/utils/initiateCallApi.ts` — deleted (the Vapi `fetch` + hardcoded bearer token; this also finally retires the browser-exposed API key flagged in the Phase 1 audit).
- `src/data/initiateCallAgents.ts` — deleted (8 fake Vapi-UUID agents).
- `src/types/initiateCall.ts` — `CallPayload` and `AIAgent` removed (Vapi-shaped, superseded by `TriggerCallRequestDto` and `AgentSummary`); `CallConfiguration` kept as-is (still a reasonable, backend-agnostic form-state shape); `InitiatedCall` removed in favor of rendering `Interaction` directly.

**Explicitly untouched:** `src/utils/initiateCallValidation.ts` (reused as-is — not Vapi-specific), everything under `src/services/transport/`, `src/integrations/supabase/*`, `src/components/whatsapp/*`, `src/contexts/AuthContext.tsx`, all other pages.

---

## 3. What's retained vs. replaced

| Current logic | Disposition |
|---|---|
| `validatePhoneNumber()` client-side check | **Retained**, reused directly against `to_phone_number` |
| Phone number + agent selector UI fields | **Retained** — same two inputs, same layout |
| `CallConfiguration` type shape | **Retained** |
| Vapi `fetch`/hardcoded key (`initiateCallApi.ts`) | **Replaced** by `useTriggerCall()` → `POST /api/calls/trigger` |
| 8-agent Vapi-UUID mock list | **Replaced** by `useAgents()` → real 3-agent live list |
| `localStorage` call history | **Replaced** — see below |
| `CallLogs.tsx`'s industry-generated mock rows + `Math.random()` sentiment | **Replaced** by `useCallData()` |
| `AdvancedFilters`' non-functional filter state | **Replaced** — same controls where a live param exists, wired to actually filter; removed/flagged where none exists (§7) |
| `TranscriptViewer`'s fabricated transcript | **Replaced** by live `Interaction.transcript` / `useInteractionTranscript()` |
| `TranscriptViewer`'s decorative audio controls | **Replaced** by a real `<audio>` bound to `recording.url`, or an explicit unavailable state |

**Call history redesign, explained:** rather than inventing a new persistence mechanism to replace `localStorage` (which would just be a second mock store), the "Recent Calls" panel becomes the *same* `useCallData` query Call Logs uses, called with a small `page_size` and no filters — since `call-data`'s default ordering already surfaces active calls first, then newest completed calls, a just-triggered call appears here naturally once `useTriggerCall`'s success handler invalidates `callsKeys.lists()`. This reuses the existing architecture exactly as instructed instead of adding a parallel concept, and it fixes the underlying problem (history was never actually a system of record — it was per-browser, per-user, and wrong half the time due to the agent-ID mismatch noted in §1).

---

## 4. Interaction Detail — design

**Recommendation: expand the existing `TranscriptViewer` dialog into an Interaction Detail dialog, rather than introducing a new route.** Reasoning: the current UX pattern (click a call in the list → modal opens) already works and matches "retain current UI/layout where practical"; a dedicated `/call-logs/:id` route is a larger, genuinely optional change (bookmarkable/shareable URLs, back-button semantics) that isn't required to satisfy "selecting an interaction should show the real detail for that interaction." Noting this as the alternative for a future session if deep-linkable interaction URLs become a real requirement — not needed now.

**Fields shown**, all mapped directly from the already-normalized `Interaction` (no new DTO work beyond §6's `wasAuthenticated` addition):

| Requested field | `Interaction` source |
|---|---|
| Caller/phone identity | `phoneNumber`, `callerName` |
| Agent | `agentId`, `agentDisplayName` |
| Direction | `direction` |
| Status/stage | `status` |
| Duration/AHT | `durationSeconds` |
| Outcome | `outcome` |
| FCR | `fcr` |
| Intent | `intent` |
| Intent accuracy | `intentAccuracy` |
| Sentiment | `sentiment` |
| Sentiment score | `sentimentScore` |
| Tags | `tags` |
| Campaign name | `campaignName` |
| Summary | `summary` |
| Escalation trigger | `escalation.trigger` |
| Authentication state | `wasAuthenticated` (new, §6) |
| Recording | `recording.url` |
| Timestamps | `startTime` |

**Deliberately left blank, per instruction:** `customerId`, `endTime`, `campaignId` — shown as "not available" or simply omitted from the layout, never fabricated.

---

## 5. Transcript source-of-truth strategy

Two sources exist and Session 1 already normalizes both to the same `TranscriptEntry[]` shape (`mapDetailedTranscriptEntry` for `call-data.detailed_transcript`, `mapSessionTranscriptToInteraction` for `GET /sessions/{id}`) — so this is a *sequencing* decision, not a reconciliation-logic problem.

**Rule:**
1. On first paint of the Interaction Detail dialog, show `Interaction.transcript` (from the already-fetched `call-data` row) immediately — zero extra request, matches what the user just saw in the list.
2. If that array is empty (observed live during Session 1 verification — several active calls returned `"detailed_transcript":[]"` despite being in progress) **or** the interaction's `status`/`stage` indicates it's still active, fetch `useInteractionTranscript(interactionId)` (→ `GET /api/calls/session/{id}`) as the authoritative refresh.
3. For an **active** call, keep polling `useInteractionTranscript` while the dialog is open (`refetchInterval: 3000`, stopped when the dialog closes or the fetched `status` becomes `'completed'`).
4. For a **completed** call, fetch once via `useInteractionTranscript` only if step 2's empty-array condition applies; otherwise the embedded transcript from step 1 is authoritative and final — no further requests.

This gives one clear, single rule set instead of two parallel transcript code paths, and reuses Session 1's mappers exactly as they already exist.

---

## 6. Polling strategy after call initiation

Matches Phase 2's Live Integration Plan §11 recommendation almost exactly — now made concrete:

1. `useTriggerCall()`'s mutation resolves with `{interactionId, status, success}` (from `mapTriggerCallResponse`, `interactionId` = the returned `call_sid`). Render this immediately — no query needed for the very first status shown to the user.
2. Immediately after, start `useInteractionTranscript(interactionId)` with a **functional** `refetchInterval` (TanStack Query v5 supports this natively):
   ```
   refetchInterval: (query) =>
     query.state.data?.status === 'completed' ? false : 3000
   ```
   capped by an overall elapsed-time guard (~60s) after which polling stops regardless of status, consistent with Phase 2's "short-lived poll... then stop."
3. Once polling stops (either condition), the interaction's up-to-date state is whatever the last poll returned; the "Recent Calls" panel (§3) and Call Logs (once navigated to) pick it up normally through their own independent `useCallData` queries — no special-case syncing needed between the two.

**Needed model extension (small, not a backend gap):** `wasAuthenticated` is present on `CallDataEntryDto` (`was_authenticated`) but wasn't mapped into `Interaction` in Session 1, since Session 1 scoped its field list to the Phase 1 doc's illustrative set rather than every documented field. The user's Interaction Detail spec explicitly asks for "authentication state," so this plan adds the one missing mapping — a one-line addition to an existing pattern, not new architecture.

---

## 7. Filter mapping — `AdvancedFilters` to live `CallDataQueryDto`

| UI control | Live query param | Disposition |
|---|---|---|
| Date range | `date_from` / `date_to` | **Direct** — wire as-is |
| Outcome | `outcome` (single value: `resolved` \| `escalated`) | **Modify** — current UI is multi-select checkboxes including `dropped`/`callback_scheduled`, which have no live equivalent. Recommend converting to a single-select control over exactly `resolved`/`escalated`; **flagging** `dropped`/`callback_scheduled` as removed rather than fabricating a client-side-only filter for values the backend can't produce |
| Duration range | `min_duration` / `max_duration` | **Direct** — wire as-is |
| Direction (not currently a distinct control, but data now supports it) | `direction` | **Add** — a simple inbound/outbound toggle, now meaningful since Session 1's follow-up confirmed `direction` is live on every row |
| Free-text search | `search` | **Direct** — the live endpoint already does an ILIKE across intent/caller_name/phone/transcript_summary, a better version of what the UI implies today |
| Sentiment score slider | *(none)* | **Flag, recommend remove** — no server-side sentiment filter param exists; a client-side-only filter would silently only apply to whatever page happens to be loaded, which is worse than no filter. Sentiment stays visible per-row, just not filterable |
| Intent checkboxes | *(none — `search` partially covers it)* | **Flag, recommend remove as a discrete control** — collapsible into the general `search` box (docs confirm `search` matches intent text), not a true multi-select equivalent |
| Tag checkboxes | *(none)* | **Flag, recommend remove as a filter** — tags remain visible per-row (`Interaction.tags`), just not server-filterable |
| Agent checkboxes | *(none)* | **Flag, recommend remove as a filter** — agent identity remains visible per-row, just not server-filterable |
| Export button | *(none — client-side only)* | **Modify** — generate CSV client-side from the currently-fetched result set. **Known limitation to flag, not solve this session:** with real pagination this only exports the current page/filtered batch, not every historical record; a full multi-page export is a reasonable later enhancement, not required for Session 2 |

---

## 8. Recording behavior

- When `Interaction.recording.url` is present: render a real `<audio controls src={recording.url} />` (simplest, lowest-risk approach — `voice_record_url` is a pre-signed S3 URL per the docs, a native audio element should play it directly without needing the currently-fake custom transport controls). Both the Call Logs list row's "Play" button (currently has no handler at all) and the Interaction Detail dialog's audio section get this treatment.
- When absent (the majority of rows observed in live testing — many active/recent calls returned `voice_record_url: null`): show a clearly-labeled "Recording not available" state, not a dead-looking enabled button — directly per instruction.

---

## 9. Backend/API gaps

**None of these block Session 2's core objective** — Trigger Call, Call Data, and Session Transcript are fully documented and already proxied end-to-end. What follows are minor, non-blocking gaps already absorbed into the design above:

- No server-side filter params for sentiment range, intent, tags, or agent on `call-data` (§7 — resolved via UI removal/flagging, not a blocker).
- No direct `call_id`-keyed lookup on `call-data` (a single row is either already in-hand from the list fetch, or looked up via the ID-keyed Session Transcript endpoint instead — no gap in practice).
- CSV export is necessarily current-page/current-filter-only without a dedicated export endpoint — a scoped-down v1, not a blocker.

---

## 10. Verification plan

**Static checks (as in Session 1):**
1. `tsc --noEmit` — both `tsconfig.app.json` and the standalone `/api` check (unaffected this session, but re-run for regression safety).
2. `npm run build` — succeeds, no new warnings beyond the existing chunk-size one.
3. `npm run lint` — confirm the count stays at the established baseline (85/68/17) or improves (deleting `initiateCallApi.ts`/`initiateCallAgents.ts` may remove some existing `no-explicit-any` errors currently attributed to those files' consumers — worth checking whether the count *drops*, not just stays flat).

**Deployed Vercel smoke tests** (the authoritative check, per Session 1's established pattern — this environment's local `vercel dev` had an unresolved env-var propagation issue, so live verification against the production alias remains primary):
1. Trigger a real call via the UI (or a direct `curl` to `/api/calls/trigger` if no safe test destination number is available) — confirm a real `call_sid` comes back and the initial status renders.
2. Confirm the post-trigger poll updates status within the ~60s window without hammering the endpoint (check network tab timing matches the 3s interval and stops appropriately).
3. Open Call Logs — confirm rows are live (`sentiment`/`intentAccuracy` no longer change on refresh, since they're no longer `Math.random()`), confirm the two-source consistency: the count matches what `curl`'ing `/api/calls/data` directly shows.
4. Exercise date-range, outcome, and duration filters — confirm the network request's query string carries `date_from`/`date_to`/`outcome`/`min_duration`/`max_duration` and the result list actually narrows (regression check against the *previously* fully non-functional filters).
5. Open Interaction Detail for a completed call with a real `voice_record_url` — confirm the audio element plays; open one with `null` — confirm the explicit "unavailable" state, not a dead button.
6. Confirm the agent selector on Initiate Call shows exactly the 3 real agents (Inbound Banking Assistant / EMI Reminder / Forex Transaction) with their real `display_name`s.
7. Re-check SPA deep-link routing (`/initiate-call`, `/call-logs` direct navigation) still returns 200 after this session's changes — quick regression check on Session 1's fix.
8. `grep` the rebuilt `dist/` for the backend hostname/API key, as in Session 1 — confirm still clean.

---

Stopping here per instruction — no code has been written. Awaiting approval before implementing Session 2, and Session 3 will not begin.
