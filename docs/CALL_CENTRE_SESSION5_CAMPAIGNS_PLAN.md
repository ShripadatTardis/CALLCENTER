# Session 5 — Outbound Campaigns: Plan

**Status:** proposed, not yet approved. No code has been written for this session.
**Scope:** replace the current 100%-mock Outbound Campaigns module with a real
operational campaign control plane, built on Customer 360 (Session 4) and reusing the
already-live Trigger Call / Call Data / transcript-recording mechanisms (Sessions
1-3.5). **Explicitly not in scope:** inbound routing, queues, WFM, predictive dialer
algorithms, complex retry optimization, agent staffing, QA scoring, an Analytics
redesign, a Reports redesign, WhatsApp campaigns, an NPS redesign, a full workflow
designer, or any LLM-based result classification.

---

## 1. Audit: current Outbound Campaigns code/UI/mock data

Every screen and every value is fabricated — there is no real API call, no persistence,
and (for two actions) the UI actively lies about having done something.

**Files:** `src/pages/OutboundCampaigns.tsx`, `src/pages/CreateCampaign.tsx` (953
lines, a 6-step wizard), `src/components/campaigns/{CampaignOverviewStats,
CampaignFilters, CampaignGrid, CampaignDetail, TranscriptDialog, RecordingDialog,
CreateCampaignDialog}.tsx` (the last is imported but never rendered — dead code).

**Mock data, with exact source:**

| Field | Source | Status |
|---|---|---|
| All campaign records (name, type, status, totals, successRate, dates) | `src/utils/industryCampaignGenerator.ts` — hardcoded literal arrays per industry | 100% fake |
| Campaign contacts (name, mobile, status, actionTaken, duration, transcriptId, recordingId) | `industryCampaignContactGenerator.ts` — same 4 fake contacts regardless of which campaign is opened | 100% fake |
| Transcript dialog content | `industryTranscriptGenerator.ts`, keyed only by industry+name — **no `interactionId`/`session_id` is ever passed in**, so it structurally cannot be a real transcript | 100% fake |
| Recording playback | `RecordingDialog.tsx` — **no `<audio>` element, no URL at all.** A `setInterval` fakes a progress bar; the code comment literally says `// Mock playing functionality` | 100% fake, not even a stub |
| Edit / Duplicate campaign | `console.log(...)`, comment says `// Mock edit/duplicate functionality` | Honest no-op |
| Create Campaign submit | `console.log(formData)` then `navigate(...)` — no API call, no persistence | No-op |
| CSV upload | Decorative drop-zone only — no `<input type="file">`, no `onClick`, no parser anywhere | Not implemented at all |
| "Salesforce" source | `generateIndustrySpecificSalesforceCampaigns` | 100% fake, no real Salesforce integration exists |

**No agent selection exists anywhere in Create Campaign** — a campaign is configured
via `campaignType` + `scriptId` only; there is no `/agents` roster call.
**No Start/Pause/Resume/Stop/Retry action exists anywhere** in `CampaignDetail.tsx`.

## 2. Audit: NPS Campaigns for reusable generic pieces

