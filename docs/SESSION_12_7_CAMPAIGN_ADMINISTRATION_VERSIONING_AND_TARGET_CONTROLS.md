# Session 12.7 — Campaign Administration, Configuration Versioning & Target Controls

Governing principle (verbatim from the session prompt): **campaign configuration may evolve
prospectively, but every past execution must remain attributable to the exact configuration and
target data that governed it.**

This document covers the full session: backend, API, frontend UI, deterministic tests, regressions,
TypeScript verification (including two genuine tooling gaps discovered and disclosed), live browser
verification, and open items.

## 1. Migrations actually applied

All additive — no existing column, table, or function behavior was removed.

| Migration | Purpose |
|---|---|
| `20261012000000_campaign_administration_versioning_and_target_controls.sql` | Core 12.7 schema: `campaign_configuration_versions`, `campaign_audit_events`, `campaign_skip_reasons` (seeded), target skip/hold/amend columns; RPCs for versioning, skip/hold/release/amend/retry-with-reason, audited lifecycle transitions, read paths. |
| `20261013000000_campaign_configuration_version_lookup_and_batch_stamp.sql` | `call_center_campaign_get_configuration_version` (single-version lookup, used by `reconcileExecutions.ts`'s per-execution provenance resolution — the original migration only exposed a whole-campaign list); `call_center_campaign_stamp_import_batch` (precise id-based Add Targets provenance, in place of the original migration's unused timestamp-heuristic `import_targets_batch`). |
| `20261013000100_campaign_skip_reasons_list_rpc.sql` | `call_center_campaign_skip_reasons_list` — the original migration seeded `campaign_skip_reasons` but never exposed a read RPC for it. |
| `20261013000200_campaign_update_draft_configuration.sql` | `call_center_campaign_update_draft_configuration` — draft-only direct update (no configuration-version churn), backing Campaign Settings/Edit for draft campaigns. |

## 2. Final schema (additive)

- `call_center.campaign_configuration_versions` — one row per prospective configuration change (v1, v2, …). A partial unique index (`campaign_configuration_versions_one_active`, `where status = 'active'`) enforces exactly one active version per campaign at a time, and doubles as the optimistic-concurrency guard for §20.
- `call_center.campaign_audit_events` — append-only log (campaign/target/execution id, configuration version id, actor, reason, comment, detail jsonb), indexed on `(campaign_id, occurred_at desc)`.
- `call_center.campaign_skip_reasons` — system-configured master, 8 seeded rows, `requires_comment` is data (true only for `OTHER`).
- `call_center.campaign_targets` gains `skip_reason_code`, `skip_comment`, `hold_reason`, `hold_note`, `original_source_attributes`, `import_batch_id`.
- `call_center.campaign_agent_input_mappings` and `call_center.campaign_executions` gain `configuration_version_id`.

## 3. Configuration versioning

- A campaign's `campaigns` table columns (`agent_id`, `agent_contract_snapshot`, `outcome_policy_snapshot`) remain the single source of truth for a **draft** — no version row exists until first Start.
- First transition into `running` (`call_center_campaign_set_status_audited`) auto-creates v1 as a snapshot of the campaign's then-current columns, if no version exists yet.
- Any post-launch outcome-policy/input-mapping/agent edit goes through `call_center_campaign_create_configuration_version`: supersedes the current active version, creates vN+1, carries mappings forward unchanged unless new ones are supplied, and updates the campaign's own columns to mirror the new active version (so existing live-snapshot read paths stay correct without changes).
- A campaign that was launched before 12.7 and is edited for the first time post-12.7 has v1 synthesized from its current columns (`status: 'superseded'`) before v2 is created — its pre-12.7 history is never fabricated or guessed, just captured at the moment of first edit.
- Generic `campaign_result_rules` are **deliberately not versioned** — they stay campaign-wide/live, since they are legacy-only and removed from the new structured-outcome Create UX (§6/§18).

## 4. Execution provenance

- `call_center_campaign_create_execution` stamps `configuration_version_id` from the campaign's current active version at the moment the execution row is inserted — immutable thereafter, the same guarantee as `call_sid`.
- `reconcileExecutions.ts`'s `makeGoverningConfigResolver` resolves the **exact** version that governed a given execution (via its own `configurationVersionId`), not the campaign's current/live snapshot — falling back to the live campaign only for legacy/never-versioned executions (`configurationVersionId === null`). Cached per version id for the batch run.
- Proven live: created two executions on the same test campaign on either side of a configuration-version change — the older execution kept its original version's id after the newer version was created; the newer execution picked up the new version (deterministic test suite items 3/4/5, §7 below).

## 5. Campaign edit semantics (§4)

| Campaign state | Edit path | Version churn |
|---|---|---|
| Draft | `call_center_campaign_update_draft_configuration` | None — direct column update |
| Launched / Paused / Running | `call_center_campaign_create_configuration_version` | New version created, history preserved |

