# Session CMA-3B.1 — Production Deployment Report

## Commit

`1b21f00` — `feat(cma): expand governed calculation catalogue` — pushed to
`main` and deployed. Contains both pending migrations
(`20261029000000_cma_calculation_catalogue.sql`,
`20261030000000_cma_dimension_governance_correction.sql`), the rewritten
`src/server/cma/cmaEvaluation*.ts` trio, the extended
`.tooling/scripts/cma-evaluation-verify.mjs` (46 tests), and the three
CMA-3B docs. Verified by `git show --stat 1b21f00` before any database work
started.

## Pre-apply verification against production (`dtbaczafdzgctkbqviod`)

- `list_migrations` confirmed production was at `20261018022558_cma_evaluation_engine`
  (CMA-3A) — neither CMA-3B migration had been applied. No drift from what
  CMA-3B/3B.1 assumed.
- `call_center_cma_evaluate_measure` was the only CMA evaluation RPC present;
  the 4 new family functions did not exist yet, as expected.
- Cross-checked every column the 2 new migrations read
  (`qa_findings`/`qa_reviews`/`automated_qa_observations`/`automated_qa_evaluations`/
  `campaign_targets`/`campaign_results`/`campaign_classifications`/
  `chat_sessions`/`action_items`) against `information_schema.columns` —
  all 28 expected columns present with matching types. No schema drift from
  the disposable-Postgres validation.
- Confirmed the exact 6 registry rows the governance-correction migration's
  PART 1 `DELETE` targets were present
  (`CAMP-01/02/03` + `channel`, `CHAT-SPAN-01` + `channel`, `ACTION-01` +
  `channel`/`outcome`) — matches precisely, nothing already cleaned up by
  another process.
- Confirmed the 4 pending business definitions
  (`CANON-AVG-HANDLE-TIME`, `CANON-CALL-TECH-PERF`, `CANON-ESC-RATE`,
  `CANON-FIRST-CONTACT-RES`) were `pending_decision` before the migrations
  and remain `pending_decision` after — neither migration touches
  `cma_canonical_measures` at all, so this was structurally guaranteed, not
  just checked.

**Recovery availability**: I do not have a tool in this session that can
query Supabase's point-in-time-recovery/backup configuration (that's a
project-settings property, not a SQL-queryable one). I did not fabricate a
confirmation of it. What I can state factually: both migrations are
additive/corrective only — no table is dropped, no column is dropped, no
row in any *data* table (customers, interactions, calls, campaigns, etc.) is
touched. The only `DELETE` in either migration removes 6 rows from a
governance metadata table (`cma_measure_dimensions`) that this session
itself had just independently confirmed were factually unsupported by the
real schema. If a rollback were ever needed, re-inserting those 6 rows and
re-running the pre-CMA-3B.1 `CREATE OR REPLACE FUNCTION` definitions would
fully reverse it — this is a low-blast-radius change, not a data migration.

## Applied migrations

Both applied via the Supabase migration tool, in order:

1. `cma_calculation_catalogue` (local file `20261029000000_...`) — adds the
   `CANON-INTENT-CONFIDENCE` arm to `call_center_cma_evaluate_measure` and
   creates the 4 new family RPCs (`_qa_measure`, `_campaign_measure`,
   `_chat_measure`, `_action_measure`), all locked down to `service_role`
   only.
2. `cma_dimension_governance_correction` (local file `20261030000000_...`)
   — removes the 6 unsupported registry relationships, and (via explicit
   `DROP FUNCTION IF EXISTS` + `CREATE OR REPLACE`, the fix for the real
   function-overload defect found during disposable-Postgres testing)
   extends the chat and action RPCs with `p_filter_campaign_id`.

Note: the Supabase migration tool assigns its own server-side version
timestamp on apply (`20261018052659`/`20261018052937`) rather than reusing
the local filename's timestamp (`20261029000000`/`20261030000000`) — this is
normal for this tool and does not affect correctness; `list_migrations`
after applying shows both recorded in production history.

## Post-apply verification

- **Function signatures**: exactly 5 `call_center_cma_evaluate_*` functions
  exist, one version each — no duplicate/ambiguous overloads (confirms the
  `DROP FUNCTION IF EXISTS` fix worked for real on production, not just in
  the disposable cluster).
- **Grants**: all 5 functions are `REVOKE`d from `public`/`anon`/`authenticated`
  and granted to `service_role` only (plus the implicit owner `postgres`) —
  matches every other CMA RPC's lockdown.
- **Dimension registry**: the 6 removed relationships confirmed gone
  (`still_present: 0`); the 4 pending business definitions confirmed
  unchanged.
- **Security advisors**: 1 CMA-related finding, `INFO` level,
  "RLS Enabled No Policy" — this is the project's existing deliberate
  deny-all RLS pattern (no direct table policies; access only through
  `security definer` RPCs), shared by all 70 tables across the whole
  database including every pre-existing `call_center.*` table. Not a new
  or CMA-3B.1-specific finding.

### Representative calculation verification — every source family against independently-queried facts

| Family | Measure | RPC result | Independent query | Match |
|---|---|---|---|---|
| interaction | `CANON-INTENT-CONFIDENCE` | population 761, denominator 0, numerator null | `count(intent_confidence)=0` of 761 voice rows | ✅ correctly reports missing data, never a fabricated value |
| qa | `CANON-TASK-PROGRESSION-RATE` | population 81, denominator 81, numerator 80 | UNION of qa_findings+automated_qa_observations for `task_progression_rate`: 81/81/80 | ✅ exact |
| campaign | `CANON-CAMPAIGN-TARGET-COUNT` | population 8, denominator 8, numerator 8 | `count(*)` of `campaign_targets` = 8 | ✅ exact |
| chat | `CANON-CHAT-SESSION-SPAN` (unfiltered) | population 12, numerator 230.988 | `count(*)=12`, `sum(span)=230.988` of `chat_sessions` | ✅ exact |
| chat | same, grouped by `campaign` (CMA-3B.1 extension) | `groups: []` | `count(campaign_id)=0` of those 12 rows | ✅ correctly empty — no chat session currently has a `campaign_id` set in production; the new grouping capability is live and correct, just has no data to group yet |
| action | `CANON-ACTION-REQUIRED-QUEUE-ITEMS` | population/denominator/numerator 199 | `count(*)` of `action_items` = 199 | ✅ exact |

### Business Data Scope enforcement (new families)

Called `call_center_cma_evaluate_action_measure` with
`p_all_agents=false, p_authorized_agent_ids=['emi-reminder-agent']` →
returned 40, matching the independently-confirmed count of `action_items`
for that one agent exactly (out of 199 total) — confirms Agent Scope is
enforced inside the RPC itself for the new families, not just in theory.

### Regression check

Called the untouched CMA-3A `CANON-RES-RATE` measure post-migration —
returned `population 761, denominator 738, numerator 104`, same shape as
before, no error. Production site root and `/qa-review/explorer` both
return HTTP 200 after deploy.

## Deploy

Pushed `1b21f00` to `main` → Vercel auto-deployment
`callcenter-8173kei1v-...` built successfully and is aliased to
`callcenter-three-livid.vercel.app` (confirmed via `vercel inspect`).
Function count and `vercel.json` cron configuration were not touched.

## Outstanding

The 4 pending business-definition decisions (FCR, Escalation Rate, AHT, Call
Technical Performance) remain exactly as documented in
`docs/CMA_BUSINESS_DEFINITION_DECISIONS.md` — not approved or activated by
this session, per the constraint. CMA-4 (screen integration) was not
started.
