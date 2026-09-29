# Session R4 — Live Verification & Ratio Hardening

**Outcome: backend still unreachable. No code changes made, per the session's own explicit instruction.** Implemented/verified directly in this session (no subagents). Nothing to commit beyond this report.

## 1. Backend availability — the central finding of this session

The Call Centre demo backend (`bankingvoicebot.nl-demo.com`) was tested before any other work began, per the session's mandatory first action.

**Result: fully unreachable**, confirmed across 3 separate endpoints:
- `GET /api/v1/call-data?page=1&page_size=5&status=inactive`
- `GET /api/v1/analytics/metrics?window=24h`
- `GET /` (root)

All three: `HTTP:000`, 12-second timeout, no response of any kind.

**Precise diagnostic (new this session, more specific than R2/R3's finding):**
```
* Host bankingvoicebot.nl-demo.com:443 was resolved.
* IPv4: 106.51.70.119
* Trying 106.51.70.119:443...
* Connection timed out after 10007 milliseconds
```
DNS resolution succeeds — the hostname resolves to a real IP. The TCP connection to that IP on port 443 then times out. This rules out a DNS problem or a credentials/auth problem (the request never got far enough to authenticate) and points specifically to the backend host/network itself being unreachable — consistent with, and more precise than, R2's and R3's "full outage, not endpoint-specific" findings.

No alternate/backup backend URL exists anywhere in this repository's environment files (`.env.local`, `.env.local.backup`, `.env.example` all reference the same single `bankingvoicebot.nl-demo.com` host) — there was no fallback environment to try.

**This is now the third consecutive Ratio session (R2, R3, R4) to find this exact backend fully unreachable.** Worth flagging as an operational concern beyond this codebase's scope: if this pattern continues, the entire "verify against live data" objective for the Ratio Explorer work is structurally blocked until someone with access to the Call Centre backend's infrastructure investigates why it's been down for this long.

## 2. Live records/windows examined

**None.** No live call-data records could be retrieved. Sections 3–17 of the session prompt (verify real call-data semantics, verify FCR/Escalation Rate/AHT/Resolution Rate/Successful Resolution Time against real data, investigate Completion Rate/stage semantics, status=inactive vs completed, filter push-down, trend buckets, breakdowns, interaction evidence, previous-period comparison, population-cap testing) all require a reachable backend and could not be performed.

## 3–8. Ratio verification (FCR, Escalation Rate, AHT, Resolution Rate, Successful Resolution Time, Completion Rate)

**Not performed — correctly deferred, not guessed at.** Per the prompt's own explicit instruction: *"If the backend is STILL unavailable: DO NOT spend the session changing code based on guesses... Do not manufacture a reason to modify the application."* No formula, eligibility rule, or registry entry was touched this session. The R3 state (5 ratios direct/implemented, Completion Rate honestly `partial`) stands unchanged and unverified against real data for a third consecutive session.

## 9. Actual stage semantics discovered

**None — still unverified.** The backend outage means the one open question from R3 (whether `stage`'s real value set supports a defensible connected-vs-completed distinction) remains exactly as it was: unanswered. No new evidence, so no change to Completion Rate's `partial` status.

## 10. inactive vs completed findings

**Not tested.** Requires the live backend.

## 11. escalation_trigger findings

**Not tested.** Requires the live backend.

## 12. timestamp/timezone findings

**Not tested.** Requires the live backend.

## 13. filter push-down findings

**Not tested.** Requires the live backend.

## 14. population-cap findings

**Not tested.** Requires the live backend and real `pagination.total_records` values, neither available.

## 15. Bugs discovered

**None.** No verification was possible, so no defect could be confirmed or ruled out.

## 16. Corrections made

**None.** Per the correction-classification policy (§18 of the prompt: DATA CONTRACT FIX / CALCULATION FIX / FILTER FIX / TIMEZONE-BUCKET FIX / DRILL-DOWN FIX / DISPLAY-DISCLOSURE FIX), every correction must be driven by an "observed real behavior → existing assumption → why wrong → minimal correction" chain. With zero real observations available this session, zero corrections are defensible. Making a change anyway would be exactly the "modify working code merely to make the session appear productive" the prompt explicitly warns against.

## 17. Files modified

**None.** No `.ts`/`.tsx` file was touched. This report is the only artifact this session produces.

## 18. Structural verification

Not re-performed — R1/R2/R3 already established that the Ratio Explorer shell, routing, and component tree render without crashing under local dev (no live backend). Nothing changed since R3 that would invalidate that finding, and repeating an unchanged structural check would not be useful new verification.

## 19. Deterministic verification

Re-ran the existing suite as a sanity check that nothing regressed since R3 (no code was touched, so this is a confirmation, not new coverage):
```
npx esbuild src/server/analytics/ratioMath.ts --bundle --platform=node --format=esm --outfile=.tooling/tmp/ratioMath.mjs --external:../../types/*
node .tooling/scripts/ratio-math-verify.mjs
```
**17/17 passed**, identical to R3's result — confirms the R3 codebase is exactly as left, no drift.

`npx tsc --noEmit` — clean. `npm run build` — clean. `npm run lint` — 117 errors / 36 warnings, exact baseline match. All expected, since no source file changed.

## 20. Live verification

**Explicitly NOT performed for any of the 5 implemented ratios.** Per the verification matrix below and the session's own instruction not to collapse verification levels into one generic "tested" statement.

### Verification matrix

| Ratio | Structural | Deterministic | Live | Notes |
|---|---|---|---|---|
| FCR | ✅ (R1–R3, unchanged) | ✅ 17/17 suite (R3, re-confirmed) | ❌ not performed | Backend unreachable |
| Escalation Rate | ✅ (R1–R3, unchanged) | ✅ (R2/R3, re-confirmed) | ❌ not performed | Backend unreachable |
| AHT | ✅ (R1–R3, unchanged) | ✅ (R2/R3, re-confirmed) | ❌ not performed | Backend unreachable |
| Resolution Rate | ✅ (R3, unchanged) | ✅ (R3, re-confirmed) | ❌ not performed | Backend unreachable; Resolution+Escalation=100% invariant untested |
| Successful Resolution Time | ✅ (R3, unchanged) | ✅ (R3, re-confirmed) | ❌ not performed | Backend unreachable |
| Completion Rate | N/A (correctly unavailable) | N/A | ❌ not performed | `stage` semantics still unconfirmed; remains `partial` |

## 21. Regression confirmation

```
git status --short -- src api
```
returns **nothing** — the working tree is byte-identical to the end of R3. No file was touched, so there is nothing to regress. Dashboard, Analytics, Reports, Call Logs, Live View, Campaigns, QA Review, AI Agents, Orchestrator, User Management, Settings, and the sidebar are all trivially unchanged.

## 22. Recommended R5 scope

**R5 should be the same objective as R4** (live verification against the 5 implemented ratios, plus the Completion Rate/`stage` investigation), attempted again once the backend is confirmed reachable. Concretely, before starting R5:
1. Someone with access to the Call Centre backend's operations/infrastructure should investigate why `bankingvoicebot.nl-demo.com` has now been unreachable for 3 consecutive sessions — this is outside this repository's scope to fix, but worth escalating explicitly rather than continuing to silently defer.
2. If/when reachable, R5 can reuse this session's untouched R3 codebase directly — no catch-up work is needed, only the verification itself.
3. If the outage continues indefinitely, it may be worth a future session deciding whether a controlled, clearly-labeled one-time manual smoke test (e.g. the user personally running one `curl` against the backend from a different network, or checking with whoever operates the demo environment) is warranted, rather than repeatedly re-discovering the same outage from this environment.

Session stops here per the prompt's explicit instruction — R5 not begun, and per §18/§21, no code was changed since no real-data evidence was available to justify any change.
