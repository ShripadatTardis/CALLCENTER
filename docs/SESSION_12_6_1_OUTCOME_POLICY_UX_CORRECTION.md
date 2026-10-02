# Session 12.6.1 — Outcome Policy UX Correction (Addendum to Session 12.6)

Commit: `b6f148681ea3d469e7c11be270da88a286538291` (2026-10-02 12:57:02 +0530)
Deployment: `https://callcenter-6tjeclzgx-sk-tardis-projects.vercel.app` → aliased to production `https://callcenter-three-livid.vercel.app`, confirmed `● Ready` / Production.

## Change

Create Campaign → Outcome Policy → Agent Outcome Mapping no longer asks the campaign creator to select a Next Action per outcome. Each row now has a single, explicit purpose: map an Agent Outcome to the Campaign Classification that describes what it means for this campaign's objective. Explanatory copy updated to: *"Define what each Agent Outcome means for this campaign by mapping it to a Campaign Classification."*

## Why

Session 12.6's own audit found that `NextActionType` values beyond `close`/`retry` (`escalate`, `follow_up`, `move_campaign`) have no genuine execution path anywhere in the Campaign subsystem — `campaign_followups` exists but is never created automatically and has no UI trigger. Letting a campaign creator configure a Next Action in this step implied an automation that doesn't exist (visible in the pre-correction screenshot: "Wrong Person" → "Follow-up Required" classification paired with a "Close" next action, a confusing, meaningless combination with no real effect).

## What did not change

- Schema/snapshot: `OutcomePolicyMapping.nextActionType` is untouched — still present in the type and the stored jsonb shape, always `null` for mappings created from this UI now. No migration needed or performed.
- `NextActionType` vocabulary and `campaign_followups` architecture: untouched, left exactly as 12.6 found/left them, ready for a future session to wire up once a configurable action has somewhere real to execute.
- Launch completeness validation: still blocks Launch Now (not Save as Draft) when any advertised outcome lacks a Campaign Classification — unchanged, and was never based on Next Action in the first place.
- All server-side runtime classification, immutable policy snapshot capture, contract-drift handling, the system-configured classification master (table + live API), statistics, and legacy compatibility — all exactly as Session 12.6 left them. No backend file was touched this pass.

## Verification

Pure UI-layer change (`src/pages/CreateCampaign.tsx` only). `tsc`/build/lint clean at the established baseline (117/36). Full regression suite re-run, all unchanged: 12.4 idempotency **15/15**, 12.4.1 mapping-uniqueness **9/9**, 12.5 structured-outcomes **24/24**, 12.6 outcome-policy **23/23**, Ratio Explorer **17/17** / **22/22**.

Live-verified in the browser against the real EMI Reminder agent: every advertised outcome row shows only Agent Outcome (display name, code, description) and a single Campaign Classification selector — no Next Action control anywhere. No campaign was created or launched (session named "SESSION 12.6.1 UI VERIFICATION - DO NOT LAUNCH", abandoned mid-flow). No telephone call was placed.
