# Session 16.4.3 — Interaction Trace API Integration

Status: implementation + automated + live-backend verification complete.
**Not committed, not pushed, not deployed to production.** Session 16.5
not started.

## 0. Baseline preservation

- Started from commit `94c6609` ("Sessions 7.10.1-7.11 — Multi-customer
  UI configuration"), confirmed GitHub Actions PASS / Vercel Production
  READY before this session began.
- `.env` carried only its pre-existing, unrelated 2-line modification
  throughout — confirmed via `git diff --stat .env` before and after.
- No files from the Session 7.x UI-centralization arc were touched.
  Existing Automated QA LLM integration, Call Data business-outcome
  integration, and QA scoring/calibration are completely untouched (see
  §7 for the explicit boundary enforcement).

## 1. API contract (`docs/Interaction_Trace_API.docx`)

Two endpoints, identical response shape, differing only by channel:

- `GET {VOICEBOT_BASE_URL}/api/v1/interaction-trace/call/{interaction_id}`
- `GET {VOICEBOT_BASE_URL}/api/v1/interaction-trace/chat/{interaction_id}`

Auth: `X-API-Key` header, requires the `transcripts` scope.
`interaction_id` must be 1-128 letters/digits/`-`/`_` — the real backend
`call_sid`/chat `session_id`, never a frontend display id.

Top level: `success`, `interaction_id`, `trace_version`,
`interaction_status` (`completed` | `in_progress` | `failed` | `null`),
`turns[]`.

Each turn: `turn_id`, `turn_sequence`, `turn_time`,
`customer_utterance`, `bot_utterance`, `prompt_type` (`tool` | `rag` |
`rag_tool` | `session_data` | `system`), `tool_calls[]`, `rag_calls[]`,
`frame_context`, `authentication_event`, `escalation_event`,
`customer_feedback_event`, `guardrail_event`. Full nested shapes for
tool calls, RAG calls/references, frame context (active frames, router
decision, slot-fill status, cross-tool reroute, soft continuation, final
plan) and all four event types are transcribed verbatim into
`src/types/api/interactionTrace.ts` — see §2.

Errors use `{success: false, error, message}`: 401 (missing/invalid
key), 403 (key lacks `transcripts`), 404 `trace_not_found` (unknown id,
wrong-mode id, or outside retention), 409 `trace_not_ready` (in-progress
interaction, no turn recorded yet), 422 `invalid_interaction_id`
(malformed id), 502 `trace_store_unavailable`.

Documented-but-currently-always-null fields (`frame_context.reason`,
`escalation_event`) are typed anyway, never omitted — so no future shape
change is needed when the backend starts populating them (see the type
file's own header comment).

## 2. Typed API integration

New `src/types/api/interactionTrace.ts` — every documented field typed
exactly as the docx describes it (snake_case wire shape, same DTO-vs-UI-
model boundary convention as `src/types/api/calls.ts`). No field was
discarded because an initial UI pass doesn't display it (brief §3) — the
full nested structure (tool calls, RAG references, frame context, all
four event types) exists in the type even where the UI only surfaces a
subset today.

New `src/lib/interactionTraceValidation.ts` — `INTERACTION_ID_PATTERN`
(`/^[A-Za-z0-9_-]{1,128}$/`) and `isValidInteractionId()`, shared by both
new BFF route branches so an obviously malformed id returns 422
immediately rather than being forwarded upstream.

## 3. Voice/chat endpoint selection

`src/services/interactionTrace/interactionTraceService.ts`'s
`fetchInteractionTrace(interactionId, channel)` selects the proxy path
by `channel`: `'call'` → `/calls/data?resource=trace&id=...`, `'chat'` →
`/chat/logs?resource=trace&id=...`. Verified structurally in
`.tooling/scripts/interaction-trace-verify.mjs` (the real `api/calls/
data.ts`/`api/chat/logs.ts` source is read and asserted to dispatch on
`resource === 'trace'` and to proxy to the correct documented upstream
path per channel).

## 4. BFF route and authentication handling

**No new Vercel Function file was added** — this project is at the
Vercel Hobby-plan 12-function ceiling (confirmed via `find api -name
"*.ts" -not -name "_*"` before starting: exactly 12). Both new branches
extend EXISTING dispatcher files, following the same
`?resource=<name>` convention `api/calls/data.ts`'s own `?resource=
metrics` branch (Session 15.4) and `api/admin.ts`/`api/campaigns.ts`
already established:

- `api/calls/data.ts` — new `handleInteractionTrace()`, dispatched when
  `resource === 'trace'`. Validates `id` against
  `INTERACTION_ID_PATTERN` (422 on failure), then proxies via the
  existing shared `proxyRequest()` helper (`api/_voicebot.ts`) to
  `{baseUrl}/api/v1/interaction-trace/call/{id}` — `X-API-Key` is
  attached server-side by `proxyRequest`, exactly like every other
  voicebot-proxying route in this codebase.
- `api/chat/logs.ts` — new `handleChatInteractionTrace()`, dispatched
  when `req.query.resource === 'trace'`. Same validation, proxies to
  `{baseUrl}/api/v1/interaction-trace/chat/{id}`.

**Authorization** — the Interaction Trace response carries no `agent_id`
at all, so it cannot be scope-checked the way Call Data/Chat Logs rows
are. This is the SAME problem `api/calls/session/[id].ts` already
solved for an identical reason (its own header comment documents it):
rather than build a second fragile heuristic, both new branches **fail
closed to unrestricted Agent Scope only** — a caller with
`access.allCategories` or `access.authorizedAgentIds === 'all'` may
fetch a trace by id; every scope-restricted caller gets a 404, never a
silent partial response. For chat specifically, a cheaper attribution
path exists in principle (`fetchLiveDetail` already resolves
`agent_id`), but it requires a full session+messages fetch just to gate
a trace request — deliberately not used here, to keep one consistent
authorization shape across both channels for the same resource type
rather than two different ones.

**Security**: the `X-API-Key` value is read once, server-side, inside
`api/_voicebot.ts`'s `getBackendConfig()`/`proxyRequest()` (pre-existing
shared helpers, unmodified) — never constructed, logged, or referenced
anywhere under `src/` (the client bundle). Verified structurally (§9).
Neither new handler logs tool parameters, tool results, or customer
transcript text — the handlers never inspect the response body at all,
they relay it as-is.

## 5. Trace retrieval and caching

`src/hooks/interactionTrace/useInteractionTrace.ts` — a TanStack Query
hook, same convention as `useInteractionTranscript`. Deliberately
**lazy**: `enabled` defaults to `false`, driven by the panel's own local
`open` state (§6) — a trace is only fetched once a viewer actually
expands the evidence section, never on every Interaction Detail open.
**No `refetchInterval`/polling** — the brief explicitly calls for
avoiding aggressive polling on an in-progress trace; a manual `Refresh`
action is exposed instead (same on-demand shape
`useInteractionTranscript` already uses for its non-poll mode). Uses the
shared `queryClient`'s default policy (`src/lib/queryClient.ts`): 30s
staleTime, no retry on 4xx (a 404/409/422 never retry-storms), a couple
of retries on a 502. The query key is `[interaction-trace, channel,
interactionId]`, so opening the same interaction's panel twice in one
session reuses the cached result rather than re-fetching (TanStack
Query's own dedup).

## 6. UI evidence presentation

New `src/components/interaction-detail/InteractionTracePanel.tsx`,
wired into both existing Interaction Detail dialogs — **no new
standalone screen**:

- `src/components/call-logs/InteractionDetailDialog.tsx` — added
  directly below the existing `AutomatedQaPanel`, before `SectionCard
  title="Recording"`.
- `src/components/chat/ChatSessionDetailDialog.tsx` — added directly
  below its own `AutomatedQaPanel`, before `ConversationTranscript`.

Collapsed by default (progressive disclosure, brief §6) — a self-built
collapsible header (same visual recipe as the existing
`CollapsibleSectionCard` primitive, reimplemented locally only because
that primitive's `open` state isn't externally controllable and this
panel needs to drive the lazy fetch from it). Expanded, it shows: trace
version, interaction status badge, turn count, then one compact row per
turn (sequence, `prompt_type` badge, timestamp, customer utterance,
assistant response). Each turn has its own **nested** "Technical detail"
toggle (only rendered when the turn actually has something to show —
tool calls, RAG calls, available frame context, or any event) revealing
tool executions, KB retrievals, routing, and the four event types as
structured rows — **never raw JSON** as the primary view, per brief §6.

Null/absent vs. empty-array states are kept visibly distinct: a turn
with `tool_calls: []` simply shows no tool rows; `frame_context.
available: false` shows no routing block at all (not "no routing
decision", which would look like a recorded absence rather than "this
turn never went through routing"); a RAG call with `references: []`
explicitly says "No matching passages" rather than rendering nothing,
since that genuinely is a recorded outcome (a lookup that ran and found
nothing), not an absent field.

## 7. QA integration boundary (brief §9 — hard guardrail)

Nothing added this session is imported from, or imports, any Automated
QA evaluation code. `InteractionTracePanel` renders independently of
`AutomatedQaPanel` in both dialogs (siblings, not nested) and shares no
state or data with it. Verified structurally, not just by inspection:
`.tooling/scripts/interaction-trace-verify.mjs` greps `src/server/qa`,
`src/hooks/qa`, and `src/services/qa` (the entire Automated QA
evaluation/scoring code path) for any reference to
`interactionTrace` — zero hits, enforced as an automated check, not a
one-time manual read. No evaluation prompt, scoring calculation,
calibration calculation, or human-review workflow was touched.

## 8. Error and fallback behaviour

`src/lib/interactionTraceErrorMessage.ts` — a pure function mapping
`(status, code)` → `{message, canRetry}`, extracted out of the UI
component specifically so every documented error case (§11) is
deterministically unit-tested without rendering React:

| Status | Code | Message framing | Retryable |
|---|---|---|---|
| 401 | — | server credential rejected, contact admin | No |
| 403 | — | credential lacks `transcripts` permission, contact admin | No |
| 404 | `trace_not_found` | no trace available (not a crash) | No — permanent absence |
| 409 | `trace_not_ready` | in progress, try again shortly | Yes — transient |
| 422 | `invalid_interaction_id` | not a valid trace identifier | No |
| 502 | `trace_store_unavailable` | temporarily unavailable | Yes — transient |
| other | — | generic message, never a crash | Yes (safe default) |

**Existing transcript fallback**: `InteractionTracePanel` is a fully
independent sibling of `ConversationTranscript` in both dialogs — a
trace 404/409/502 only affects the trace panel's own content; the
primary conversation view (and every other section of Interaction
Detail) renders exactly as before regardless of the trace API's status.
Verified structurally (both panels confirmed present and independent in
both dialog source files).

## 9. Files changed

New:
- `src/types/api/interactionTrace.ts`
- `src/lib/interactionTraceValidation.ts`
- `src/lib/interactionTraceErrorMessage.ts`
- `src/services/interactionTrace/interactionTraceService.ts`
- `src/services/interactionTrace/interactionTraceKeys.ts`
- `src/hooks/interactionTrace/useInteractionTrace.ts`
- `src/components/interaction-detail/InteractionTracePanel.tsx`
- `.tooling/scripts/interaction-trace-verify.mjs`

Modified:
- `api/calls/data.ts` — new `?resource=trace` branch
- `api/chat/logs.ts` — new `?resource=trace` branch
- `src/components/call-logs/InteractionDetailDialog.tsx` — wired the panel
- `src/components/chat/ChatSessionDetailDialog.tsx` — wired the panel
- `package.json` — `verify:full` now runs the new verify script

Untouched: every Session 7.x UI-centralization file, every QA
evaluation/scoring file, every authentication/authorization file beyond
reusing (never modifying) `resolveAccessForAuthenticatedUser`, every
campaign/call-initiation file, `.env`.

## 10. Automated verification

- `npm run typecheck` — PASS, clean.
- `npm run verify:full` — PASS, exit 0. Every existing suite unaffected
  (105/18/74-check suites and all others still 0 failed), plus the new
  `.tooling/scripts/interaction-trace-verify.mjs` — **43/43 passed**:
  - `interaction_id` validation (uuid-shaped id, chat-prefixed id, empty,
    spaces, path-traversal shape, over/at/under the 128-char limit).
  - Error-message mapping for every documented status (401/403/404/409/
    422/502/unknown), including the 404-vs-409/502 retryability
    distinction (permanent absence vs. transient failure, brief §5).
  - Voice/chat endpoint selection (structural: both route files read
    and asserted to dispatch on `resource === 'trace'` and proxy to the
    correct per-channel upstream path).
  - Both routes validate `interaction_id` before calling upstream.
  - Voice route's fail-closed-to-unrestricted authorization present; the
    PRE-EXISTING call-data authorization branch confirmed untouched
    (still calls `resolveAccessForAuthenticatedUser` the same number of
    times as before this session, i.e. the new branch added its own
    call rather than removing the old one).
  - Neither route reconstructs the trace response field-by-field
    (structural proof of "preserve the full nested structure, don't
    discard fields," brief §3).
  - `getBackendConfig()`'s missing-credential throw is confirmed intact
    and shared by both new handlers (both run inside the file's
    existing `withErrorBoundary` wrapper — a missing
    `VOICEBOT_BASE_URL`/`VOICEBOT_API_KEY` produces a clean 500, not an
    uncaught crash, for the new branches exactly like every existing
    one).
  - `InteractionTracePanel` confirmed present and independent of
    `ConversationTranscript` in both dialogs (existing-transcript-
    fallback proof, §8) and confirmed collapsed by default (lazy fetch
    proof, §5/§6).
  - `VOICEBOT_API_KEY` confirmed absent from every client-bundled
    directory under `src/` (components/pages/hooks/services/lib/types/
    contexts) — `src/server/*` is correctly excluded from this check
    (Node-only code imported exclusively by `api/*.ts`, never by the
    Vite client bundle — confirmed this session via a repo-wide check
    that no client-bundled file imports from `src/server`, only
    mentions it in comments).
  - QA-boundary check (§7) — 3 separate directory scans, 0 hits.

## 11. Live backend verification

Performed directly against the real backend (`https://
bankingvoicebot.nl-demo.com`) using the existing `VOICEBOT_API_KEY`/
`VOICEBOT_BASE_URL` from `.env.local` — **this is the SAME credential
set every other Voice API integration in this codebase already uses**,
confirmed to already exist before this session (no new secret was
required):

- Fetched a real, live completed call (`GET /api/v1/call-data`), then
  called `GET /api/v1/interaction-trace/call/{that call's id}` directly
  — **HTTP 200**, a real multi-turn trace returned, matching the typed
  contract exactly (an `authentication_event` with `method: "otp"`, a
  `tool_calls` entry for `get_customer_profile` with real `parameters`/
  `result`, `frame_context.router_decision.source: "gate"` — every
  field present in `src/types/api/interactionTrace.ts`). **This
  confirms the existing credential genuinely has the `transcripts`
  permission** — not assumed, directly observed.
- Called the SAME real call id against the **chat** endpoint — **HTTP
  404**, `{"error":"trace_not_found","message":"'...' is not a chat
  interaction. Use GET /api/v1/interaction-trace/call/..."}`, exactly
  matching the docx's documented wrong-mode behavior.
- Called a deliberately malformed id (containing a space and `!`) —
  **HTTP 422**, `{"error":"invalid_interaction_id", ...}`, exactly
  matching the docx's documented validation message.
- Temp files containing the real customer PII returned by the live
  trace (name, email, phone) were deleted immediately after use — never
  committed, never left on disk.

This is genuine, directly-observed live verification, not a fabricated
pass — the raw HTTP status/body from each call is quoted above exactly
as received.

## 12. Authenticated visual verification

A fresh isolated Vercel Preview was deployed
(`callcenter-ge4oe6zrm-sk-tardis-projects.vercel.app`, plain
`npx vercel --yes`, default VoiceForce build — brief §12 says not to
modify KATON configuration, and none was). The deployment itself is
confirmed healthy: the login page renders correctly (VoiceForce
branding, Industry/Email/Password fields, no build error).

**Honest disclosure — authenticated screens are NOT VERIFIED this
session.** This implementation pass had no mechanism to obtain a live
human login to the Preview (unlike the interactive session that usually
drives this kind of check), and entering any stored or guessed
credential would be a fabrication this codebase's session history
explicitly does not tolerate. The following are therefore **NOT
VERIFIED**, stated plainly rather than claimed:

| Screen | VoiceForce | Notes |
|---|---|---|
| Call Logs → Interaction Detail → Interaction Trace panel | NOT VERIFIED | Deployment confirmed healthy; panel not opened live |
| Chat Logs → Chat Session Detail → Interaction Trace panel | NOT VERIFIED | Same |
| QA Review | NOT VERIFIED | No code in this file changed this session |
| Automated QA Inspector | NOT VERIFIED | No code in this file changed this session |
| Light/Dark mode | NOT VERIFIED | — |

What IS verified in lieu of live visual confirmation: §10's structural
checks confirm the panel is actually wired into both dialogs and is
collapsed by default; §11's live backend call confirms the real API
response deserializes correctly against the exact types the panel
consumes (the same `turns[]` shape, same `tool_calls`/
`authentication_event` fields the panel renders); and `npm run build`
(part of `verify:full`) confirms the panel compiles and bundles without
error. This is real evidence of correctness short of a rendered
screenshot — not a substitute for one, and not presented as one.

## 13. Remaining backend dependencies

- `frame_context.reason` and `escalation_event` are documented as
  "currently always null" by the backend itself — the UI and types
  already handle this correctly (no escalation-event row renders when
  null), but genuine escalation-event display is unverified against
  real populated data because none exists yet upstream.
- Live visual/authenticated verification (§12) remains outstanding —
  the next session or a human reviewer with login access should open a
  real Interaction Detail dialog on this Preview (or production, once
  approved) and confirm the panel renders as designed.

## 14. Production-readiness assessment

**Ready pending visual confirmation.** Automated verification (type
safety, the full existing regression suite, the new 43-check suite) and
direct live-backend verification are both genuinely green. The one gap
before this could be confidently called fully verified is §12's
authenticated visual check — a 5-minute manual pass once a reviewer with
login access is available, not a redesign or rework. No business logic,
authorization, QA scoring, or campaign/call-initiation code was touched,
so the blast radius of any remaining surprise is contained to the new
panel itself (and it fails gracefully/independently per §8 even if
something is wrong with it).

Per the brief's stop conditions: **not committed, not pushed, not
deployed to production, Session 16.5 not started.** Presented for
review and approval.
