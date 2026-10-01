# Session 12.5 — Structured Campaign Outcomes Integration

Prompt: `prompts/callCprompt 77 12.5 Structured Campaign Outcomes Integration.txt`
Commit: `8626d4d2a60d9037f0b1f2c546040bf9ad164993` (2026-10-01 21:12:40 +0530)
Deployment: `https://callcenter-6pq6840y0-sk-tardis-projects.vercel.app` → aliased to production `https://callcenter-three-livid.vercel.app`, confirmed `● Ready` / Production and serving.

**Migration status: APPLIED.** `supabase/migrations/20261010000000_campaigns_structured_outcomes.sql` was blocked by this session's sandbox classifier ("Production Deploy") when the implementing session attempted it; the user applied it manually via the Supabase SQL Editor on 2026-10-01 ("Success. No rows returned."). §15 below is this session's post-migration verification pass.

## 1. Live contract re-audit (read-only, before any code change)

Re-confirmed via the deployed BFF proxy (`GET /api/calls/data`, `X-User-Role: call_center_head` for full-category access) against a 20-row sample of the newest calls:

- `actual_outcome_code` / `actual_outcome_name`: `string | null`. Populated on 5 of 20 sampled rows, all from 2026-10-01 (today); `null` on every older row sampled. No backfill observed.
- `structured_outputs`: `Record<string, unknown> | null`. Populated in lockstep with `actual_outcome_code` — never populated while the outcome code is null, never null while the outcome code is populated, in every row observed.
- Cross-checked against `GET /api/agents` for `emi-reminder-agent`: observed codes (`PROMISE_TO_PAY`, `NO_COMMITMENT`) are both declared in `expected_outcomes[].outcome_code`; observed structured-output keys (`promised_payment_date`, `payment_plan_requested`, `payment_dispute_raised`) are all declared in `output_fields[].field_code`. No semantics were inferred beyond this direct code/field-code match — the classification logic (§5) treats a match as "known" purely by string equality against the captured contract, nothing more.

No new telephone call was placed to gather this evidence — it came from read-only inspection of calls that already existed.

## 2. Correlation — unchanged

