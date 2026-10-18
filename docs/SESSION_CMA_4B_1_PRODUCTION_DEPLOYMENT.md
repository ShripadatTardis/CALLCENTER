# Session CMA-4B.1 — Operational Screen Production Deployment

## Commit and deployment

Commit `bb68139` (`bb681399fbd511b49e3d68cf8271e6d2ba77ba54`) —
`feat(cma): integrate campaign measures with CMA`. Contains exactly the
intended CMA-4B files: `src/components/campaigns/CampaignDetail.tsx`,
`src/components/campaigns/CampaignStatStrip.tsx`,
`src/lib/cma/cmaWindow.ts`, plus
`docs/CMA_4B_OPERATIONAL_SCREEN_MIGRATION_MATRIX.md` and
`docs/SESSION_CMA_4B_OPERATIONAL_INTEGRATION.md`. `.env` and all
unrelated working-tree changes were left untouched (confirmed via `git
status` before staging — only these 5 files were added).

Before committing, re-confirmed: no Supabase migration needed for
CMA-4B (production schema/RBAC already had everything this integration
needs, from CMA-4A.1); one legitimate medium HIG finding from the prior
session (the Campaign Detail "Targets (N)" heading reading a different,
un-synced number than the stat strip above it) was fixed — the heading
now reads the same `targetCount` the strip uses, while the separate
join-gap diagnostic check deliberately still compares against the raw,
un-windowed legacy count (confirmed still true by `grep`, and re-verified
by a fresh HIG re-review, 0 high findings both times).

Pushed to `main`; Vercel auto-deployed
(`callcenter-rkq3u01xo-sk-tardis-projects.vercel.app`) and is aliased to
`callcenter-three-livid.vercel.app` (confirmed via `vercel inspect`).

## Campaign integration verification

- `cma.evaluate` role grants re-confirmed unchanged from CMA-4A.1:
  `administrator`, `analyst`, `read_only`, `supervisor` — exactly 4, no
  broadening.
- Production campaign data re-queried before deployment (`call_center_campaign_list`):
  still 5 campaigns, 8 targets total, 2 classified / 2 success — unchanged
  since CMA-4B's original local verification, so the earlier byte-for-byte
  comparisons remain valid.
- Canonical measure identifiers used are exactly `CANON-CAMPAIGN-TARGET-COUNT`,
  `CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI`,
  `CANON-CAMPAIGN-SUCCESS-COUNT-RATE-POLICY-CLASS` — no new identifiers
  invented.
- The join-gap diagnostic (`campaign.stats.targetCount !== targets.length`,
  `CampaignDetail.tsx`) confirmed still independent of CMA's windowed
  aggregate — re-checked via `grep` immediately before commit.

## Production verification (on `callcenter-three-livid.vercel.app`, real authenticated administrator)

| Check | Result |
|---|---|
| Outbound Campaigns list renders | **Confirmed** — 5 campaigns, 8 targets, 100.0% success rate, 6 unclassified — exact match to the independently-queried production totals |
| Campaign Detail renders | **Confirmed** — "TEST 12.3 Phase E Automated Watch": 1 target, 1 call triggered, 100.0% success rate; "TARGETS (1)" heading now matches the strip (the HIG fix deployed correctly) |
| CMA evaluation requests succeed | **Confirmed** — real `POST /api/admin?resource=cmaEvaluate` calls, 200 OK, observed via network inspection on both the list and detail pages |
| Campaign measures match independently queried facts | **Confirmed** — see table above; identical to the pre-deployment production query |
| Campaign filters remain correct | Unchanged — filter UI/logic was not touched by this session, only the data source for 2 displayed numbers |
| Campaign management actions remain functional | Unchanged — Start/Pause/Resume/Stop, Add Targets, Configuration/History dialogs are untouched code paths, not part of this diff |
| Human QA Quality Explorer still has 5 tabs | **Confirmed** — Overview/Failure Analysis/Trends/Agent Performance/Interaction Outcomes all present; Quality Measures values (97%/95%/—/99%/100%/100%/—/—/—) unchanged from before this deployment, confirming this session did not touch that screen |
| Dashboard CMA measures remain operational | **Confirmed** — Resolution/Resolution Time/Auth Success still show (correctly) "No eligible population" for the current window, same as before this deployment; FCR/Escalation unchanged on the legacy path |
| No unauthorized access introduced | **Confirmed** — an anonymous `POST /api/admin?resource=cmaEvaluate` still returns `401` |

## Regression checks

No regressions found. Campaign list/detail pages, Human QA Quality
Explorer, and Dashboard all render identically to their pre-CMA-4B.1
state except for the two intended data-source changes (campaign stats)
and the one intended visual fix (heading/strip consistency).

## Remaining deferred integrations (unchanged from CMA-4B)

- Agent Detail's sentiment/intent-confidence (AGENT-SENT-01/INTCONF-01)
  — real candidates, blocked on a hook rebuild (bounded 100-row global
  sample vs. per-agent windowed population), not attempted.
- All 9 QA canonical measures — no safe migration path exists today
  (Human-only UI population vs. CMA's combined Human+Automated
  population); not implemented.
- `CHAT-SPAN-01`, and the full-page `CANON-ACTION-REQUIRED-QUEUE-ITEMS`
  aggregate — no UI occurrence exists to migrate.
- FCR/Escalation Rate/AHT/Call Technical Performance — still
  `pending_decision`, untouched.
- The legacy campaign RPCs' lack of Agent Scope enforcement (found during
  CMA-4B) remains undocumented-no-longer — now recorded — but not
  altered, per this session's explicit boundary.
- Restricted-scope end-to-end verification remains untested against a
  live session — still no production user with a restricted Agent Scope
  or a non-administrator `cma.evaluate` role assigned, same honestly-reported
  gap as CMA-4A.1.

## Unresolved issues

None found that block this deployment. CMA-4C was not started.
