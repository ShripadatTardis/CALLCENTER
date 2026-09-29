# Session 12.2A — Live Campaign Call Correlation Proof

**CORRELATION STATUS: PROVEN — `call_sid == call_id`, confirmed empirically. See "Part 2" below for the controlled-call evidence that resolved this.**

Implemented/investigated directly in this session (no subagents). No code changed except this report. **One outbound test call was placed — by the user themselves, explicitly, to their own phone number, from the production UI — not by this session.** No additional call was placed or authorized in the continuation covered by Part 2.

---

## PART 1 — Original investigation (blocked, before the controlled call)

The sections below reflect the state of this investigation before the user performed the controlled test call. They are preserved unmodified as the historical record; Part 2 (at the end of this document) contains the continuation and the final, conclusive finding.

## 1. Backend health

**The Voice Agent backend is genuinely back up**, confirmed via the application's real proxy path (direct calls to the same upstream URL/key the proxy itself uses, not a separate mechanism):

| Endpoint | HTTP | Response time | Notes |
|---|---|---|---|
| `GET /api/v1/agents` | 200 | 0.22s | Returned `default_agent_id`, 3 real agents (`inbound-banking-default`, `emi-reminder-agent`, `forex-transaction-agent` — truncated in capture), personas/direction/language as previously documented. |
| `GET /api/v1/call-data?status=inactive&page=1&page_size=3` | 200 | 0.17s | Returned real summary (`total_calls: 682`, `fcr_rate: 12.0`, `escalation_rate: 58.2`) and real call records. |

No credentials/keys appear in this report.

## 2. Existing correlation architecture (read, not recreated)

Re-read `src/server/campaigns/campaignRunner.ts`, `src/server/campaigns/reconcileExecutions.ts`, `src/server/campaigns/types.ts`, and this session's own prior audit findings (Session 12.0) before touching anything.

**`campaign_executions` (`CampaignExecution` type, `src/server/campaigns/types.ts:149`) actually stores**, using real field names: `id`, `campaignTargetId`, `sequence`, `status` (`queued|triggering|triggered|failed`), `callSid`, `reconciliationStatus` (`pending|reconciled|unresolved|error`), `reconciledInteractionId`, `reconciliationCandidate` (diagnostic-only jsonb), `reconciledAt`, `triggeredAt`, `errorDetail`, `createdAt`, `requestPayloadSnapshot`. Matches exactly what §3 of the prompt asked to confirm.

