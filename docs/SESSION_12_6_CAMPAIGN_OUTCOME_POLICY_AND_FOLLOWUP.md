# Session 12.6 — Campaign Outcome Policy, Universal Classification & Follow-up Lifecycle

Prompt: `prompts/callCprompt 79 12.6 Campaign outcome mapping.txt` + a mid-session clarification: **Campaign Classification must be a system-level configurable master vocabulary — never hardcoded into Campaign business logic or UI.**
Commit: `73bc33eb3f0642f4e7287089d3e39092b6019738` (2026-10-02 12:18:39 +0530)
Deployment: `https://callcenter-indafy6an-sk-tardis-projects.vercel.app` → aliased to production `https://callcenter-three-livid.vercel.app`, confirmed `● Ready` / Production.
Migration: `supabase/migrations/20261011000000_campaign_outcome_policy_and_classification.sql` — applied directly from this session (not blocked this time).

## 1. Audited pre-existing architecture (before writing any code)

- **`campaign_result_rules`/`campaign_result_code`/`campaign_result_label`/`is_success`** — the existing generic, call-level result model (status/outcome/escalation_trigger/intent matching, Session 9.1). Left completely untouched; still drives `call_center_campaign_get`'s existing `classified_count`/`success_count`.
- **`campaign_followups`/`createFollowup`/`scheduleFollowup`** — a real, fully-built table + RPC + repository method + service function + React Query mutation (`actions.followup` in `useCampaignActions.ts`) that is **never called from anywhere in the UI** (no button) and **never created automatically** by reconciliation. Confirmed by a full repo-wide reference search. This is the key finding that shaped §15's decision below.
- **`NextActionType`** (`'retry' | 'follow_up' | 'close' | 'escalate' | 'move_campaign'`) — already exists and is already partially aspirational: only `close` (implicit target-completion) and `retry` (the existing manual Retry button in Campaign Detail) have a genuinely real execution path today; `escalate`/`follow_up`/`move_campaign` have never had one. Session 12.6 reuses this exact vocabulary unchanged rather than inventing a second one, per the prompt's explicit instruction.
- **Target lifecycle / multiple attempts** — `campaign_targets.effective_result_id` already identifies the one currently-effective reconciled result; `campaign_executions.sequence` already preserves every prior attempt. Session 12.6 classification is a property of a `campaign_results` row, so it automatically inherits this existing effective-result semantics with zero new code.
- **12.5's enrichment path** (`enrichReconciledExecutionsWithActualOutcome`) — already idempotent via an UPDATE-only, only-when-currently-null guard in `call_center_campaign_enrich_actual_outcome`. Reused directly rather than building a second idempotency mechanism for classification.
- **Grant hygiene gap found during audit**: Session 12.5's two new RPCs (`call_center_campaign_enrich_actual_outcome`, `call_center_campaign_list_reconciled_missing_actual_outcome`) were never explicitly locked to `service_role` — they silently kept Postgres's default `PUBLIC` execute grant. Closed in this session's migration (§3) as a small, in-scope, behavior-neutral fix, since it's the exact pattern this migration itself depends on.

## 2. Final Universal Campaign Classification vocabulary

Exactly the five codes specified, seeded as **rows in a new table**, never a TypeScript enum:

| code | label | is_success | is_fallback_unresolved |
|---|---|---|---|
| `SUCCESSFUL` | Successful | **true** | false |
| `FOLLOW_UP_REQUIRED` | Follow-up Required | false | false |
| `UNSUCCESSFUL` | Unsuccessful | false | false |
| `INVALID_TARGET` | Invalid Target | false | false |
| `UNRESOLVED` | Unresolved | false | **true** |

`NOT_COMMITMENT`/`NOT_REACHED` deliberately not added, per the explicit instruction.

## 3. System-configurable vocabulary — schema/migration

Per the mid-session clarification, this is implemented as **live, fetched data**, exactly the way the Agents roster is fetched live (`GET /api/agents` → `useAgents()`), never a hardcoded array:

- New table `call_center.campaign_classifications` (`code` PK, `label`, `description`, `is_success`, `is_fallback_unresolved`, `sort_order`, `active`), with a partial unique index guaranteeing at most one `is_fallback_unresolved = true` row.
- New read-only RPC `call_center_campaign_classifications_list()`, exposed as `GET /api/campaigns?action=listClassifications` (not category-gated — reference data, same treatment as Agents).
- `is_success`/`is_fallback_unresolved` are **data**, not logic: success-rate computation joins on `is_success` rather than comparing a code string anywhere; the one safe fallback-on-drift code is looked up via `is_fallback_unresolved` (see `outcomePolicy.ts`'s `unresolvedFallbackCode` parameter) rather than a hardcoded `'UNRESOLVED'` literal anywhere in business logic.
- `campaigns` gains `outcome_policy_snapshot jsonb` — immutable, captured once at creation (same pattern as `agent_contract_snapshot`).
- `campaign_results` gains `campaign_classification_code` (FK to the master table), `classification_contract_drift` (boolean), `classification_next_action_type` — strictly alongside, never overwriting, the existing generic columns.
- `call_center_campaign_create`, `call_center_campaign_update_reconciliation_status`, `call_center_campaign_list_targets`, `call_center_campaign_enrich_actual_outcome`, `call_center_campaign_get` all updated additively (new optional params / new output columns only — every pre-12.6 call site keeps working unchanged).
- Stats aggregation (`call_center_campaign_get`) computes `classification_counts` as a free-form `{code: count}` map via `GROUP BY` — never a hardcoded `FILTER (WHERE code = 'X')` per code.

## 4. Policy snapshot design

`OutcomePolicySnapshot = { mappings: [{ agentOutcomeCode, campaignClassificationCode, nextActionType }], capturedAt }`, stored verbatim on `campaigns.outcome_policy_snapshot`. Immutable: never re-derived against a later Agent catalogue change or a later edit to `campaign_classifications`. A campaign created before this migration simply has `outcome_policy_snapshot = null` — displayed as "legacy — no outcome policy captured," never synthesized.

## 5. Campaign Create UI — Outcome Policy step

Extended the **existing** "Outcome Policy" wizard step (already positioned after Agent Contract/Input Mapping — no new stage added) with a new "Agent Outcome Mapping" section, generated dynamically from `agentContractSnapshot.expectedOutcomes[]`: for each advertised outcome, its display name, code (small mono, subordinate), description, a **Campaign Classification select populated live from `useCampaignClassifications()`**, and a Next Action select (the existing `NextActionType` vocabulary). The pre-existing generic `campaign_result_rules` editor is unchanged, just given its own sub-heading now that the step holds two distinct policies. Reuses the exact Select/Label/Badge primitives already established by the Input Mapping step (12.4) — no new visual language.

**Completeness UX** (§5 of the prompt): every advertised outcome unmapped is listed in a Launch-blocking message (`requiredOutcomesUnmapped`), gating only "Launch Now" — "Save as Draft" remains available with an incomplete policy, matching the existing Input Mapping blocker pattern exactly. Nothing is ever silently defaulted to `SUCCESSFUL`/`UNSUCCESSFUL`.

## 6. Runtime classification

New, single-purpose pure function `src/server/campaigns/outcomePolicy.ts`'s `deriveCampaignClassification(actualOutcomeCode, policy, unresolvedFallbackCode)` — the **only** place in the codebase permitted to assign a `campaign_classification_code`:

- `actualOutcomeCode === null` → no classification at all (not `UNSUCCESSFUL`/`UNRESOLVED` — see §8).
- `policy === null` (legacy campaign) → no classification, ever.
- Mapped code → its configured classification + next action, `contractDrift: false`.
- Unmapped code (contract drift) → the data-driven fallback code, `contractDrift: true`, no next action guessed.

Takes only these two domain values — never transcript, summary, generic `outcome`, `intent`, `sentiment`, `router confidence`, or phone/time correlation. Wired identically into both `reconcilePendingExecutions` (normal path) and `enrichReconciledExecutionsWithActualOutcome` (12.5's late-arriving-outcome path), so the two can never disagree about how a given `(actualOutcomeCode, policy)` pair classifies.

## 7. Null / unknown / contract-drift handling

- **Null actual outcome** (§8): "Agent Outcome unavailable" has no classification, full stop — regardless of whether the campaign has a policy. Verified by dedicated tests (5–6 below) and directly relevant to Phase E, whose upstream `actual_outcome_code` remains null.
- **Unknown/unmapped outcome** (§13): the raw code stays preserved exactly as Session 12.5 already stores it (`actual_outcome_code` is untouched); classification falls back to the data-driven `UNRESOLVED`-equivalent code, flagged `classification_contract_drift = true`, visibly badged "policy drift" in both the table and the Agent Result dialog. The captured policy is never auto-modified.
- **Legacy campaign** (§16): `outcome_policy_snapshot = null` → never classified, never synthesized, displayed as "No Outcome Policy captured for this campaign (legacy)."

## 8. Legacy compatibility

Every pre-12.6 campaign (including Phase E, `b0de9fae-...`) has `outcome_policy_snapshot = null` and every one of its `campaign_results` rows has `campaign_classification_code = null` — confirmed live post-migration (§13 below). `classifiedCount`/`successCount`/the existing success-rate percentage are **byte-for-byte unchanged** for every campaign, since they still read only `is_success` on the existing generic model, untouched by this migration.

## 9. Next-action / follow-up behavior — explicit boundary

Per the audit in §1: `campaign_followups` exists but has no real execution path wired to anything today. Per the prompt's explicit "do not create a fake action whose execution path does not exist" instruction, **Session 12.6 does not auto-create a `campaign_followups` row** from a `FOLLOW_UP_REQUIRED` classification. Instead, the configured Next Action (`classification_next_action_type`) is persisted on the result and displayed honestly as a label in the Agent Result dialog — never presented as an automated trigger. The existing manual Retry button remains the only genuinely executable action this subsystem supports today. **This is a documented boundary, not an oversight** — a future session could wire `FOLLOW_UP_REQUIRED` → an actual `createFollowup` call once that mechanism has a real consumer, but that is out of this session's scope.

## 10. Statistics decision

Audited `call_center_campaign_get`'s existing stats subquery first (§1). Preferred direction taken: **preserve, don't migrate.** Existing `classifiedCount`/`successCount` keep being computed from `is_success` exactly as before — not redefined in terms of the new classification. Two **new, additive** stats appear only for policy-enabled campaigns: `policyClassifiedCount`/`policySuccessfulCount` (joined against `campaign_classifications.is_success`, never a hardcoded code comparison) plus a `classificationCounts` map. Surfaced in Campaign Detail's existing top metrics strip as two extra numbers, shown only when `campaign.outcomePolicySnapshot` is non-null — never turning the screen into an analytics dashboard (§12).

## 11. Multiple-attempt semantics

Unchanged lifecycle, confirmed by audit: each `campaign_executions` row gets its own `campaign_results` row (and therefore its own classification); `campaign_targets.effective_result_id` continues to identify the currently-effective one. Classification displayed at target level is simply whatever the effective result's `campaign_classification_code` is — no new "which attempt wins" logic was needed or added.

## 12. Campaign Detail UI

Extended without redesigning the screen: a new "Campaign Classification" table column (label resolved live, "drift" badge when applicable); the existing Agent Result dialog (from 12.5) gains a "Campaign Classification" + "Next Action" section below the existing Call Outcome/Agent Outcome/Structured Outputs sections — giving the full `Target → attempt → call → agent outcome → campaign classification → next action` hierarchy in one place. A legacy note appears only when the agent genuinely has outcomes that could have been mapped. Technical identifiers (outcome codes) remain small, muted, monospace, and subordinate to display names throughout — consistent with the existing pattern established in 12.4/12.5.

## 13. Tests / regressions

New `.tooling/scripts/campaign-outcome-policy-verify.mjs`, run against the real esbuild-bundled `outcomePolicy.ts` and `reconcileExecutions.ts` — **23/23 assertions passed**: all five classification codes reachable; known outcome mapped to each classification; the same agent outcome mapping differently across two campaigns; immutable/legacy-null policy never classifies; Launch-blocking completeness (documented, UI-layer, not separately fixture-tested); unknown outcome → preserved + drift-flagged fallback (using a non-hardcoded fallback code, explicitly proven by passing a different fallback value); null actual outcome → never fabricated; classification function takes only `(code, policy, fallbackCode)`; `SUCCESSFUL` is the only `is_success=true` row; legacy campaign generic result unaffected; reconciliation and enrichment integration; enrichment idempotency (two-pass).

Regression, all unchanged: 12.4 idempotency **15/15**, 12.4.1 mapping-uniqueness **9/9**, 12.5 structured-outcomes **24/24** (after updating that suite's fake-repo fixture to supply the new `listClassifications`/`getCampaign` calls reconciliation now makes — a fixture update, not a behavior change), Ratio Explorer `ratio-math-verify` **17/17** and `ratio-runtime-state-verify` **22/22**. `tsc --noEmit`, `npm run build`, `npm run lint` all clean at the established baseline (117 errors / 36 warnings, confirmed none of this session's files appear in the lint output).

## 14. Live verification (post-deploy)

- `GET /api/campaigns?action=listClassifications` confirmed live, returning all 5 codes with correct `isSuccess`/`isFallbackUnresolved` flags.
- Browser walkthrough of Create Campaign's Outcome Policy step against the real EMI Reminder agent: all 10 real advertised outcomes rendered (Opted Out, Wrong Person, Promise to Pay, Payment Plan Requested, …), Campaign Classification dropdown populated with the exact 5 live-fetched labels (Successful, Follow-up Required, Unsuccessful, Invalid Target, Unresolved), selection persisted correctly in component state. **No campaign was created or launched** — the wizard was abandoned mid-flow, named "SESSION 12.6 UI VERIFICATION - DO NOT LAUNCH."
- Phase E (`campaign_results` id `d99b6246-...`) re-confirmed read-only post-migration: `call_outcome: resolved`, `is_success: true`, `actual_outcome_code: null`, `campaign_classification_code: null` — new columns present, correctly null, nothing retroactively mutated.

## 15. Confirmation

No telephone call was placed at any point this session. Phase E's historical records (campaign `b0de9fae-e9bf-4746-b916-04101cc4dae6`, call `45237051-9843-42e6-bfbd-f7d7fbda6c82`) were read-only verified and remain unmutated. The migration was applied directly from this session (not blocked, unlike Session 12.5's). No synthetic database records were created or needed to be cleaned up — all verification used either deterministic fixtures or a browser session that never submitted the form.