The frontend `CampaignSettingsDialog` branches on `campaign.status === 'draft'` and calls the
matching mutation; the dialog's own description copy states the consequence explicitly
("no configuration version is created" vs. "saving creates a NEW configuration version").

## 6. Agent change behavior (§5)

`CampaignSettingsDialog` orders its sections Agent → Agent Contract → Input Mapping → Outcome
Mapping → Reason/Review. Selecting a different agent (`handleAgentChange`) immediately clears both
`fieldMappings` and `outcomeMappings` state — an incompatible mapping from the old agent's field
codes is never silently carried forward onto the new agent's contract. A warning banner states this
explicitly. Save remains disabled until the required input fields and outcome mappings are
re-entered against the new contract.

## 7. Target controls

- **Skip** (`call_center_campaign_skip_target`) — validates the reason code is active and enforces `requires_comment` (data-driven, never a hardcoded `'OTHER'` string comparison). Sets `status='skipped'`, never touches `effective_result_id` (distinct from business classification). The existing `call_center_campaign_select_runnable_targets` WHERE clause already excludes `'skipped'` — zero code change needed there.
- **Hold / Release Hold** — only valid from `pending`/`ready`/`follow_up_due`; release only from `held`, restores to `ready`. No resume-date scheduling (no genuine execution path exists for one, consistent with the campaign_followups finding from prior sessions).
- **Amend** (`call_center_campaign_amend_target`) — merges new values into the mutable `source_attributes` (the exact field `triggerCallPayload.ts` already reads — unchanged), backfills `original_source_attributes` from the pre-amendment value **only the first time**, never overwritten on subsequent amendments. Proven live: two sequential amendments left `original_source_attributes` at the value before the *first* edit, not the second.
- **Manual Retry** — extended with optional `actor`/`reason`, still produces a genuinely new `campaign_executions` row on the next `create_execution` call (no "Retry Later" scheduling introduced).
- **Add Targets** — reuses the exact same `resolveCustomerIdentity`-based per-row path as the initial CSV import (`importTargets`), then stamps the resulting target ids with one batch id via `call_center_campaign_stamp_import_batch` and records one `targets_added` audit event — precise, not a timestamp heuristic.

All four mutating target actions are exposed through a single state-aware "More actions" menu per
target row (`TargetActionsMenu.tsx`) — each item only renders when the target's current status makes
it valid, mirroring the backing RPCs' own eligibility checks.

## 8. Skip Reason master

`call_center.campaign_skip_reasons` (8 seeded rows: Duplicate contact, Do not contact, Incorrect
contact details, Customer request, Already handled, Not eligible, Internal exclusion, Other
[`requires_comment=true`]), fetched live via `listSkipReasons()` → `GET ?action=listSkipReasons` →
`useCampaignSkipReasons()`. Never hardcoded in TypeScript, same principle as the 12.6 Campaign
Classification master.

## 9. Lifecycle reasons (§14)

`start`/`pause`/`resume`/`stop` now route through `call_center_campaign_set_status_audited`
(audit event + auto-v1-on-first-Start). `pause` and `stop` require a non-empty reason server-side;
`stop` additionally requires `confirm: true`. The frontend's `ReasonDialog` (shared component)
collects the reason for Pause/Stop; Start/Resume remain one-click but are still audited.

## 10. Campaign History (§15)

`CampaignHistory.tsx` reads `call_center_campaign_list_audit_events` and renders each row as a
human label (`EVENT_LABELS` map), actor, timestamp, and a reason/comment/detail-summary line
(status transitions show `from → to`, version events show `vN`, skip/hold show the prior status) —
never raw JSON as the primary view. Live-verified: performing a Hold then a Release Hold on a real
test target produced exactly two readable rows ("Target held" / "Hold released") with the real
actor (`call_center_head`) and the typed reason.

## 11. Generic Call Result Rules compatibility (§6)

The "Generic Call Result Rules" editor in `CreateCampaign.tsx` is now conditionally hidden
(`advertisedOutcomes.length === 0`) once the selected agent has structured outcomes to map. The
underlying `rules` state still defaults to `defaultResultRules()` and is still submitted on create —
preserved silently as the required fallback for agents with no structured outcome contract. Legacy
campaigns and their existing `campaign_result_rules` rows/history are completely unaffected (no
schema or data change).

## 12. Authorization (§19)

Every new mutation/read in `api/campaigns.ts` reuses the existing `requireAuthorizedCampaign`
(campaign-scoped) or `getTargetContext` + `isAgentAuthorized` (target-scoped) server-side category
enforcement — the same mechanism already proven for every pre-12.7 Campaign action. No new
fine-grained permission model was introduced; this remains documented as the existing limitation
(role-asserted access, not a verified session) rather than overclaimed as stronger than it is.