**Reconciliation modes** (`reconcileExecutions.ts`, unchanged since Session 12.0's audit): a `CAMPAIGN_RECONCILIATION_CORRELATION_MODE` env var selects `'client_reference'` (not yet implemented — no real backend field to search on, an explicit placeholder in code) or `'call_sid_equals_call_id'` (implemented: searches `call-data?search=<callSid>` and matches `c.call_id === execution.callSid`). With no mode set, `tryAuthoritativeMatch()` always returns `null` — every execution ages out to `unresolved` after 30 minutes, never `reconciled`. **Confirmed still unset in both this environment's `.env.local` and in Vercel production** (`vercel env ls production` returns no `CAMPAIGN_RECONCILIATION_CORRELATION_MODE` entry) — unchanged from the Session 12.0 finding.

## 3. Controlled-call method

**Not performed.** Before attempting one, this session searched the project's own history for a previously-established safe test destination, per the prompt's explicit requirement ("Do NOT invent a phone number... If no safe test destination is available, STOP here and report that precise blocker").

**Finding: none exists.** `docs/CALL_CENTRE_LIVE_VERIFICATION_POST_OUTAGE.md` (an earlier session's own verification report) states this explicitly and unambiguously: *"Live test call — Not performed. No established safe test destination number exists anywhere in this project's history (checked all prior session docs)... A real Trigger Call → Call Data round-trip against a known-safe test number is the one remaining step to fully resolve this — recommend the user supply/confirm a safe test destination before this is attempted."* That recommendation was never fulfilled in any subsequent session between then and now.

**Per the prompt's own explicit instruction, this session stops at this point for the controlled-call step** — no phone number was invented, no real customer was called, no test call was placed.

## 4. Trigger Call identifiers

Not captured — no call was triggered. The documented `TriggerCallResponseDto` contract remains: `{ success: boolean, call_sid: string, status: string }` — re-confirmed by re-reading `src/types/api/calls.ts`, unchanged from prior sessions.

## 5. Call Data identifiers — real evidence gathered this session

Although no controlled call could be placed, the now-reachable backend allowed direct, real inspection of Call Data's actual current shape — genuinely new evidence beyond what any prior session could gather while the backend was down.

**One real record inspected in full** (identifiers only reproduced here, no sensitive content beyond what's already visible in the product's own Call Logs screen):
```
call_id:           b97b1be9-58ad-4a4d-8c2b-ccd73413bb75
transcript_doc_id: transcript:b97b1be9-58ad-4a4d-8c2b-ccd73413bb75
voice_record_url:  .../b97b1be9-58ad-4a4d-8c2b-ccd73413bb75_...wav (same UUID embedded)
```

**Confirmed empirically: `call_id` is UUID-shaped** (36-character lowercase hyphenated UUID), **not Twilio-Call-SID-shaped** (a real Twilio Call SID is always `CA` followed by 32 hex characters, 34 characters total). The same UUID is consistently reused across `call_id`, `transcript_doc_id`, and the recording URL — `call_id` is clearly the backend's own canonical internal identifier for the call.

**No alternate identifier field exists anywhere in the real payload.** The full real record was inspected key-by-key against §6's specific search list — `client_reference`, `campaign_execution_id`, `external_reference`, `metadata`, "custom reference": **none of these keys appear anywhere in the actual response.** The complete real key set is: `call_id, status, caller_name, caller_number, from_phone_number, agent_id, outcome, fcr, aht_seconds, intent_accuracy, intent, sentiment, sentiment_score, campaign_name, tags, transcript_summary, timestamp, start_time, stage, duration_seconds, channel, direction, ai_agent_id, ai_agent_name, context, escalation_trigger, transcript_doc_id, voice_record_url, was_authenticated, is_bank_customer, analysis, detailed_transcript` — exactly matching the existing `CallDataEntryDto` type, confirming (unlike some other areas of this project) the DTO does accurately describe reality for this endpoint, at least for this field set.

## 6. Exact correlation finding

**C — insufficient evidence for a full A/B determination**, but with real, new, narrowing evidence:

- **What was NOT possible to determine**: whether Trigger Call's `call_sid` (which was never observed this session, since no call was placed) is itself UUID-shaped or genuine-Twilio-SID-shaped. Without triggering a real call, there is no live `call_sid` value to compare against a `call_id`.
- **What WAS newly confirmed**: `call_id` in live Call Data is UUID-shaped, not Twilio-SID-shaped. **If** `call_sid` from Trigger Call turns out to be a genuine Twilio SID (the natural assumption given its name and Trigger Call's documented Twilio integration), then `call_sid == call_id` (branch A) would be **empirically false** for this environment — they are structurally different ID formats. **If** `call_sid` is ALSO actually UUID-shaped in this environment (i.e., "call_sid" is a misleading name for what's actually the backend's own internal UUID, not a real Twilio SID), branch A could still hold. This session cannot distinguish these two possibilities without observing a real `call_sid`.
- **What was ALSO newly confirmed, independent of the A/B question**: even if branch B applies, **no deterministic round-trip identifier field currently exists anywhere in the real Call Data response** to fall back on — `client_reference`/`campaign_execution_id`/`external_reference`/`metadata` are all absent. This directly matches, and now empirically confirms (rather than merely restates), the open item already flagged in `VoiceForce_Call_Centre_API_Specification_v 2.docx` §7: *"VoiceForce has observed UUID-shaped call_id values in live Call Data while the supplied documentation shows CA-prefixed Twilio-style IDs. Please confirm and standardize/document the production relationship."*

**No production correlation algorithm was implemented or changed based on this partial evidence**, per the explicit instruction not to blur outcomes or implement phone+timestamp correlation as authoritative.

## 7. Reconciliation result

**Not tested.** Per the prompt: "ONLY if deterministic correlation has now been proven" — it was not, so this step was correctly skipped rather than run against unproven assumptions.

## 8. Customer 360 linkage

**Not tested** — requires a controlled execution to trace, which requires the controlled call this session correctly declined to place.

## 9. Call Log linkage

**Not tested** — same reason.

## 10. Chat campaign generalization

Not touched. Explicitly re-affirmed, unchanged from prior sessions: **Campaign v1 execution channel verified in this project remains Voice only.** Chat → Customer 360 is a separate, already-verified integration (Session 11.9/11.9B), not reopened here, and this session found no new evidence suggesting Campaign → Chat execution exists.

## 11. Code/config changes

**None.** No correction was made because no live defect was discovered — the finding this session produced is "the question remains open, with two newly-confirmed facts narrowing it," not "the existing code is wrong." Setting `CAMPAIGN_RECONCILIATION_CORRELATION_MODE` was explicitly considered and explicitly NOT done, since the prompt's own instruction only authorizes enabling that mode after branch A is proven — which it was not.

## 12. Idempotency/duplication

**Not tested** — no execution was created this session to test against.

## 13. Tests/validation

Since no code was changed, a full re-run was performed purely as a confirmation that nothing drifted from Session 12.1/R1–R5's state:
- `npx tsc --noEmit` — clean.
- `npm run build` — clean.
- `npm run lint` — 117 errors / 36 warnings, exact baseline match.
- Existing Ratio deterministic suite: `ratio-math-verify.mjs` 17/17 passed, `ratio-dimensions-verify.mjs` 4/4 passed, both unchanged.
- Existing telemetry deterministic suite (`telemetry-verify.mjs`, R5): 22/22 passed, unchanged.
- No Campaign-specific deterministic test suite exists in this repository to re-run (confirmed via `.tooling/scripts/` listing — Campaigns has no equivalent to `ratio-math-verify.mjs`).

## 14. Remaining backend gaps

1. **The core, unresolved gap**: whether `call_sid` (Trigger Call) and `call_id` (Call Data) represent the same value has still never been empirically observed end-to-end. This session narrows the question (confirmed `call_id`'s real shape, confirmed no fallback identifier field exists) but cannot close it without a real Trigger Call → Call Data round trip.
2. **No safe test destination number exists in this project.** This is now the second consecutive session (this one, plus the earlier `CALL_CENTRE_LIVE_VERIFICATION_POST_OUTAGE.md` session) to document this exact same blocker, in both cases with the backend actually reachable at the time. This is a process gap, not a technical one — someone with authority to designate a safe outbound test number needs to do so before this specific question can ever be resolved empirically.
3. `CAMPAIGN_RECONCILIATION_CORRELATION_MODE` remains unset in both local and production environments — confirmed again this session.
4. If branch B eventually proves true (call_sid ≠ call_id), Call Centre would need to add a genuine round-trip identifier field to the Trigger Call/Call Data contract — this was already the recommendation in the enhanced Partner API spec, still not implemented as of this session's live check.

## GO / NO-GO for Session 12.2B

**NO-GO.** Session 12.2B (a small real campaign) is explicitly conditioned on this session proving deterministic correlation — it did not. Proceeding to 12.2B now would mean launching real outbound calls whose resulting Call Data records could not be reliably matched back to their originating campaign executions, defeating the entire point of the exercise and risking silent misattribution.

**What would unblock 12.2B**: either (a) the user or someone with authority supplies/confirms one specific, genuinely safe test phone destination, allowing a proper controlled Trigger Call → Call Data round trip to directly observe `call_sid` and settle the A/B question once and for all, or (b) Call Centre confirms and documents a deterministic reference field (`client_reference`/equivalent) that doesn't require a live call to reason about.

*(End of Part 1 — the original, blocked investigation. The user subsequently supplied exactly (a) above. Part 2 below is the continuation.)*

---

## PART 2 — Controlled-call continuation (this session, same day)

The user explicitly authorized and personally initiated exactly ONE outbound test call, to their own phone number, from the production Call Centre UI, using the EMI Reminder agent (`emi-reminder-agent`). **No call was placed by this session** — only read-only inspection followed.

### User-reported evidence (as supplied)

```
Date/time: Sep 29, ~12:37 PM local UI time
Direction: outbound
Agent: EMI Reminder
Caller/context: Shripad / EMI Reminder
Call Data / Call Log ID (Interaction Detail): 74ceab8d-ac75-40ff-8ce0-78b705bc9e93
Outcome: escalated
FCR: No
Intent: Emi Reminder
Campaign displayed: Payment Follow-up
Recording: ~12 seconds
Transcript: present, starts with EMI-payment opening
Call Log total: 682 -> 683
```

### Step 1 — Locating the original Trigger Call response

No phone/time/agent matching was used as the actual proof mechanism (per the explicit instruction) — those were only used to orient which real production log entries to look at. The actual proof came from **Vercel's own runtime request logs for the production deployment**, which were still within retention and directly captured the real request sequence:

```
12:37:22.95  GET  /api/calls/data          (Call Logs page, before the call)
12:37:33.95  POST /api/calls/trigger        <-- the Trigger Call request itself
12:37:46.61  GET  /api/calls/data           (Call Logs refreshed)
12:37:46.65  GET  /api/calls/session/74ceab8d-ac75-40ff-8ce0-78b705bc9e93   <-- post-trigger status poll begins
12:37:51.36  GET  /api/calls/session/74ceab8d-ac75-40ff-8ce0-78b705bc9e93
12:37:54.90  GET  /api/calls/session/74ceab8d-ac75-40ff-8ce0-78b705bc9e93
12:37:58.38  GET  /api/calls/session/74ceab8d-ac75-40ff-8ce0-78b705bc9e93
12:38:01.86  GET  /api/calls/session/74ceab8d-ac75-40ff-8ce0-78b705bc9e93
```

**Why this proves the `call_sid` value directly, not just its shape:** the repeated `GET /api/calls/session/{id}` calls are the app's own existing post-trigger status-poll mechanism (`useInteractionTranscript(lastTriggeredCall.interactionId, {poll: true})`, wired up in `useInitiateCall.ts`). That hook is invoked with `lastTriggeredCall.interactionId` — and `src/services/calls/callsMapper.ts`'s `mapTriggerCallResponse` sets `interactionId: dto.call_sid` **verbatim, the raw Trigger Call `call_sid` value, unmodified**. So the ID embedded in these poll URLs (`74ceab8d-ac75-40ff-8ce0-78b705bc9e93`) is not a guess or an inference — it is, by construction of the application's own existing code, the literal `call_sid` the backend returned from `POST /api/calls/trigger` moments earlier.

(No separate persistence of the raw Trigger Call response body exists anywhere in this application — confirmed by re-reading `api/calls/trigger.ts`/`api/_voicebot.ts`, neither logs or stores the response. Vercel's own platform-level request logging, not anything this app built, is what made this recoverable. Had these logs already rolled off retention, the `call_sid` would genuinely have been unrecoverable, exactly as the prompt's third possible outcome anticipated — it happened not to be, this time.)

### Step 2 — Independent verification against real Call Data

Queried the live backend directly for calls on 2026-09-29 (`status=inactive`, read-only, no data mutated):

```
call_id:        74ceab8d-ac75-40ff-8ce0-78b705bc9e93
caller_name:    Shripad
caller_number:  +919930647652
agent_id / ai_agent_id: emi-reminder-agent
ai_agent_name:  EMI Reminder
direction:      outbound
outcome:        escalated
fcr:            false
intent:         Emi Reminder
campaign_name:  Payment Follow-up
start_time:     2026-09-29T12:37:46.349199+05:30
duration_seconds: 1
transcript_doc_id: transcript:74ceab8d-ac75-40ff-8ce0-78b705bc9e93
voice_record_url: present (S3, signed URL)
```

Every field matches the user's reported UI evidence exactly (agent, direction, outcome, FCR, intent, campaign label, recording/transcript presence). `start_time` (12:37:46.349) matches the exact moment the status-poll requests began in the Vercel logs (12:37:46.65) to within API/network latency — an extremely tight, independent timing correlation on top of the identifier match itself.

### Step 3 — The comparison

```
call_sid (from POST /api/calls/trigger, recovered via the poll-request path): 74ceab8d-ac75-40ff-8ce0-78b705bc9e93
call_id  (from GET /api/v1/call-data, independently re-fetched from the live backend): 74ceab8d-ac75-40ff-8ce0-78b705bc9e93
```

**They are identical.**

### 6 (continued). Correlation finding — final

**A — `call_sid == call_id`, PROVEN.** Not inferred from format, not assumed from documentation — directly observed via two independent sources (the application's own real request logs, and a fresh independent read of the live Call Data API) that agree exactly. This resolves the open item that has been carried since the original Partner API specification review and re-raised in Session R2/R4/12.0/12.2A-Part-1.

This is now known to hold for **one real outbound call, on this specific deployment, today.** Per the prompt's own caution, this is direct proof for this call, not yet a statistically-large sample — but it is a genuine empirical data point, not a documentation assumption, and it is the exact evidence this whole investigation existed to obtain.

### 7 (continued). Reconciliation result

**Not run — correctly, because this specific call has no `campaign_executions` row to reconcile.** Confirmed via direct query: this call was placed through **Initiate Call** (a manual, ad-hoc trigger), not through the application's own Campaign runner — `select * from call_center.campaign_executions where call_sid = '74ceab8d-ac75-40ff-8ce0-78b705bc9e93' or reconciled_interaction_id = '...'` returned zero rows. The `call_sid_equals_call_id` reconciliation mode's *identifier equivalence assumption* is now proven; exercising the actual `reconcilePendingExecutions()` code path against a real database row still requires a real **campaign-triggered** call, which is exactly Session 12.2B's job, not this one's.

One incidental, honest observation: `campaign_name: "Payment Follow-up"` appears on this call-data record even though it was NOT triggered through this app's Campaigns feature. This confirms `campaign_name` is a Call-Centre/backend-side cosmetic label independent of VoiceForce's own `campaigns` table — worth remembering so a future session doesn't mistake this field for proof of campaign linkage.

### 8 (continued). Customer 360 linkage

**Checked directly** (`select * from call_center.customer_interactions where interaction_id = '74ceab8d-ac75-40ff-8ce0-78b705bc9e93'`): **zero rows — not yet materialized.** This is expected, not a defect: Voice interaction materialization runs via the existing async reconcile job (`vercel.json`'s cron, once daily at 03:00), and this call happened at 12:37 PM the same day — the next scheduled run hasn't occurred yet. Customer 360 linkage for this specific interaction should be re-checked after the next cron firing, but there is no reason to expect it will fail, since the underlying identifier chain is now proven sound.

### 9 (continued). Call Log linkage

**Confirmed**, both via the user's own UI report and independently via a fresh live API read: `total_calls` is 683 (up from 682 pre-call), and the specific record is present and fully populated (transcript, recording, outcome) under the exact same `call_id`. One underlying interaction, not a parallel copy — the Call Log entry IS the Call Data record IS the entity the Trigger Call `call_sid` pointed at.

### 12 (continued). Idempotency/duplication

Not separately tested this session (no repeated reconciliation was run, since there is no campaign execution for this call to reconcile — see above). No duplicate `campaign_result`/`customer_interaction`/`campaign_execution` risk exists for this specific call, since none of those were created by it in the first place.

### Updated GO / NO-GO for Session 12.2B

**Conditional GO.** The core blocking question — does `call_sid == call_id` — is now empirically proven, for the first time in this project's history, ending the ambiguity that has been carried since the original Partner API specification review. Session 12.2B (a small real campaign) may proceed on the basis that `call_sid_equals_call_id` reconciliation mode now has genuine empirical support, **conditional on**:
1. Explicit, deliberate configuration of `CAMPAIGN_RECONCILIATION_CORRELATION_MODE=call_sid_equals_call_id` (still unset as of this session) — this should happen as its own small, clearly-labeled configuration step at the start of 12.2B, not silently bundled into this report.
2. 12.2B using its own freshly-authorized, campaign-triggered controlled call(s) (this session's call was Initiate Call, not a Campaign execution) to exercise the actual `reconcilePendingExecutions()` → `campaign_results`/`effective_result_id` update path end-to-end, which remains genuinely untested.
3. The same non-negotiable safety discipline this whole arc has followed: any call placed in 12.2B must be to an explicitly user-approved safe test destination, never invented or inferred.

Session stops here, as instructed — no multi-target campaign, no R4.1, no R6, and no `CAMPAIGN_RECONCILIATION_CORRELATION_MODE` configuration change was made in this session (documented as the first recommended step for 12.2B instead, not performed silently here).
