# Session 16.5 — Corrective Action Management (CAM)

Status at the end of this session: **implemented and locally verified (typecheck + full deterministic suite green); migration NOT applied, NOT committed, NOT pushed, NOT deployed, per this session's explicit stop conditions.** Everything below describes what exists in the working tree, pending review and approval.

## 1. Architecture

Corrective Action Management is a standalone operational capability with its own Supabase tables, RPCs, and `/api/admin?resource=correctiveActions` surface — it does **not** live inside, or depend on, the Automated QA or Human QA domains. QA is the first *source*, wired in at the thinnest possible seam:

```
Any source (manual UI, Automated QA Inspector today;
Interaction Trace / Campaign Ops / monitoring / complaints tomorrow)
        │
        ▼  builds a plain, normalized object
CreateCorrectiveActionInput { title, description, category, priority,
                               sourceType?, sourceReferenceId?, sourceContext? }
        │
        ▼  one call, no source-specific knowledge beyond this point
createCorrectiveAction(input)   — src/services/correctiveActions/correctiveActionsService.ts
        │
        ▼
POST /api/admin?resource=correctiveActions&action=create   — api/admin.ts
        │
        ▼
call_center_corrective_actions_create(p_input, p_actor_user_id, p_idempotency_key)  — Postgres RPC
```

`api/admin.ts`'s new handlers have zero QA-specific code: no `evaluationId`/`reviewId` parsing, no parameter-code validation, nothing. The only place QA-specific mapping exists is `src/services/correctiveActions/qaAdapter.ts` (see §11) — delete that one file and CAM still fully works for manual creation.

New files:
- `supabase/migrations/20261022000000_corrective_action_management.sql`
- `src/services/correctiveActions/correctiveActionsService.ts` (generic CA Core client)
- `src/services/correctiveActions/qaAdapter.ts` (QA source adapter — the only QA-aware file)
- `src/hooks/correctiveActions/useCorrectiveActions.ts`
- `src/components/correctiveActions/correctiveActionStatus.tsx`, `CreateCorrectiveActionDialog.tsx`, `CorrectiveActionDetailDialog.tsx`, `CorrectiveActionGroupDialog.tsx`
- `src/pages/CorrectiveActions.tsx` (register, route `/corrective-actions`)
- `.tooling/scripts/corrective-actions-verify.mjs`

Modified files: `api/admin.ts` (new `resource=correctiveActions` branch), `src/App.tsx` (route), `src/components/layout/pillarNav.ts` (nav entry, Improve pillar), `src/pages/AutomatedQaInspector.tsx` (one "Create Corrective Action" button on a selected finding), `package.json` (wired the new verify script into `verify:full`), `.tooling/tmp/adminRoute.mjs` (regenerated esbuild fixture).

## 2. Source-independent CA model

Three domain concepts, exactly as specified:

- **`call_center.corrective_actions`** — the individual unit of work. `source_type` (`manual` | `automated_qa_observation` | `human_qa_finding`, extensible by adding a value to the check constraint — no other schema change needed for a brand-new source), `source_reference_id` (plain, optional, un-FK'd text pointer — never required), `source_context` (small jsonb, capped at 4000 bytes, object-shaped only — a bounded correlation payload, never a transcript dump). `agent_id` is a nullable snapshot used only for Business Data Scope filtering (no agent_id ⇒ visible to everyone in scope, same rule Session 15's `action_items` uses).
- **`call_center.corrective_action_groups`** — the shared-correction container: `root_cause`, `proposed_correction`, `implemented_correction`, `assigned_investigator/fixer/verifier`, its own `status`.
- **`call_center.corrective_action_activities`** — append-only; every mutating RPC writes exactly one (or two, for a verification that also closes) row here. Never updated or deleted.
- **`call_center.corrective_action_verifications`** — one row per recorded test result, individually traceable even when produced by a bulk operation (`group_id` tags which bulk run produced it, purely informational).

A manually created CA has `source_type='manual'`, `source_reference_id=null`, `source_context=null`, `agent_id=null` — fully valid, verified by the `title_and_description_required`-only validation in `call_center_corrective_actions_create` (nothing else is mandatory).

