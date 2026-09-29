# Session 12.2A — Live Campaign Call Correlation Proof

**CORRELATION STATUS: NOT PROVEN — blocked on the absence of a safe test destination, not on backend availability.**

Implemented/investigated directly in this session (no subagents). No code changed. No call placed. Nothing committed beyond this report.

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

Session stops here, as instructed — no multi-target campaign, no R4.1, no R6.