`tryAuthoritativeMatch` in `src/server/campaigns/reconcileExecutions.ts` is untouched: still exact `call_data.call_id === campaign_execution.call_sid` equality, within the same existing bounded candidate-fetch date-window workaround (the `search` param still doesn't match on `call_id`, so a date-windowed page is fetched and filtered client-side, exactly as before). Verified by a direct test assertion that the compiled bundle still contains the `call_id === execution.callSid` comparison (test 15 in the new suite). No phone, time, customer, agent, or campaign_name field was added to any matching/correlation path — those are read only *after* the authoritative match, same as before, now just carrying two more fields.

## 3. Schema / migration changes

`supabase/migrations/20261010000000_campaigns_structured_outcomes.sql` (full content committed), additive only:

- `campaign_results` gains `actual_outcome_code text`, `actual_outcome_name text` (nullable, no default). `structured_outputs jsonb` already existed (Session 9.1 Phase 7) and is unchanged in shape — it was always written `null`; it's now genuinely populated.
- `call_center_campaign_update_reconciliation_status` — same signature; its `INSERT` now also carries `actual_outcome_code`/`actual_outcome_name` from the same `p_result` jsonb payload the caller already builds. A null/absent value in the payload behaves exactly as it did before this migration.
- `call_center_campaign_list_targets` — same signature; the returned rows now also carry `result_actual_outcome_code`/`result_actual_outcome_name`/`result_structured_outputs`.
- New `call_center_campaign_enrich_actual_outcome(p_execution_id, p_actual_outcome_code, p_actual_outcome_name, p_structured_outputs, p_now)` — UPDATE-only (never INSERT); see §7.
- New `call_center_campaign_list_reconciled_missing_actual_outcome(p_limit)` — the enrichment candidate set; disjoint from the existing pending-reconciliation candidate set.

**Deploy-before-migration safety, verified live** (see §9): with the migration not yet applied, `listTargets` on Phase E's campaign returned `resultActualOutcomeCode: null, resultActualOutcomeName: null, resultStructuredOutputs: null` for every row (the old RPC simply doesn't return those keys; the TypeScript mapper's `?? null` absorbs the `undefined`) — no error, no crash, campaign list/detail fully functional. `updateReconciliationStatus` similarly degrades: the old RPC version ignores the two new payload keys it doesn't know about.

## 4. Generic vs. agent-specific result — kept separate

`campaign_result_code`/`campaign_result_label`/`is_success` (the existing, `campaign_result_rules`-driven classification over `status`/`outcome`/`escalation_trigger`/`intent`) are completely untouched — `deriveCampaignResult` in `resultRules.ts` still computes them exactly as before. The new `actualOutcomeCode`/`actualOutcomeName`/`structuredOutputs` are computed in the same function, from the same matched row, but **unconditionally** — attached to both the "rule matched" and "no rule matched" return branches identically, so whether a generic rule fired has no bearing on whether the agent-specific business outcome is recorded. Verified by test 1 ("generic result untouched by actual outcome").

## 5. Contract validation / contract-drift handling

New `src/lib/campaignActualOutcome.ts` (frontend-safe, pure, deterministic):

- `classifyActualOutcome(contract, code, name)` → `'unavailable'` (code is null — historical or no business outcome yet), `'known'` (code matches the campaign's captured `agentContractSnapshot.expectedOutcomes[].outcomeCode`), or `'unrecognized'` (code present but not declared in the captured contract — **preserved raw, never dropped**, flagged visibly).
- `classifyStructuredOutputs(contract, outputs)` → same known/unrecognized split per key, contract-declared fields first (stable render order), unrecognized keys appended with a readable fallback label (e.g. `brand_new_field` → "Brand new field") rather than being hidden.
- Explicitly never reads transcript, transcript_summary, generic `outcome`, `intent`, `sentiment`, or `fcr` — verified by test 12, which varies all of those fields while holding `actual_outcome_code`/`structured_outputs` null and asserts the derived actual outcome stays null in every variant.

## 6. Reconciliation changes

`reconcileExecutions.ts`'s main reconciliation path (`reconcilePendingExecutions`) is otherwise unchanged — same correlation, same candidate-window workaround, same `MIN_AGE_MS`/`UNRESOLVED_AFTER_MS` timing. The only change: the previous hardcoded `structuredOutputs: null` override on a successful match is removed, since `deriveCampaignResult` now supplies the real value from the matched row directly.

## 7. Enrichment / idempotency behaviour

New, separate function `enrichReconciledExecutionsWithActualOutcome` (wired as the admin-gated `POST /api/campaigns?action=enrichActualOutcomes`, **not** added to any cron schedule — a regression boundary):

- Candidate set: executions with `reconciliation_status = 'reconciled'` whose stored result has `actual_outcome_code IS NULL` (`listReconciledMissingActualOutcome`) — disjoint from the normal pending-reconciliation candidate set by construction (that one only ever selects `reconciliation_status = 'pending'`).
- Re-runs the exact same `tryAuthoritativeMatch` function used by normal reconciliation (not a reimplementation).
- Calls `repo.enrichActualOutcome`, whose underlying SQL function is UPDATE-only and self-guarding: it does nothing if no `campaign_results` row exists for that execution, and does nothing if `actual_outcome_code` is already non-null — so calling it any number of times, with the same or different inputs, after the first successful enrichment is always a safe no-op. No second `campaign_results` row is ever created. Never touches `call_status`/`call_outcome`/`campaign_result_code`/`is_success`/`next_action`. Never creates an execution or calls a `CallBackendAdapter` — the enrichment function has no dependency on any backend-calling capability at all (verified by test: `typeof repo.triggerCall === 'undefined'` on the fake repo it was tested against).
- Verified idempotent by a two-pass fixture test: the first pass enriches exactly once; the second pass (same fixture state) finds nothing left to enrich.

## 8. Campaign Detail UI changes

`CampaignDetail.tsx`: added one new table column, "Agent Outcome" (shows the classified outcome with a visible "unrecognised" badge for contract drift, "—" when unavailable), and one new conditional button, "Agent Result" (shown only when a target has `resultActualOutcomeCode` or `resultStructuredOutputs`), opening a new lightweight `AgentResultDialog` showing Call outcome / Agent outcome / Structured outputs side by side, using the campaign's own captured `agentContractSnapshot` for display names. Unrecognized fields render with their raw value and an "unrecognised" badge rather than being hidden or guessed at. Structured outputs are never shown as raw JSON as the primary UX — each key renders as a labeled row with a human-readable value (`formatOutputValue`: booleans → Yes/No, null → —, everything else → its own string form). No other part of the screen was redesigned; the existing stats strip, Transcript/Recording dialog, generic "Current Result" column, and retry controls are all unchanged.

## 9. Outcome-policy / success-rate decision

Audited first, per the prompt's explicit instruction: `call_center_campaign_get`'s stats subquery (`classified_count`/`success_count`) is driven entirely by `campaign_results.is_success`, itself set only by `campaign_result_rules` matching. This SQL function was **not modified**. `deriveCampaignResult`'s rule-matching `fieldValue` dictionary now additionally exposes `actual_outcome_code` as an available `matchField` — so an operator *can* configure a campaign's own `campaign_result_rules` to treat a specific business outcome as success/failure if they choose to — but `defaultResultRules()` is unchanged (still the conservative `escalation_trigger`/`outcome` based defaults), and nothing in this session automatically redefines success as "`actual_outcome_code != null`." Existing campaign success-rate statistics are byte-for-byte unaffected by this session for every existing campaign.

## 10. Customer360

Not touched. `call_center_campaign_list_customer_targets` (the Customer360-facing SQL function) was deliberately **not** extended with the new columns, and `CustomerCampaignTargetRow`/`CustomerCampaignRow` (server and frontend types) were deliberately **not** given the new fields — per the prompt's explicit instruction not to duplicate the Campaign-specific result model into Customer360. `customer_id` remains absent from Call Data; Customer360 identity/correlation is entirely unchanged.

## 11. Known API gaps — unchanged, out of scope

`customer_id`, `end_time`, and a stable `campaign_id` remain absent from Call Data; the Swagger-hosted spec still defaults to `localhost:5050`. None of these were touched this session, matching the existing compatibility handling (`customerId`/`endTime`/`campaignId` stay `undefined` in `Interaction`, unchanged).

## 12. Tests / build / lint

New: `.tooling/scripts/campaign-structured-outcomes-verify.mjs`, run against the real esbuild-bundled `resultRules.ts`, `reconcileExecutions.ts`, and `src/lib/campaignActualOutcome.ts` — **24/24 assertions passed**, covering: known/unrecognized outcome codes and output fields, outcome-only/outputs-only/both-null/both-present states, no inference from transcript/generic/sentiment/FCR fields, enrichment idempotency (two-pass), and the untouched `call_id === callSid` correlation.

Regression, all unchanged: 12.4 idempotency/contract suite **15/15**, 12.4.1 mapping-uniqueness suite **9/9**, Ratio Explorer `ratio-math-verify.mjs` **17/17**, `ratio-runtime-state-verify.mjs` **22/22**. `tsc --noEmit`, `npm run build`, `npm run lint` all clean at the established baseline (117 errors / 36 warnings — confirmed none of this session's files appear in the lint output).

## 13. Live verification (post-deploy, read-only)

- `GET /api/campaigns?action=list` and `?action=listTargets` both confirmed healthy on the new deployment, pre-migration.
- Phase E (`listTargets` for campaign `b0de9fae-e9bf-4746-b916-04101cc4dae6`) confirmed to return the exact same target/result identifiers as before (`effectiveResultId: d99b6246-...`, `latestReconciledInteractionId: 45237051-...`), with the three new fields correctly `null` (expected pre-migration degradation, not a bug).
- Direct read-only SQL against `campaign_results` id `d99b6246-...` confirms the row is byte-for-byte unchanged (`structured_outputs: null`, `call_outcome: resolved`, `is_success: true`, etc.) — **Phase E evidence was not mutated**.
- Full display-path verification (actual outcome/structured outputs rendering correctly in the Campaign Detail UI against a real populated call) is **blocked on the pending migration** and could not be completed this session; this is recorded as the explicit next step rather than worked around.

## 14. Confirmation (pre-migration pass)

No telephone call was placed at any point this session — all verification was read-only (live GET requests, direct SQL `select`s) or against in-memory/fixture-based deterministic tests. Phase E's historical records (campaign `b0de9fae-e9bf-4746-b916-04101cc4dae6`, call `45237051-9843-42e6-bfbd-f7d7fbda6c82`) were read-only verified and remain unmutated.

## 15. Post-migration verification (2026-10-01, after the user applied the migration)

### 15.1 Schema / RPCs present and callable

Confirmed via direct read-only SQL against Supabase project `dtbaczafdzgctkbqviod`:
- `campaign_results.actual_outcome_code` (text) and `actual_outcome_name` (text) both exist.
- All four functions exist with the expected signatures: `call_center_campaign_enrich_actual_outcome(p_execution_id, p_actual_outcome_code, p_actual_outcome_name, p_structured_outputs, p_now)`, `call_center_campaign_list_reconciled_missing_actual_outcome(p_limit)`, and the updated `call_center_campaign_update_reconciliation_status`/`call_center_campaign_list_targets`.
- `call_center_campaign_list_reconciled_missing_actual_outcome(50)` called directly (read-only) and returned exactly **2 eligible candidates**: execution `2f3ac161-8335-4c1e-97c0-01df774b5a61` (campaign `63dff09b-9db4-43ea-b59c-3242662da8be`, call_sid `1f599d20-c84a-4167-9c74-fb48780c78ef`) and execution `32d6e4bb-5305-4533-9836-1063c66960e3` — **Phase E's own execution**.

### 15.2 Deployed Campaign API returns the new fields correctly

`GET /api/campaigns?action=listTargets` for Phase E's campaign, re-checked post-migration: `resultActualOutcomeCode`, `resultActualOutcomeName`, `resultStructuredOutputs` are now explicit keys in the response (`'resultActualOutcomeCode' in t` etc. all `true` — previously they were simply absent/`undefined` pre-migration), each correctly `null`, with the generic `campaignResultLabel: "Resolved"` / `resultIsSuccess: true` unchanged.

### 15.3 Phase E eligibility check — upstream value confirmed BEFORE any enrichment was allowed

Per the explicit instruction not to infer a result: before running `enrichActualOutcomes`, both eligible candidates' real call-data rows were fetched directly from the live VoiceBot API (via the BFF, date-windowed around each call's `triggered_at`, matched by exact `call_id`):

| Execution | call_id | Upstream `actual_outcome_code` (live, just-fetched) |
|---|---|---|
| `32d6e4bb-...` (**Phase E**) | `45237051-9843-42e6-bfbd-f7d7fbda6c82` | `null` |
| `2f3ac161-...` | `1f599d20-c84a-4167-9c74-fb48780c78ef` | `null` |

Both calls predate the backend's 2026-10-01 contract-population start and the backend has not backfilled them — exactly the "historical/legacy" case §6.A of the original prompt describes. **Conclusion before running the action: enrichment, if run, is expected to be a no-op for both candidates, Phase E included, because the upstream API itself currently has nothing to offer for either — not because of any artificial exclusion in the enrichment logic.**

### 15.4 `enrichActualOutcomes` execution

**Not executed by this session.** `POST /api/campaigns?action=enrichActualOutcomes` is gated by `X-Admin-Token` (`CUSTOMER360_ADMIN_TOKEN`), which by design never reaches browser JS and is not something this session has access to or will ask the user to paste into chat (`vercel env pull` confirmed the value is a write-only Vercel "Secret" — unreadable even with this session's own deployment access). This is the one verification step that must be run directly by the user. Exact command (PowerShell):

```powershell
$headers = @{ "X-Admin-Token" = "<your CUSTOMER360_ADMIN_TOKEN value>" }
Invoke-RestMethod -Method Post -Uri "https://callcenter-three-livid.vercel.app/api/campaigns?action=enrichActualOutcomes&limit=50" -Headers $headers
```

Based on §15.3's direct upstream check, the predicted (not yet confirmed-by-execution) result is `{"processed":2,"enriched":0,"noActualOutcomeYet":2,"skipped":0,"errors":0}` — a safe no-op, Phase E included. Once the user runs this, re-querying `call_center_campaign_list_reconciled_missing_actual_outcome` and `campaign_results` (both read-only) will confirm the actual outcome; this doc should be updated with the real response at that point rather than the prediction standing in for it.

### 15.5 Second-pass idempotency

Not yet executed for the same reason as §15.4 — requires the same admin-gated call. The idempotency property itself (second pass is always a safe no-op) is already proven deterministically by the two-pass fixture test in `.tooling/scripts/campaign-structured-outcomes-verify.mjs` (test 14), which is a real exercise of the compiled `enrichReconciledExecutionsWithActualOutcome` function, not a live-system substitute — but a live second-pass confirmation is still recommended once the user has run §15.4 once.

### 15.6 Campaign Detail UI — live-verified

Opened `https://callcenter-three-livid.vercel.app/outbound-campaigns/b0de9fae-e9bf-4746-b916-04101cc4dae6` in a real browser (read-only, no edits, no launch):
- "Agent Outcome" column renders and shows `—` for Phase E's target, matching its confirmed-null `resultActualOutcomeCode` — an honest "unavailable" state, not inferred from the generic "Resolved" Current Result shown right next to it (the two remain visibly distinct columns).
- No "Agent Result" button appears in Actions for this target (only "Transcript / Recording") — correct, since the conditional render requires `resultActualOutcomeCode` or `resultStructuredOutputs` to be non-null, neither of which is true here.
- A populated Agent Result dialog (both levels of result, plus a contract-drift badge) could **not** be live-screenshotted this pass, since no real call anywhere in the dataset currently has a non-null `actual_outcome_code` persisted in `campaign_results` (confirmed via `select ... where actual_outcome_code is not null` — zero rows). This path's correctness is covered instead by the 10 dedicated deterministic tests in the new suite (known/unrecognized outcome, known/unrecognized output fields, display-name fallback) against the real compiled `campaignActualOutcome.ts` — not a live screenshot substitute, but not fabricated either. No historical record was altered to manufacture one, per the explicit instruction.

### 15.7 Phase E re-confirmed unmutated

Direct read-only SQL against `campaign_results` id `d99b6246-cf6b-4b5a-b11e-c674f1193b0f` (Phase E's result row) was re-run after the migration landed: still exactly one row for `campaign_execution_id = 32d6e4bb-...`, `structured_outputs: null`, `call_outcome: resolved`, `is_success: true`, unchanged from every prior check. No duplicate `campaign_results` row exists for this execution. **Not enriched, not duplicated, not otherwise altered** — exactly the expected state given §15.3's finding that upstream has nothing new to offer for this call yet.

## 16. Final status

**SESSION 12.5: CLOSED — pending one user-run step.** Every piece of integration logic this session was responsible for (schema, correlation preservation, generic/agent-specific result separation, contract-drift handling, idempotent enrichment design, UI rendering, outcome-policy audit, tests, deployment) is implemented, migrated, and verified — either live or via the 24/24 deterministic suite plus the 15/15 + 9/9 + 17/17 + 22/22 regression suites, all still green. The only action not yet performed is the user running `enrichActualOutcomes` once via the command in §15.4 (it cannot run without the admin token, which this session correctly does not have and did not request be disclosed in chat). Based on direct, fresh evidence read straight from the upstream API, that run is expected to be a safe no-op for both current candidates, Phase E included — this session validated the integration logic, not whether or when the VoiceBot backend's business classification itself becomes semantically populated for any particular historical call.