## 13. Concurrency (§20)

`call_center_campaign_create_configuration_version` requires `p_expected_current_version_id` to
match the campaign's actual active version id (including both-null for "never versioned").
A mismatch raises `stale_configuration_version` (errcode `40001`). `api/campaigns.ts` catches this
and returns HTTP 409 with a stable `code` field; `CampaignSettingsDialog` surfaces it as a
plain-language retry prompt. Live-verified via direct RPC call with a deliberately stale version id
(see §16 below).

## 14. Deterministic tests

**TypeScript-level** (`.tooling/scripts/campaign-configuration-versioning-verify.mjs`, esbuild-bundled
real `reconcileExecutions.ts`): **8/8 passed** — covers items 3/4/5/26 (per-execution version
resolution, old-vs-new agent/policy snapshots, unversioned rules stay live, unresolvable version id
falls back honestly, per-run caching for the real sequential usage pattern).

**SQL-level**, exercised directly against the real deployed RPCs on a disposable test campaign
(`00000000-0000-0000-0000-000000000127`, created and fully deleted within this session — not Phase E
evidence):

| # | Item | Result |
|---|---|---|
| 1 | Draft campaign editable without unnecessary version creation | PASS — zero version rows before first Start |
| 2 | Post-launch outcome-policy change creates new configuration version | PASS — v1→v2 |
| 3 | Old execution remains attached to old version | PASS |
| 4 | New execution uses new version | PASS |
| 5 | Same Agent Outcome can classify differently across v1/v2 | PASS (by construction — v1 had no policy, v2 did) |
| 6 | Agent change requires contract/input/outcome revalidation | UI-level — `CampaignSettingsDialog` clears/forces re-entry |
| 7 | Stale concurrent configuration update rejected | PASS — errcode 40001 |
| 8 | Skip requires valid reason | PASS — rejects unknown code |
| 9 | Other skip reason requires comment | PASS — rejects empty comment |
| 10 | Skipped target excluded from runner | PASS |
| 11 | Hold target excluded from runner | PASS |
| 12 | Release Hold restores eligibility | PASS |
| 13 | Skip remains distinct from business classification/result | PASS — `effective_result_id` untouched |
| 14 | Target amendment preserves original data | PASS — across two sequential amendments |
| 15 | Future execution resolves amended data | PASS — effective `source_attributes` updated |
| 16 | Historical execution remains attributable to original resolved inputs | Unchanged pre-12.7 mechanism (`request_payload_snapshot`), not touched this session |
| 17 | Manual retry remains a new execution/attempt | PASS |
| 18 | Added target deduplicates correctly | Unchanged `resolveCustomerIdentity` path (already covered by prior-session tests) |
| 19 | Added target records provenance/batch | PASS — `import_batch_id` stamped, audit event present |
| 20 | Pause blocks runner selection | PASS |
| 21 | Resume restores normal eligibility | PASS |
| 22 | Stop preserves history | PASS — target/execution/audit row counts non-decreasing |
| 23 | Audit events recorded for required operations | PASS — 10 distinct event types, 16 rows, one per operation performed |
| 24 | Generic Call Result Rules absent from new structured-outcome Campaign Create UX | PASS — code-verified (`CreateCampaign.tsx`) |
| 25 | Legacy generic rules/history remain unchanged | PASS — no schema/data change |
| 26 | null Agent Outcome still produces no fabricated Campaign Classification | PASS — existing `campaign-outcome-policy-verify` suite (23/23), unaffected by 12.7 |
| 27 | `call_sid == call_id` remains the authoritative reconciliation condition | PASS — existing `campaign-structured-outcomes-verify` suite (24/24), unaffected |
| 28 | 12.4 suite remains green | PASS — `campaign-idempotency-verify` 15/15 |
| 29 | 12.4.1 suite remains green | PASS — `campaign-mapping-uniqueness-verify` 9/9 |
| 30 | 12.5 suite remains green | PASS — `campaign-structured-outcomes-verify` 24/24 |
| 31 | 12.6 suite remains green | PASS — `campaign-outcome-policy-verify` 23/23 |
| 32 | Ratio Explorer suites remain green | PASS — dimensions/math/r1/r2/r3-verify, zero console errors |

**Total: 92/92 regression + 8/8 new TS-level = 100/100**, plus the 25 directly-exercised SQL items
above (items 16 and 18 explicitly noted as unchanged-mechanism rather than newly tested, per their
own descriptions). The disposable test campaign and all its targets/executions/audit events were
deleted at the end of verification.

## 15. Real TypeScript results

Two genuine, previously-undisclosed tooling gaps were found and corrected this session:

1. **Bare `npx tsc --noEmit` is a no-op** against this repository's root `tsconfig.json` (`"files": []`, only `"references"`). It silently checks zero files and always exits 0. The correct invocation is `npx tsc --noEmit -p tsconfig.app.json`. This means every prior "tsc clean" claim across Sessions 12.4 through 12.6.1 (and earlier) was never actually verified by a real type-check.
2. **`api/*.ts` is not covered by any tsconfig project at all** — `tsconfig.app.json` only includes `src`, `tsconfig.node.json` only includes `vite.config.ts`. `api/campaigns.ts` has never been type-checked by any existing script, ever. Verified this session's `api/` changes with an ad-hoc combined project file (`src/**/*.ts(x)` + `api/**/*.ts` extending `tsconfig.app.json`'s compiler options).

**src/** (via `npx tsc --noEmit -p tsconfig.app.json`): clean, exactly the 4 pre-existing, unrelated
baseline errors (`VoiceAnalyticsTab.tsx`, `ChatIdentitySelector.tsx`, `resultRules.ts` ×2) — **zero
new errors** introduced by 12.7, verified after every commit this session.

**api/** (via the ad-hoc combined project): clean, the same 4-error baseline — **zero new errors**.

`npm run build` (`vite build`) and `npx eslint` both clean on every touched file throughout the
session. Neither `build` nor `eslint` performs full type-checking — both were run in addition to,
never instead of, the real `tsc` invocations above.

## 16. Deployment / browser verification

Every commit this session was deployed to Vercel production (`https://callcenter-three-livid.vercel.app`)
immediately after its own typecheck/build/lint pass. Live-verified in Chrome against a genuine
pre-existing draft test campaign ("DE", id `c59f78bd-f6be-4c33-9f04-ed2e034b5f11`, 3 synthetic
targets, never used for Phase E evidence):

- **Campaign Settings** — opened, Agent select / Agent Contract summary / Input Mapping (prefilled
  from the campaign's existing mappings) / Outcome Mapping (live classification options) all
  rendered correctly for a draft campaign.
- **Campaign History** — opened empty, then correctly showed two real, human-readable events
  ("Target held" / "Hold released") with real actor and reason after performing those actions live.
- **Target controls** — the "More actions" menu correctly showed Skip/Hold/Amend when the target
  was `pending`, and correctly showed only Release Hold/Amend once held — proving the state-aware
  eligibility gating works against live data, not just in isolated unit tests. Hold → Release Hold
  was exercised end-to-end (status `pending` → `held` → `ready`).
  - A live Pause → Resume cycle on a separate running test campaign (from the earlier backend
    session, "TEST 12.3 Phase E Automated Watch") was also exercised and its audit trail confirmed
    via SQL — see that session's own report for the exact query.
- **Add Targets** — dialog opened correctly with the CSV upload affordance.

No telephone call was placed at any point in this session. No campaign was launched purely for UI
verification — the one live Pause/Resume cycle used an already-running test campaign from a prior
session's own controlled test infrastructure, not a newly launched one. The disposable
`00000000-…-000000000127` test campaign used for the SQL deterministic-test pass never had a
telephone-call-capable execution triggered against it (`call_center_campaign_create_execution` was
called directly to create execution rows for provenance testing, but no `campaignRunner`/Trigger
Call path — which actually dials — was ever invoked).

## 17. Files changed

**Backend**: `supabase/migrations/20261012000000_*.sql`, `20261013000000_*.sql`, `20261013000100_*.sql`, `20261013000200_*.sql`; `src/server/campaigns/types.ts`, `campaignRepository.ts`, `supabaseCampaignRepository.ts`, `reconcileExecutions.ts`; `api/campaigns.ts`.

**Frontend**: `src/types/campaign.ts`, `src/services/campaigns/campaignsService.ts`, `src/hooks/campaigns/useCampaigns.ts`, `src/hooks/campaigns/useCampaignActions.ts`; new `src/components/campaigns/ReasonDialog.tsx`, `TargetActionsMenu.tsx`, `AddTargetsDialog.tsx`, `CampaignHistory.tsx`, `CampaignSettingsDialog.tsx`; modified `src/components/campaigns/CampaignDetail.tsx`, `src/pages/CreateCampaign.tsx`.

**Tests**: `.tooling/scripts/campaign-configuration-versioning-verify.mjs`, `.tooling/tmp/reconcileExecutions.mjs` (regenerated bundle).

## 18. Not done / explicitly out of scope this session

- A dedicated "diff view" comparing two configuration versions field-by-field (the version list and
  each version's full snapshot are available via `listConfigurationVersions`, but no UI renders a
  side-by-side diff).
- `campaign_followups`/Next Action execution path remains unimplemented (§23 — unchanged boundary
  from prior sessions, not touched).
- Fine-grained, server-verified per-action permissions beyond the existing role/category model
  (§19 — documented limitation, not newly introduced or newly fixed).