## 3. Creation API and service boundary

`call_center_corrective_actions_create(p_input jsonb, p_actor_user_id uuid, p_idempotency_key text)` is the single generic entry point. `created_by` is **always** `p_actor_user_id`, resolved server-side from the authenticated session (`requirePermission` in `api/admin.ts`) — the client-supplied body is never trusted for identity. Idempotency: an optional caller-supplied key (unique-indexed, partial index so `null` never collides) — a repeated submission with the same key returns the existing row instead of inserting a duplicate. The QA adapter uses `automated_qa_observation:<observationId>` / `human_qa_finding:<findingId>` as its key, so re-opening the same finding's "Create Corrective Action" button twice never creates two CAs.

A future UI module creates a CA with the exact same call a manual "New Corrective Action" button makes:

```ts
import { createCorrectiveAction } from '@/services/correctiveActions/correctiveActionsService';

await createCorrectiveAction({
  title: 'Outbound campaign sent wrong script variant',
  description: 'Campaign X dialled 40 customers with the deprecated script after a config rollback.',
  category: 'campaign_configuration',
  priority: 'high',
  sourceType: 'manual', // or a new source type added later, e.g. 'campaign_operations_alert'
  sourceReferenceId: campaignRunId,
  sourceContext: { campaignId, runId: campaignRunId },
  idempotencyKey: `campaign_run_alert:${campaignRunId}`,
});
```

No CA Core file changes for this — it is literally the function signature every other source already uses.

## 4. Individual CA lifecycle

```
open ──────────────► in_progress ──────► pending_verification ──► closed
  │                      │                       │  ▲                │
  └──────► cancelled ◄───┘ ◄─────────────────────┘  │                ▼
                                                      │           reopened ──► in_progress / cancelled
                                            (sent back for more work)
```

Centrally enforced in `call_center_corrective_action_transition_allowed(from, to)` — a single lookup table, never a UI-disabled-button-only check. `pending_verification → closed` is the **administrative disposition** path only (requires `corrective_actions.assign` AND a reason) — ordinary verified closure goes through the dedicated verification RPC instead (§7), which requires an actual recorded test result. Cancellation always requires a non-empty reason regardless of the originating state.

## 5. Group linking

- A CA may belong to **at most one** group at a time (`corrective_actions.group_id`); `call_center_corrective_action_groups_link` validates every candidate id (exists, in scope, not already in a *different* group) **before writing anything** — if any one id fails, the whole call aborts and nothing is linked (true transactionality, not partial-success-with-a-report).
- Unlinking never deletes the CA or rewrites its own description/evidence — only clears `group_id` and logs an `unlinked` activity.
- Cross-tenant linking is rejected via the same Business Data Scope predicate used for list/get (`call_center_corrective_action_in_scope`).

## 6. Resolution workflow

`call_center_corrective_actions_record_correction` stores `resolution_summary` + `resolved_at` and logs a `correction_recorded` activity. It **never** changes `status` — a fixer can record what they did any number of times while the CA is still `in_progress`; moving to `pending_verification` is a separate, explicit `set_status` call.

## 7. Verification and bulk closure

`call_center_corrective_action_verify_one` is the single code path both the individual-verify RPC and the bulk-verify RPC call — there is no second, divergent bulk implementation. A `passed` result closes that one CA (`closed_at`, `verified_at` set, `closed` activity logged); a `failed` result **never** closes it — the CA stays exactly where it was (`pending_verification` or `in_progress`) so a human decides the next step. `call_center_corrective_actions_bulk_verify` loops over the selected ids, re-validates scope for each one individually, and calls the exact same single-item function per id inside its own sub-transaction (`begin...exception when others`) — one id's failure never aborts the others, and the response reports `{results: [{id, success, error?}], succeeded, failed}` so the caller sees exactly which selected CAs actually closed and which didn't.

## 8. Authorization

Eight new permission keys (pillar `Improve`), all additive to the 14.1 seed:

| Key | Covers |
|---|---|
| `corrective_actions.view` | List/detail, scope-filtered |
| `corrective_actions.create` | Manual or QA-originated creation |
| `corrective_actions.edit` | Title/description/category/priority/due-date edits |
| `corrective_actions.assign` | **Manage-any** — assign/reassign anyone, edit/progress/verify/close any in-scope CA or group regardless of ownership |
| `corrective_actions.link` | Create/update groups, link/unlink members |
| `corrective_actions.resolve` | Record corrective work; take ownership of an unassigned CA |
| `corrective_actions.verify` | Record verification outcomes, close eligible CAs (individually or bulk) |
| `corrective_actions.reopen_cancel` | Reopen a closed CA, or cancel (with a reason) |

Initial grants: `administrator`/`supervisor` get all eight; `operator` gets view/create/resolve; `qa_reviewer` gets view/create (so a QA screen can raise a CA); `analyst` gets view only; `read_only` gets none.

**Ownership model (the one design decision made without re-asking, documented explicitly per this session's §3 instruction to flag ambiguity rather than silently resolve it):** `corrective_actions.assign` is the single "manage any eligible item" signal, mirroring Session 15's `action_items` precedent exactly. An actor holding only `.resolve` may self-assign an **unassigned** CA and then progress/record-correction only on a CA assigned to themselves. An actor holding only `.verify` may record a verification only if they are the already-designated verifier, or if the verifier slot is empty (self-assign-as-verifier, same shape as take-ownership). Every ownership check is re-validated **inside** the RPC from `p_actor_has_manage_any` (computed server-side from the caller's resolved permission set) — never trusted from the client, never a role-name check. Tenant/scope isolation reuses the existing Agent Scope tables (`role_agent_scope`/`role_agent_scope_items`) exactly as Session 15 established; a CA with no `agent_id` (the normal case for a manually created CA) is visible to everyone in Business Data Scope.

## 9. Persistence schema

See `supabase/migrations/20261022000000_corrective_action_management.sql` in full. Summary: 4 tables (`corrective_actions`, `corrective_action_groups`, `corrective_action_activities`, `corrective_action_verifications`), all `uuid` PK, deny-all RLS (no policies — every access path is a `security definer` RPC, same convention as every table in this schema), 18 RPCs under `public.call_center_corrective_action*`, granted to `service_role` only via the same wildcard revoke/grant pattern Session 16.4.4 used. `pg_trgm` is enabled (idempotent `create extension if not exists`) to support title/description text search without a separate search engine.

**Migration status: prepared, NOT applied** (this session's stop condition forbids automatic application). Applying it is a prerequisite for every write path and for real browser verification — see §14/§15.

## 10. UI / navigation

- **Register** — `src/pages/CorrectiveActions.tsx`, route `/corrective-actions`, nav entry under **Improve** (`src/components/layout/pillarNav.ts`) per the brief's stated preference. Status tabs, search, priority/category filters, row checkboxes + "Create Group from Selection" bulk action, "New Corrective Action" button (gated by `corrective_actions.create`).
- **Detail** — `CorrectiveActionDetailDialog.tsx`: identity/source/evidence references, assignment (assignee + verifier), ownership-aware investigation/correction controls, verification recording, reopen/cancel, and a read-only activity-history feed. Every action is additionally re-enforced server-side regardless of what this dialog decides to render.
- **Group workspace** — `CorrectiveActionGroupDialog.tsx`: shared root-cause/proposed/implemented-correction fields, linked-member list with per-row unlink and status, bulk-verification panel (selects only members currently eligible — `pending_verification`/`in_progress` — and calls the same bulk-verify RPC as §7), group activity feed.
- **Navigation loop** — Register → row click → Detail dialog → "Open group" → Group dialog → member row click → Detail dialog (closing the group dialog first) → and the register itself is always reachable via the sidebar. No dead ends.
- **QA adapter entry point** — Automated QA Inspector's "Selected Finding" panel (`src/pages/AutomatedQaInspector.tsx`) gained one button, "Create Corrective Action", visible only with `corrective_actions.create`, which opens `CreateCorrectiveActionDialog` pre-filled by `buildCorrectiveActionInputFromAutomatedQaObservation`.

## 11. QA adapters

`src/services/correctiveActions/qaAdapter.ts` is the only file in this feature with QA-specific knowledge:

- `buildCorrectiveActionInputFromAutomatedQaObservation(observation, context)` — wired into the UI this session. Reads an `AutomatedQaObservation` (parameter code, value, explanation, reason code, primary/evidence turn ids) and the evaluation's `interactionId`/`channel`/`agentId`, and returns a plain `CreateCorrectiveActionInput` with `sourceType: 'automated_qa_observation'`, `sourceReferenceId` = the observation's own stable id, and a small `sourceContext` carrying only correlation fields (never a copied transcript). Idempotency key is `automated_qa_observation:<id>`.
- `buildCorrectiveActionInputFromHumanQaFinding(finding, context)` — implemented and exported this session for the **generic API path** (same shape, `sourceType: 'human_qa_finding'`, reference = the `qa_findings.id`), but **not yet wired into a UI button** — Human QA's finding-detail surface (inside the turn-by-turn review flow) is organized differently from Automated QA's and wiring a button there safely needs its own small pass to avoid disturbing the blind-review requirement (brief §17/§18 elsewhere in this codebase is explicit that Human QA review surfaces must stay carefully isolated). This is recorded as a known limitation (§16), not a silent omission.
- Deliberately absent: nothing in either adapter is reachable for a `contradictory_applicability` evaluator diagnostic failure — only a genuine, real observation the evaluator actually produced can become a CA, and only via the explicit button click (no automatic generation anywhere in this session's code).

## 12. Central UI compliance

- Status/priority presentation reuses the five existing `color.semantic.*` Badge variants (`escalated`/`warning`/`positive`/`pending`/`neutral`) — **no schema change, no new hardcoded color** (`src/components/correctiveActions/correctiveActionStatus.tsx`). `reopened` reuses `escalated` (a CA that passed through closure and needs attention again — the same semantic class Dashboard/Action Required already use for "needs attention"); `pending_verification` reuses `warning`; `closed` reuses `positive`; `cancelled` reuses `neutral`; `open` reuses `pending`; `in_progress` reuses the plain `secondary` variant, matching Action Required's own choice for the same state.
- All typography goes through `src/lib/typography.ts` tokens (`typography.pageTitle`, `.pageDescription`, `.bodyMuted`, etc.) — no local font-size/weight literals.
- Table/row/dialog geometry reuses existing shared classes (`rounded-md border border-border bg-card`, `SectionCard`, `Dialog`/`DialogContent`) — no new local dialog dimensions, border radii, or shadows.
- No customer-name conditionals anywhere in the new TSX; every component works unmodified under both VoiceForce and KATON since it only ever renders CSS-variable-backed tokens and shared primitives.
- Viewport framing on the register page follows the established Pattern A convention (root `h-full min-h-0 flex flex-col`, header/filter row `flex-shrink-0`, the row list is the single `flex-1 min-h-0 overflow-auto` region) — the same recipe `ActionRequired.tsx`/`CallLogs.tsx` use.

## 13. Automated test results

```
npm run typecheck   → clean (tsconfig.app.json, tsconfig.node.json, tsconfig.api.json)
npm run verify:full → all suites 0 failed; new suite:
  .tooling/scripts/corrective-actions-verify.mjs — 24/24 passed
```

The new suite covers the pure, synchronous TypeScript this session added to `api/admin.ts` — every `mapCorrectiveActionError` code path (404/403/422/500, including substring-matching a wrapped Postgres error message) and `toCorrectiveActionScopeArgs`'s Business Data Scope derivation (unrestricted-by-either-dimension, restricted-with-real-ids, restricted-with-no-ids). This mirrors exactly how Session 15's `action-items-verify.mjs` covers `mapActionItemError`/`toActionScopeArgs` — ownership, idempotency, transition, and linking enforcement all live in the Postgres RPCs, which cannot be exercised without a live database. The lifecycle/linking/bulk-operation/source-independence/regression checklist items from the brief's §17 A–G are therefore **prepared as SQL-level verification steps** (§15 below) rather than as a `*-verify.mjs` suite, consistent with how Session 15 documented the identical constraint.

Full regression confirmed: every pre-existing suite in `verify:full` (Automated QA evaluator/attempt-diagnostics/validation, Human QA, Action Required, RBAC/authorization, campaigns, ratios, interaction trace, theme/CSS generation, etc.) still passes unchanged — nothing in this session touched any QA scoring/contract/prompt code, any existing authorization logic, or any existing route.

## 14. Browser verification

**NOT VERIFIED.** The migration has not been applied, so every `resource=correctiveActions` RPC call would fail at the database layer. Per this session's explicit instruction ("if migration has not been applied and real persistence cannot be exercised, mark these checks NOT VERIFIED — do not substitute mock-data screenshots"), none of the 18 browser-check items in the brief's §18 were attempted. What *is* confirmed instead:

- The app builds and typechecks with the new route, nav entry, and components present (`npm run verify` inside `verify:full`).
- The register/detail/group components correctly handle a failed fetch today (the existing `isError`/"Retry" pattern reused from `ActionRequired.tsx`) — a post-migration smoke test should load cleanly rather than error, and that transition is the first thing to confirm once the migration is applied.

## 15. Migration / deployment requirements

**Blocking dependency: `supabase/migrations/20261022000000_corrective_action_management.sql` must be applied before any of this feature's write paths — or its reads — function.** Recommended post-application SQL-level verification (mirroring how Session 15 and Session 16.4.4 validated their own migrations before activation):

```sql
-- table + FK + RLS + RPC count
select count(*) from information_schema.tables where table_schema='call_center' and table_name like 'corrective_action%';
select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'call_center_corrective_action%';
-- grants: service_role only, matching the existing action_items pattern
select grantee from information_schema.role_routine_grants where routine_name = 'call_center_corrective_actions_create';
```

No application-code deployment is required beyond the normal `vercel --prod` build — the new resource lives inside the existing `api/admin.ts` function, so the serverless-function count stays unchanged (still within the 12-function Hobby-plan ceiling).

## 16. Remaining limitations

- Human QA finding → CA creation has a working generic adapter function (§11) but no UI button yet — documented, not silently skipped.
- `call_center_corrective_actions_candidates` (the "discover related CAs" search, brief §8) matches on agent/category/QA-parameter-code only; it is a filter/suggestion mechanism only, never an automatic link, as required — but it has no UI surface yet beyond the API itself (the register's filters cover status/priority/category/source/assignee/group/search/date implicitly via `createdAt` ordering; a dedicated "Find related" button inside the detail dialog was not built this session due to scope/time, and is a natural, small follow-up).
- No due-date reminder/notification mechanism exists (not requested).
- Group `status` and individual CA `status` are independent fields — a group reaching `closed` does **not** auto-close its members (by design, per brief §10B — "do not allow a group status change to bypass individual CA transition rules"); this is a deliberate asymmetry, not an oversight.
- Browser verification is pending migration application (§14).

## 17. Future source integration procedure

1. Write a new adapter file under `src/services/correctiveActions/<sourceName>Adapter.ts`, exporting a `build CorrectiveActionInputFrom<Source>(...)` function that returns a plain `CreateCorrectiveActionInput` (same shape every other source uses) — see `qaAdapter.ts` as the reference implementation.
2. If the new source needs a new `source_type` value, add it to the single check constraint in `corrective_actions.source_type` (the only schema touch point) — no RPC changes needed, since `call_center_corrective_actions_create` already accepts any string here.
3. Call `createCorrectiveAction(input)` from wherever the new source's UI (or server-side job) decides a CA is warranted — `idempotencyKey` should be a stable string derived from the source's own natural id so repeated triggers never duplicate.
4. Do not touch `correctiveActionsService.ts`, the migration's RPCs, or `api/admin.ts`'s `resource=correctiveActions` handlers — none of them should ever need to know the new source exists.