`src/pages/NPSCampaigns.tsx` + `src/components/nps/*`, data from one shared
`industryDataGenerator.ts` (not a separate module like Outbound has), **regenerated on
every render** (no memoization — values aren't even stable across re-renders).

Two of its three actions are worse than Outbound's honest no-ops: **Play/Pause**
(`NPSCampaigns.tsx:95-98`) and **Delete** (`:100-111`) show a `toast.success(...)`
claiming the action happened, while **never updating any state** — a misleading
no-op, not just an inert one. Flagging this because Session 5 must never repeat this
pattern anywhere: every action either genuinely does something and is auditable, or it
doesn't exist as a button.

**Genuinely reusable (shape only, no shared logic today):** the status-badge
model — both modules independently implement the same `draft/scheduled/running/
completed/paused` → color/label mapping; and the list-table / target-table shape
(search+filter+table, row-per-contact detail). **Not reusable:** NPS's scoring/rating
components and multi-channel targeting are NPS-specific domain concepts with no
Outbound equivalent. **No service or data-layer code is shared between the two
today** — each calls its own generator independently. Per the brief, NPS is **not**
being merged into Outbound Campaigns this session; only the status-badge and
list/target-table *presentational* patterns are worth extracting into a small shared
component (`src/components/campaigns/CampaignStatusBadge.tsx`) — a low-risk, optional
tidy-up, not a shared domain model.

## 3. Confirmed backend capabilities

- **`POST /api/v1/call` (Trigger Call) request already accepts everything a campaign
  runner needs**: `to_phone_number`, `agent_id?`, and — confirmed present today —
  `customer_id?: string` ("Bank CIF/CRM ID, when known", `src/types/api/calls.ts:25`).
  **Never populated by any caller in this codebase yet** (`useInitiateCall.ts` only
  ever sends `{to_phone_number, agent_id}`) — campaigns would be the first real user
  of this field, populating it from Customer 360's `customer.sourceCustomerRef` when
  available (plan §5).
- **Trigger Call's response returns `call_sid`** (`TriggerCallResponseDto:
  {success, call_sid, status}`) — usable immediately as a `GET /api/calls/session/{id}`
  lookup key for a live transcript (confirmed in `docs/CALL_CENTRE_LIVE_INTEGRATION_PLAN.md`).
- **`GET /call-data`'s `CallDataEntryDto` already carries every field the result model
  needs**: `status`, `outcome`, `fcr`, `intent`, `intent_accuracy`, `sentiment`,
  `sentiment_score`, `escalation_trigger`, `tags`, `analysis`
  (`{sentiment_trend, key_topics, resolution_status, confidence_score}`), `context`,
  `campaign_name` (plain string, read-only — see §4), `ai_agent_id`/`agent_id`.
- **The existing transcript/recording mechanism is fully reusable as-is**:
  `InteractionDetailDialog.tsx` + `useInteractionTranscript.ts` + `callsMapper.ts`'s
  `interaction.recording.url` (from `voice_record_url`). A campaign target's
  Transcript/Recording actions should open this **same** dialog once a call is
  reconciled to a real `interactionId` — no new viewer, no duplicated storage (§19).
- **`triggerCall()`** (`src/services/calls/callsService.ts:51-59`) is a plain,
  React-free async function already taking the full request DTO — directly reusable
  by a server-side campaign runner's own backend call (via the same
  `getBackendConfig()`/fetch pattern Customer 360 and Chat's adapters already use),
  not by importing this frontend-only function itself.

## 4. Confirmed backend gaps

1. **`call_sid` (Trigger Call) vs. `call_id` (later `call-data` row) equivalence is
   NOT confirmed anywhere in code or docs.** `callsMapper.ts`'s own comment is explicit:
   *"each mapping function normalizes its own DTO's identifier field independently;
   they are not assumed to always be the same literal value across endpoints."* This
   is the single most important gap for campaign reconciliation (§14) — the plan below
   is designed to tolerate it (treat reconciliation as "pending" until proven), not to
   assume it away.
2. **`TriggerCallRequestDto` has no field to set `campaign_name`** on the request
   side, even though `CallDataEntryDto` returns one on read — there is no confirmed
   mechanism for how a `call-data` row's `campaign_name` gets populated at all
   server-side, and nothing this app can set. **Campaign correlation must never rely
   on `campaign_name`** (amended, §14) — it depends entirely on one of the two
   backend paths in §14 (a request-side correlation field, or confirmed `call_sid`/
   `call_id` equivalence), neither of which is confirmed yet (item 1).
3. **No dedicated campaign backend API exists.** Per the brief's own instruction,
   this plan builds the control plane entirely on the existing Trigger Call endpoint,
   one call per target — never "fake bulk execution."
4. **No scheduler/queue infrastructure exists anywhere in this repo** (confirmed:
   `vercel.json` has no `crons` key; grepped the whole tree for
   cron/scheduler/queue — the only hits are Session 4's `backfillJob.ts`/
   `reconcileJob.ts`, which are themselves plain invokable functions, not a real
   scheduler, and one WhatsApp Edge Function that's an on-demand webhook handler, not
   a scheduled job). The campaign runner (§16) is designed the same way — an
   invokable batch function, never a Vercel Cron product dependency.
5. **No CSV parsing library exists in this repo** (`package.json` has none). A
   minimal, well-tested dependency (`papaparse`, ~20KB) is the practical choice for
   §13's import flow rather than hand-rolling CSV edge cases (quoted fields, embedded
   commas) — flagged as a new dependency requiring confirmation, since this project
   hasn't added one casually before.

## 5. Customer 360-first contact model

Per the brief's rule: **a campaign target always references a `call_center.customers`
row and a `call_center.customer_contact_points` row — never an anonymous CSV row.**
Import flow (detail in §13):

```text
CSV row → normalize phone → search customer_contact_points by (type='phone', normalized_value)
  found → link existing customer/contact point
  not found → create customer + contact point (same repository call Customer 360's
              progressive materialization already uses — plan reuses
              CustomerRepository.createCustomerWithContactPoint, not a new function)
→ create campaign_target referencing customer_id + contact_point_id
```

Campaign-specific attributes (`amount_due`, `due_date`, `offer_code`,
`campaign_segment`, `product`, `reminder_date`, arbitrary source columns) live on
`campaign_targets`, **never** written onto `call_center.customers` — Customer 360
stays domain-neutral master data, campaigns stay campaign-scoped context, exactly
mirroring Session 4's own "keep the model domain-neutral" rule.

## 6. Campaign persistence model

New tables, same schema/access pattern as Customer 360 and Chat (§22): un-exposed
`call_center` schema, `public.call_center_campaign_*` `SECURITY DEFINER` functions,
`service_role`-only grants.

### `call_center.campaigns`
`id, name, description, agent_id (text, from the real /agents roster), status
(draft|scheduled|running|paused|completed|stopped|failed), created_by, created_at,
updated_at, scheduled_start_at, started_at, completed_at, source_meta jsonb`
(audit-only: original filename, row count — never business data).

### `call_center.campaign_targets`
`id, campaign_id, customer_id (references call_center.customers, not null),
contact_point_id (references call_center.customer_contact_points, not null), status
(pending|ready|in_progress|completed|failed|skipped|follow_up_due|closed),
source_attributes jsonb (campaign-specific fields, §5), attempt_count, last_action_at,
next_action_at, effective_result_id (nullable, references
call_center.campaign_results(id) — **amended, per final instruction**: the
deterministically-current business result for this target, distinct from the full,
append-only `campaign_results` history a target may accumulate across retries/
follow-ups, §9; this FK is circular with `campaign_results.campaign_target_id` below,
so the constraint is added via `ALTER TABLE` after both tables exist in the migration,
not inline), created_at, updated_at`.

### `call_center.campaign_executions`
One row per actual dial attempt against a target — supports "multiple calls against
the same target" explicitly. `id, campaign_target_id, sequence, status
(queued|triggering|triggered|failed — **amended, §9**: deliberately limited to the
Trigger Call action's own lifecycle; whether the underlying call *completed* is a
call-data-level fact, learned only via `reconciliation_status` below, never folded
into this column), call_sid,
reconciliation_status (pending|reconciled|unresolved|error — **amended, see §14/§18**:
a distinct state machine from `status` above, never conflated with it),
reconciled_interaction_id (nullable — the call-data call_id, set ONLY when
`reconciliation_status = 'reconciled'` via an authoritative identifier, never a
diagnostic guess, §14), reconciliation_candidate jsonb (nullable — a diagnostic-only
phone/time-window candidate match, if any, shown for human review; NEVER promoted to
`reconciled_interaction_id` automatically, §14), reconciled_at, triggered_at,
error_detail, created_at`.

### `call_center.campaign_result_rules`
Deterministic, editable mapping config per campaign — never an LLM. `id, campaign_id,
priority, match_field (e.g. 'outcome'|'status'|'escalation_trigger'|'intent'),
match_value, result_code, result_label, is_success (boolean, nullable — **amended,
§10**: an explicit success classification, independent of `result_code`'s naming),
next_action_type (retry|follow_up|close|escalate|move_campaign),
next_action_delay_days, active`.

### `call_center.campaign_results`
The first-class result object the brief requires — separate from execution status
**and from reconciliation status** (amended, §9). `id, campaign_execution_id (not
null — "which real call produced that result"; and, by construction, that execution's
`reconciliation_status` must already be `'reconciled'` — see §9), campaign_target_id
(denormalized for query convenience), call_status, call_outcome, intent,
campaign_result_code, campaign_result_label, is_success (boolean, nullable — copied
from the matching `campaign_result_rules` row at derivation time, §10), result_detail
jsonb (e.g. {promised_date: "2026-10-02"}), result_source ('rule_match'|'manual'),
result_recorded_at, next_action text`.

### `call_center.campaign_followups`
`id, campaign_target_id, campaign_result_id (nullable), follow_up_type
(retry|scheduled_contact|move_to_campaign|manual_review), due_at, status
(pending|done|cancelled), next_campaign_id (nullable — campaign chaining, §12),
notes, created_at`.

This directly satisfies every persistence requirement in the brief: Customer 360
linkage (targets), agent identity (campaigns), target-specific attributes
(`source_attributes` jsonb), multiple actions/calls per target (`executions`,
`sequence`), result history (`results`, one row per execution, never overwritten),
result-driven next actions (`followups`), deterministic reconciliation (`call_sid` +
a distinct `reconciliation_status` state machine + nullable
`reconciled_interaction_id`, never guessed, never inferred from a diagnostic
candidate), and auditability (every table has `created_at`, executions/results are
append-only). **Three genuinely separate concepts, never collapsed into each other,
per explicit instruction**: execution status (`campaign_executions.status`) ≠
reconciliation status (`campaign_executions.reconciliation_status`) ≠ business result
(`campaign_results`, which doesn't exist at all until reconciliation succeeds).

## 7. Campaign target / source-attribute model

Covered in §5/§6 — `source_attributes jsonb` on `campaign_targets` is the one
deliberately schema-flexible field in this whole model, because the brief explicitly
calls these "arbitrary source attributes." Everything else (identity, status, results)
uses real typed columns, matching this project's established preference (Customer 360
never used JSONB for anything except genuinely unstructured provenance) — JSONB is
used here narrowly, for the one field where the brief explicitly asks for
campaign-defined flexibility, not as a general modeling shortcut.

## 8. Campaign execution model

`campaign_executions` (§6) — one row per Trigger Call attempt, now carrying **two
independent status dimensions, per explicit instruction not to collapse them**:

- **`status`** (`queued|triggering|triggered|failed`) — purely the Trigger Call
  action's own lifecycle: did the request to the Voice Agent backend succeed and
  produce a `call_sid`? Nothing about the eventual call outcome is knowable here.
- **`reconciliation_status`** (`pending|reconciled|unresolved|error`) — has this
  execution been authoritatively matched to a real `call-data` row yet? `pending`
  until attempted, `reconciled` only when an authoritative identifier match succeeds
  (§14), `unresolved` after a bounded number of reconciliation attempts with no
  authoritative match, `error` if the reconciliation lookup itself failed (e.g.
  backend unreachable — distinct from "genuinely no match found").

Neither dimension is ever conflated with **campaign result** (§9) — an execution can
be `triggered` + `reconciled` with a business result of `not_interested`, or
`triggered` + `unresolved` with no result at all (not even a placeholder one), or
`failed` (Trigger Call itself errored) with no reconciliation attempted at all.

## 9. First-class campaign result model

`campaign_results` (§6) is a separate table from `campaign_executions`, exactly per
the brief's example table (call status / call outcome / intent / campaign result /
result detail / next action, all distinct columns) — **and, per explicit amendment, a
`campaign_results` row is only ever created for an execution whose
`reconciliation_status = 'reconciled'`.** There is no "unreconciled pending" business
result — that state lives entirely on `campaign_executions.reconciliation_status`
(§8), never as a fabricated or placeholder row in `campaign_results`. A target whose
execution is still `pending`/`unresolved` reconciliation simply has **no**
`campaign_results` row yet — the UI (§20) reads `reconciliation_status` directly to
show "awaiting reconciliation" / "could not be matched to a call" rather than
inventing a result to avoid an empty state. This is the corrected, three-way-separated
version of Session 3.5's "never present a gap as absence" principle: the gap is shown
honestly via `reconciliation_status`, not smuggled into the result model.

**Effective result vs. result history — amended, per final instruction.** Because a
target may accumulate multiple `campaign_executions` (retries, follow-ups) and
therefore multiple historical `campaign_results` rows, `campaign_results` itself
remains fully append-only — nothing is ever overwritten or deleted. But **exactly one
deterministically-derived "current" result per target** is needed for anything
target-level (the KPI in §25, the target list's Campaign Result column, §20) —
represented by `campaign_targets.effective_result_id` (§6). The deterministic rule:
**the most recently `result_recorded_at` `campaign_results` row for that target
becomes its effective result**, updated atomically in the same RPC transaction that
inserts a new `campaign_results` row (§22) — never computed ad hoc per query, and
never requiring an application-layer "pick the latest" step that could drift from what
the data-access layer actually persisted.

## 10. Result derivation / mapping design

A pure, deterministic function (`src/server/campaigns/resultRules.ts`,
`deriveCampaignResult(callData: CallDataEntryDto, rules: CampaignResultRule[])`),
**called only when `reconciliation_status` has just transitioned to `'reconciled'`**
(§9) — it never runs against an unreconciled or diagnostic-candidate row. It
evaluates `campaign_result_rules` in `priority` order, matching `match_field`'s value
on the reconciled `call-data` row (`status`, `outcome`, `escalation_trigger`, `intent`,
etc.) against `match_value`; the first match wins, producing
`{result_code, result_label, is_success, next_action_type, next_action_delay_days}`.
No rule matches → `result_code = 'unclassified'`, `is_success = null`, surfaced
explicitly, never hidden. **No LLM involvement anywhere in this function** — per the
brief's explicit prohibition.

**`is_success` is an explicit, separately-configured classification (§6), never
inferred from `result_code`'s or `result_label`'s text** — per explicit amendment.
When an operator defines a rule in Create Campaign (§13), they set `is_success` to
`true`, `false`, or leave it `null` (neither meaningfully success nor failure — e.g.
`retry_required`, which is a process state, not a business outcome). Dashboard/
Campaign-List success rate (§25) reads this column directly, never string-matches a
result code or label to guess intent.

Rules are created via Create Campaign (§13) with a small set of sensible defaults
seeded per campaign — e.g. `outcome=resolved → promise_to_pay` is NOT a safe default;
defaults should be conservative and based only on real reconciled `call-data` values,
e.g. `outcome=escalated → needs_review (is_success=false)`. Note that **"never
reconciled" is not a rule outcome at all** — it's handled entirely at the
`reconciliation_status` layer (§8/§14): an execution `unresolved` after a bounded
retry window causes the campaign runner (§16) to mark the target `follow_up_due`
directly (a scheduling decision, not a derived business result), never by matching a
fake "no call_sid" condition inside `deriveCampaignResult`, which only ever runs
against real reconciled data. Anything beyond the seeded conservative defaults must be
explicitly configured, never guessed at import time.

## 11. Next-action/follow-up model

`campaign_followups` (§6), created automatically whenever a `campaign_results` row's
`next_action_type` implies scheduling (`retry`, `follow_up`) — `due_at` computed from
`result_recorded_at + next_action_delay_days`. The campaign runner (§16) picks up
`campaign_targets` with `status = 'follow_up_due'` and `next_action_at <= now()`,
exactly parallel to how it picks up fresh `pending`/`ready` targets — one runner, two
selection queries, not two runners.

## 12. Campaign chaining readiness

`campaign_followups.next_campaign_id` (nullable FK to another `campaigns` row) is the
one schema hook for "Campaign A → result → Campaign B," per the brief's explicit
instruction not to build a full workflow engine this session. Session 5 does **not**
implement automatic creation of a target in Campaign B when this fires — that's a
deliberate, out-of-scope next step; the column exists so a future session can add that
without a schema change.

## 13. Create/import workflow

**Create Campaign** (`CreateCampaign.tsx`, kept as the existing 6-step wizard shell
per "preserve where sensible," rewired to real data):
1. Basic Info (name, description) — unchanged shape.
2. **Agent** — replaces "Campaign Type & Script" as the primary selector: a real
   `useAgents()`-backed dropdown (same hook/pattern as Initiate Call), **required**,
   no invented categories (per the brief).
3. **Target Audience** — CSV upload (via `papaparse`, §4 item 5) is the only source
   implemented this session; "Salesforce" is removed, not left as a fake button.
   Minimum columns: `name, phone, customer_reference?` plus free-form extra columns
   captured into `source_attributes`.
4. Scheduling (optional start time) — kept, but the exhaustive Retry & Callback
   Policy step (max attempts, gap, recycling, time-of-day rotation) from the current
   wizard is **deferred, not implemented** — it belongs to "complex retry
   optimization," explicitly excluded (§20). A campaign gets one simple,
   rule-driven retry via `campaign_result_rules`'s `retry_required` mapping instead.
5. **Result mapping / objective** — a minimal rule editor seeded with the safe
   defaults from §10, editable before launch.
6. Review & Launch → `Save Draft` (status `draft`, no execution) or launches
   immediately into `scheduled`/`running`.

**Import flow**: client parses the CSV (`papaparse`), rows are POSTed as JSON to the
campaign API (§17) which performs §5's server-side Customer 360 resolve-or-create —
the browser never resolves identity itself, matching Customer 360's own
"browser must not do bulk source-of-truth work" principle.

## 14. Customer 360 enrichment behavior

Per the brief's explicit relationship diagram: `customer → campaign_target →
campaign_execution → call → existing customer_interaction`. **Call reconciliation
design — amended to be strictly deterministic, per explicit instruction.**

**Core rule: phone-number + time-window matching may never set
`reconciled_interaction_id`, never creates a `campaign_results` row, never attaches a
transcript/recording, and never creates or touches any Customer 360 linkage.** It may
only populate the diagnostic-only `campaign_executions.reconciliation_candidate`
column (§6/§8) — a human-reviewable hint, explicitly never treated as authoritative
anywhere downstream. `campaign_name` is never used as a correlation key at all (per
explicit instruction) — it's a plain, non-unique string on `call-data`, with no
confirmed mechanism for this app to set it in the first place (§4 item 2).

**Authoritative reconciliation requires a stable correlation identifier. Two
mutually-exclusive backend-enhancement paths would provide one — this plan does not
guess which will be available:**

- **Preferred**: `POST /api/v1/call` gains a `client_reference` (or
  `campaign_execution_id`) request field, and `GET /call-data` returns that same
  value on the resulting row. This is the cleanest fix and the one to request first —
  it removes any dependency on `call_sid`/`call_id` equivalence entirely.
- **Alternative**: explicit backend confirmation that `call_sid` (Trigger Call's
  response) and `call_id` (a later `call-data` row) are guaranteed to represent the
  same identifier for the same call. If confirmed, `call_sid`-based lookup (via
  `GET /call-data?search=<call_sid>`, itself still pending live verification, §26)
  becomes the authoritative path.

**Reconciliation state machine, using ONLY an authoritative identifier once one of the
above is confirmed available:**

1. Immediately after Trigger Call succeeds: `campaign_executions.status = 'triggered'`,
   `call_sid` stored, `reconciliation_status = 'pending'`.
2. A periodic reconciliation pass (mirroring Customer 360's own `reconcileJob.ts`
   pattern) attempts the authoritative lookup (`client_reference` match, or confirmed
   `call_sid`/`call_id` equivalence — whichever backend path is available). On success:
   `reconciliation_status = 'reconciled'`, `reconciled_interaction_id` set, `§10`'s
   rule derivation runs, producing the one and only `campaign_results` row for this
   execution. The existing `customer_interactions` row (already created by Customer
   360's own ingestion, untouched by this session) is linked to, never duplicated.
3. Separately, and only for **diagnostic display**, the reconciliation pass may also
   record a phone+time-window `reconciliation_candidate` (§6) if one exists — shown in
   the UI as "possible match, unconfirmed" for an operator to review manually, with no
   automated consequence whatsoever.
4. If no authoritative match is found after a bounded number of attempts:
   `reconciliation_status = 'unresolved'`. No `campaign_results` row is ever created
   for this execution. The campaign runner (§16) may independently decide to mark the
   *target* `follow_up_due` based on this (a scheduling decision, not a business
   result) — kept distinct per §9.
5. **Until one of the two backend enhancements above is confirmed available,
   authoritative reconciliation cannot actually run** — every execution stays
   `reconciliation_status = 'pending'`/`'unresolved'` indefinitely, and no
   `campaign_results` rows are produced at all. This is the honest, intended behavior
   of this design under today's confirmed backend capability, not a bug to work
   around with a lower-confidence substitute (explicitly prohibited).

**This is recorded as the plan's single most important backend gap (§26)** — Session
5's implementation can ship the full data model and UI against it, but real,
non-diagnostic campaign results depend on this backend confirmation/enhancement
landing first.

## 15. Start/Pause/Resume/Stop semantics

Every action is persisted (a `campaigns.status` transition + an implicit audit trail
via `updated_at`/`campaign_executions`/`campaign_results` timestamps) and only exposed
if genuinely implemented — directly answering the NPS module's "misleading no-op"
problem found in §2.

- **Save Draft**: `status = 'draft'`. No targets processed.
- **Start**: `draft|scheduled → running`, `started_at` set. The runner (§16) begins
  picking up `pending`/`ready`/`follow_up_due` targets for this campaign.
- **Pause**: `running → paused`. The runner skips this campaign's targets on its next
  batch pass — in-flight executions (already `triggering`) are **not** cancelled
  (Trigger Call has no cancel semantic; per §4 there's no dedicated campaign backend
  API to cancel an in-progress call), they're allowed to complete and reconcile
  normally.
- **Resume**: `paused → running`. Runner resumes picking up this campaign's targets.
- **Stop**: `running|paused → stopped`, terminal. No further targets are picked up;
  existing `pending`/`follow_up_due` targets are left as-is (not force-closed) so a
  future audit can see what was never attempted, rather than fabricating a `skipped`
  status for something that was simply never reached.
- **Retry Target**: available on a `failed` or `follow_up_due` (`retry_required`)
  target only — creates a new `campaign_executions` row (`sequence + 1`), does not
  mutate the prior one.
- **Schedule Follow-up**: manual override — creates/edits a `campaign_followups` row
  directly, for an operator who wants to intervene outside the rule-driven default.

## 16. Campaign runner architecture

Per the brief's explicit instruction and this session's own hard-won Vercel lessons
(§23): the runner is a **plain, invokable, stateless batch function** —
`src/server/campaigns/campaignRunner.ts`'s `runCampaignBatch(repo, backendAdapter,
batchSize)` — with zero dependency on Vercel, Cron, or any specific scheduler. It:

1. Selects up to `batchSize` targets across all `running` campaigns where
   `status IN ('pending','ready')` or (`status='follow_up_due' AND next_action_at <= now()`).
2. For each: resolves the target's primary contact point's phone number and the
   campaign's `agent_id`; calls the Voice Agent backend's `POST /api/v1/call`
   directly (same `getBackendConfig()`/fetch pattern as Customer 360's
   `voiceAgentInteractionSource.ts` and Chat's `api/chat/index.ts` — **not** through
   the frontend-only `triggerCall()` function, which is React/browser-oriented).
3. Records a `campaign_executions` row per attempt (`triggered` on success with
   `call_sid`, `failed` with `error_detail` on a Trigger Call error) and advances
   `campaign_targets.status` to `in_progress`.
4. Returns a summary (`{processed, triggered, failed}`), mirroring Customer 360's
   `runBackfillBatch`'s bounded-batch-with-summary shape.

This deployment invokes it via an admin-token-gated action on the consolidated
campaigns route (§17) — manually, or later wired to Vercel Cron / any other
scheduler, **never a hard product dependency** on any of them (explicit instruction).

## 17. Trigger Call integration

Covered in §16 — the runner calls the backend directly, passing
`{to_phone_number: contactPoint.rawValue, agent_id: campaign.agentId, customer_id:
customer.sourceCustomerRef ?? undefined}`. `customer_id` is populated **only** when
Customer 360 already has a `sourceCustomerRef` for that customer (still nullable for
essentially every customer today, per Session 4's own finding that the backend never
returns one) — never fabricated, consistent with Customer 360's own rule.

## 18. Call Data reconciliation

Detailed in §14. Reiterating the concrete mechanics: reconciliation is its own small
invokable function, `src/server/campaigns/reconcileExecutions.ts`, callable via the
same admin-gated action dispatch, processing `campaign_executions` rows with
`reconciliation_status = 'pending'` after some minimum age. It attempts **only** the
authoritative lookup available once one of §14's two backend paths is confirmed
(`client_reference` match, preferred; or confirmed `call_sid`/`call_id` equivalence) —
never a phone/time fallback as an authoritative source. A phone+time-window candidate
may additionally be computed and stored in `reconciliation_candidate` purely for
diagnostic display (§14 point 3), entirely separate from the authoritative attempt and
never influencing `reconciliation_status`, `reconciled_interaction_id`, or whether a
`campaign_results` row gets created. Until a backend path is confirmed, this function
has nothing authoritative to attempt and every processed row moves from `pending` to
`unresolved` after its retry budget — expected, honest behavior (§14 point 5), not an
error to suppress.

## 19. Transcript/recording reuse

**No new transcript or recording component is built.** Campaign Detail's per-target
"Transcript"/"Recording" actions become active (not shown/disabled if
`reconciled_interaction_id` is null — a target with no reconciled call has nothing to
show yet, honestly) and, when present, fetch that `interactionId`'s full record the
same way Call Logs already does (`useCallData({search: interactionId})`, the exact
pattern `CustomerDetail.tsx`'s `InteractionLookupDialog` already established in
Session 4) and open the existing `InteractionDetailDialog` unmodified. `TranscriptDialog.tsx`
and `RecordingDialog.tsx` (§1, currently 100% fake) are **deleted**, not kept
alongside the real mechanism.

## 20. Exact UI changes, preserving useful existing structure

**Kept, rewired to real data (not redesigned):**
- `OutboundCampaigns.tsx` — list shell, `CampaignOverviewStats` (5 tiles), filters,
  `CampaignGrid` table shape.
- `CampaignDetail.tsx` — summary cards, target list table shape.
- `CreateCampaign.tsx` — the step-wizard shell (§13 details which steps change).

**Removed:**
- `TranscriptDialog.tsx`, `RecordingDialog.tsx` (§19), `CreateCampaignDialog.tsx`
  (already dead code), the entire Retry & Callback Policy step's exhaustive fields
  (§13 step 4), the "Salesforce" source option, `industryCampaignGenerator.ts` /
  `industryCampaignContactGenerator.ts` usage in this module (files may stay for
  other industries' unrelated mock usage if any — verify no other consumer before
  deleting the files themselves; the *import* into Outbound Campaigns is removed
  regardless).

**Added:**
- Start/Pause/Resume/Stop/Retry-Target/Schedule-Follow-up buttons on Campaign
  Detail, wired to §15's real actions.
- A CSV upload step that actually parses and previews rows (§13).
- An agent selector (§13 step 2) and a minimal result-rule editor (§13 step 5).
- Campaign Result / Next Action columns on the target table (§ brief's field list).
- **`CampaignOverviewStats`'s Success Rate tile amended per final instruction (§25):**
  shows the target-level, `effective_result_id`-based rate, plus a separate,
  adjacent "Unclassified / Pending" count (targets with no `effective_result_id`
  yet, or whose effective result has `is_success = null`) so those targets are
  visibly surfaced rather than silently dropped out of the ratio. If a raw
  execution/call count (e.g. total calls triggered) is also shown, it is labeled
  distinctly (e.g. "Calls Triggered") and never as "Success Rate."

## 21. Exact routes/services/repositories/hooks/components

**New domain layer**, mirroring Customer 360/Chat's `src/server/*` convention:
- `src/server/campaigns/types.ts`
- `src/server/campaigns/campaignRepository.ts` (interface)
- `src/server/campaigns/supabaseCampaignRepository.ts` (adapter — only file here
  importing `@supabase/supabase-js`, reusing `CUSTOMER360_SUPABASE_URL`/
  `CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY`, no new secret)
- `src/server/campaigns/campaignRunner.ts` (§16)
- `src/server/campaigns/reconcileExecutions.ts` (§18)
- `src/server/campaigns/resultRules.ts` (§10)

**New transport layer — ONE consolidated new file, plus one required consolidation
of existing files, per §23's now-coherent budget:**
- `api/campaigns.ts` — every operation (`list`, `get`, `create`, `start`, `pause`,
  `resume`, `stop`, `importTargets`, `retryTarget`, `scheduleFollowup`, `runBatch`
  [admin-gated], `reconcile` [admin-gated]) dispatched via `?action=` + HTTP method,
  the exact query-param-dispatch pattern proven reliable in Session 4.5 (no dynamic
  path segments).
- **Required, not optional**: `api/customers/[id]/interactions.ts` and
  `api/customers/[id]/refresh.ts` are deleted, their logic merged into
  `api/customers/[id]/index.ts` via `?action=interactions`/`?action=refresh` dispatch
  (§23) — this is the specific consolidation that makes the function budget coherent
  for this session; implementation is not complete without it.

**New frontend:**
- `src/types/campaign.ts` (normalized types)
- `src/services/campaigns/campaignsService.ts` (calls `/api/campaigns?action=...`)
- `src/hooks/campaigns/{useCampaigns,useCampaignDetail,useCampaignActions,
  useImportTargets}.ts`
- `src/components/campaigns/CampaignStatusBadge.tsx` (new, shared — §2)
- Modified: `OutboundCampaigns.tsx`, `CampaignDetail.tsx`, `CreateCampaign.tsx`,
  `CampaignGrid.tsx`, `CampaignOverviewStats.tsx` (real success-rate formula, §6 of
  the brief)
- Deleted: `TranscriptDialog.tsx`, `RecordingDialog.tsx`, `CreateCampaignDialog.tsx`

**New dependency:** `papaparse` (+ `@types/papaparse`) — flagged in §4 item 5 and
§26 for explicit confirmation before implementation.

**Nothing else in Customer 360 (`src/server/customer360/*`), Chat
(`src/server/chat/*`, `api/chat*`), or NPS is modified** — the one named
`api/customers/[id]/*` consolidation above (transport-layer file count only, zero
behavior change, §23) is the sole exception, plus the one shared
`CampaignStatusBadge` component NPS may optionally adopt later (not required, not
done automatically per the brief).

## 22. Supabase schema/RPC design

Same access model as Customer 360/Chat (§6's tables), new
`public.call_center_campaign_*` `SECURITY DEFINER` functions (one per repository
operation — `create_campaign`, `list_campaigns`, `get_campaign`, `list_targets`,
`import_targets` [bulk, resolves Customer 360 identity server-side per §5],
`create_execution`, `update_reconciliation_status` [sets `pending`/`reconciled`/
`unresolved`/`error` and, only on the `reconciled` transition, atomically (a) inserts
the one corresponding `campaign_results` row and (b) updates that target's
`effective_result_id` to point at it — never called separately in a way that could
create a result without a reconciled execution, or leave `effective_result_id`
pointing at a stale row, enforcing both §9's rules at the data-access layer, not just
by convention], `create_followup`, `update_campaign_status`, etc.),
each individually granted to `service_role` only, verified via
`has_function_privilege` exactly the way Session 4/4.5 already did and already
verified working. Applied via the Supabase MCP against the confirmed AuditAI project
(`dtbaczafdzgctkbqviod`), same `call_center` schema — no new project, no new schema.

## 23. Vercel function-count/routing constraints

**Recounted directly against the deployed function source** (`find api -name "*.ts"
! -name "_*"`) at the time of this amendment: **exactly 12 files**, confirming the
Vercel Hobby-plan ceiling is already fully used, with no headroom, before Session 5
adds anything. The original draft's plan to add `api/campaigns.ts` (§21) without
freeing a slot first was therefore incoherent, exactly as flagged — **corrected
below with an exact, named consolidation, decided now, not deferred to
implementation time.**

**Exact consolidation for Session 5**: merge `api/customers/[id]/interactions.ts`
and `api/customers/[id]/refresh.ts` into `api/customers/[id]/index.ts`, dispatched by
`?action=interactions` / `?action=refresh` on the same file — the **identical, already
-proven pattern** used for `api/customers/admin.ts` (Session 4) and `api/chat/logs.ts`
(Session 4.5): a literal/single-dynamic-segment file with query-param action dispatch,
not a new catch-all. This is chosen over touching any Session 1-3.5 file
(`api/calls/*`, `api/agents/*`, `api/analytics/*`) or Chat's already-fixed routes,
keeping the blast radius inside Session 4's own, most recently added, three-file
group — the same reasoning Session 4.5 already used once to free capacity. No
behavior changes: same three operations, same authorization/refresh logic, same
response shapes, purely a file-count reduction.

**Resulting budget**: 12 existing − 2 (the consolidation above) + 1 (`api/campaigns.ts`,
§21) = **11 functions after Session 5** — one spare slot of genuine headroom, not
sitting exactly at the ceiling again. This consolidation is part of the **approved
Session 5 implementation**, not optional — implementation must not begin until this
exact change is included, per instruction that the route budget be coherent before
starting.

**This ceiling remains a real, ongoing constraint with no further headroom after this
session's one spare slot** — flagged again in §26 for whichever session needs another
new route next.

Routing implementation must use **literal paths + query-param dispatch only** —
Session 4.5 confirmed, live, twice, that both optional and standard Vercel catch-all
dynamic segments misbehave in this specific deployment (wrong-branch routing; a
mangled `"...route"` query key; catching only exactly one path segment). No new
`[...x]`/`[[...x]]` file is created in Session 5, and the `[id]` in
`api/customers/[id]/index.ts` above is the already-proven, non-catch-all single-segment
form, not a re-introduction of the failed pattern.

## 24. Verification plan

1. `tsc --noEmit`, `npm run build`, `npm run lint` — zero new errors beyond baseline.
2. Migration applied via the Supabase MCP; confirm all 6 new tables, indexes, and
   `call_center_campaign_*` function grants (`service_role` only) exactly as Session
   4/4.5's verification did.
3. Synthetic data seeded/cleaned via the MCP, exercised through the real deployed API
   (the method that already caught a real bug in Session 4 and confirmed Session
   4.5's fixes): create a campaign, import 2-3 targets (confirm Customer 360
   materialization — both a never-seen phone and an already-known one), start the
   campaign, run one runner batch (mocked/skipped live call if the Voice Agent
   backend is down — see deferred items), confirm execution rows are created
   correctly, confirm **no `campaign_results` row is created** while
   `reconciliation_status` stays `pending`/`unresolved` (this is the specific,
   testable behavior the amendment requires — a `campaign_results` row appearing
   without an authoritative reconciliation would be a bug), confirm a diagnostic
   `reconciliation_candidate` (if any) never sets `reconciled_interaction_id`, confirm
   Pause/Resume/Stop/Retry each produce exactly the persisted state change described
   in §15 and nothing else.
4. Confirm the function count is exactly **11** after this session
   (`find api -name "*.ts" ! -name "_*" | wc -l`) — 12 existing − 2 (the required
   `api/customers/[id]/*` consolidation, §23) + 1 (`api/campaigns.ts`) — before
   considering deployment done. A count of 12 or 13 both indicate the consolidation in
   §23 was skipped or done incorrectly.
5. `grep` the production `dist/` bundle for the service-role key and the new
   repository adapter's filename — must never appear client-side.
6. Live, once the Voice Agent backend is reachable AND once a backend decision on
   §14's correlation-identifier question is available: run a real campaign batch
   against a safe test number, confirm a `call_sid`/`client_reference` is recorded,
   confirm the chosen authoritative reconciliation path actually resolves a real
   execution to a real `call-data` row, and confirm a `campaign_results` row is only
   then created — this closes out §4 item 1 / §26 item 1, the plan's central open
   question. Until that backend decision lands, this check remains deferred and
   campaign results remain structurally empty in production — expected, not a defect.
7. Confirm the merged `api/customers/[id]/index.ts` (§23) behaves identically to the
   three separate files it replaces — same three operations, same responses — via
   the same live-curl method Session 4/4.5 used to verify their own consolidations.
8. Confirm Session 1-4.5 screens are unaffected (`git diff --stat` shows only the
   files in §21, including the one named consolidation).

## 25. Mock-data retirement plan

Every mock identified in §1 is retired to a named real source, with no operational
mock data remaining:

| Mock field | Retired to |
|---|---|
| Campaign records | `call_center.campaigns` via `campaignsService`/`useCampaigns` |
| Total contacts / calls made | Computed from real `campaign_targets`/`campaign_executions` counts |
| **Campaign Success Rate** | **Amended, per final instruction — target-level, not execution/result-row-level.** Multiple `campaign_results` rows can exist per target (retries/follow-ups); counting result rows directly against target count could double-count a single target and produce an invalid rate. Formula, using each target's single deterministic `effective_result_id` (§9): `count(campaign_targets t join campaign_results r on t.effective_result_id = r.id where r.is_success = true) / count(campaign_targets t join campaign_results r on t.effective_result_id = r.id where r.is_success is not null)`. Targets with no `effective_result_id` yet (never contacted, or `reconciliation_status` still `pending`/`unresolved`) or whose effective result has `is_success = null` (unclassified) are excluded from **both** numerator and denominator — surfaced as a separate "Unclassified / Pending" count on the same KPI tiles (§20), never silently folded into either side. This answers exactly "what proportion of *classified* campaign targets achieved the business objective" — not "what proportion of all targets" and not "what proportion of all calls." Raw execution/call-level statistics (e.g. total calls triggered, triggered-vs-failed) may be shown separately if useful but must never be labeled "Campaign Success Rate" (explicit instruction) |
| Campaign contacts / target list | `call_center.campaign_targets` joined through Customer 360 |
| Action taken / call status | `campaign_executions.status` + `campaign_results.campaign_result_label` |
| Transcript / recording | Real `InteractionDetailDialog` reuse (§19), never a campaign-local fake |
| Campaign type / creator / timestamps | Real `campaigns` columns (`created_by`, `created_at`, `started_at`, etc.) — "campaign type" as a free concept is retired in favor of the real `agent_id` + result-rule configuration, since "type" had no real backend meaning |
| Status | Real `campaigns.status` / `campaign_targets.status` state machines (§ brief's §11) |
| CSV import | Real `papaparse`-driven parse + server-side Customer 360 resolution (§13) |

## 26. Deferred items / backend enhancements required

1. **A stable, authoritative correlation identifier is the central open question,
   and campaign results genuinely cannot be produced without one (§14/§18).** Two
   backend paths would resolve it, preferred first: (a) `POST /api/v1/call` accepts
   `client_reference`/`campaign_execution_id` and `GET /call-data` returns the same
   value; or (b) explicit backend confirmation that `call_sid` and `call_id` are
   guaranteed identical for the same call. Until either is confirmed, every campaign
   execution stays in `reconciliation_status = 'pending'`/`'unresolved'` and no
   `campaign_results` rows are produced — this is intended, honest behavior under
   today's confirmed capability, not a defect (§14 point 5). Phone/time-window
   matching is available only as a non-authoritative diagnostic display and must
   never be upgraded to fill this gap.
2. **`call-data`'s `search` parameter behavior** — relevant only if backend path (b)
   above is confirmed and `search=<call_sid>` becomes the lookup mechanism; same
   unresolved question Customer 360's own plan already flagged.
3. **No confirmed backend mechanism sets `campaign_name`** on a `call-data` row from
   the request side, and this plan does not rely on it as a correlation key at all
   (explicit instruction) — worth asking the backend team about separately, but not a
   blocker for anything in this plan.
4. **Vercel function-count ceiling has exactly one spare slot after this session's
   required consolidation** (§23) — still a real, recurring constraint; the next
   session that needs a new route must address it directly (further consolidation or
   a plan-tier decision), not rediscover it via a failed deployment.
5. **`papaparse` is approved** for CSV ingestion (confirmed) — still flagged here only
   as a reminder that it's a genuinely new dependency being added, first time this
   project has done so mid-stream; no further confirmation needed before
   implementation.
6. **`papaparse`-vs-hand-rolled CSV parsing is a deliberately simple choice** — no
   support planned for advanced source formats (Excel, Salesforce API) this session;
   flagged as a future enhancement only if actually needed.

---

Stop after this plan. No implementation code has been written. Waiting for approval
before beginning Session 5.
