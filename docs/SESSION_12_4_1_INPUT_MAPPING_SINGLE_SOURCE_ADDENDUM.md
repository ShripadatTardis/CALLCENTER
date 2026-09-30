# Session 12.4.1 — Campaign Input Mapping: Enforce Single Source Usage (Addendum to Session 12.4)

Prompt: `prompts/callCprompt 76 12.4 Campaign Input Mapping Enforce Single Source Usage.txt`
Commit: `18164f4f54ccd753f5a526560fbd9a39407675f4` (2026-09-30 20:22:58 +0530)
Deployment: `https://callcenter-pojsp39lm-sk-tardis-projects.vercel.app` → aliased to production `https://callcenter-three-livid.vercel.app`, confirmed `● Ready` / Production.

## 1. The gap

Session 12.4's new Input Mapping step let two different agent inputs be mapped to the same source field — e.g. the same CSV column `customerReference` assigned to two agent inputs, or the same Customer 360 field (`phone_number`) assigned to two agent inputs. Nothing prevented it in the UI, and nothing rejected it server-side; the campaign runner would have had no principled way to know which of the two duplicate mappings was actually intended.

## 2. Single source of truth for the rule

`validateMappingSourceUniqueness` in `src/server/campaigns/inputMapping.ts`, keyed by `` `${sourceType}:${sourceField}` `` — deliberately the source type + field, never the display label, so `csv:phone` and `customer360:phone` never collide with each other despite sharing a label. Returns `{ valid, duplicateSourceKeys }`, where `duplicateSourceKeys` names each colliding key concretely (e.g. `csv:customerReference`) for a concise, unambiguous message.

A frontend mirror, `src/lib/campaignInputMappingUniqueness.ts`, holds an independently-typed copy of the identical logic — this matches the codebase's existing convention (a frontend-safe type file mirroring a server-only one, e.g. `src/types/campaign.ts` vs `src/server/campaigns/types.ts`) rather than having the React UI import directly from `src/server/*`. The server copy is authoritative and is what's actually enforced at the persistence boundary.

## 3. Enforcement — two layers

- **Persistence boundary** (`api/campaigns.ts`'s `handleSetInputMappings`): calls `validateMappingSourceUniqueness` on the incoming `mappings` array and returns `400` with `{ detail, duplicateSourceKeys }` before ever calling `repo.setInputMappings`, if any duplicate exists. This is what makes the rule real: a stale or manipulated client payload containing duplicate mappings cannot be persisted, regardless of what the UI did or didn't prevent — the campaign runner never has to guess which duplicate mapping was intended, because a duplicate mapping can never reach it.
- **React UI** (`src/pages/CreateCampaign.tsx`, Input Mapping step): each agent input field's Customer 360 / CSV column dropdown now excludes whatever source every *other* field has already selected (`sourceKeysUsedByOtherFields`, a plain derived `Set` recomputed from `fieldMappings` on every render — nothing to "release" separately; changing or clearing a mapping frees its source for the others on the very next render). A concise inline red warning plus a Launch-blocking `blockers` entry remain as defense in depth against any state the UI's own prevention didn't catch (e.g. if `fieldMappings` were ever set from an unexpected code path).

## 4. Preserved from Session 12.4, unchanged

Mappings are still driven dynamically off the selected agent's real, live contract (no hardcoded EMI-specific logic anywhere in this fix). Required fields still block Launch Now (not Save as Draft) when unmapped — `validateInputMapping`'s missing-required-field check is untouched and re-verified (test 8 below). Optional fields may remain unmapped. Undeclared agent inputs are still never sent (`triggerCallPayload.ts` unchanged this session). Backend Trigger Call validation remains authoritative.

## 5. Tests

New: `.tooling/scripts/campaign-mapping-uniqueness-verify.mjs`, run against the real esbuild-bundled `inputMapping.ts` (not a reimplementation) — **9/9 assertions passed**:
1. duplicate CSV source rejected
2. duplicate Customer 360 source rejected
3. different CSV columns accepted
4. different Customer 360 fields accepted
5. same apparent field/label across different source types does not collide (`csv:phone` vs `customer360:phone`)
6. removing/changing a mapping releases the source for reuse
7. multiple simultaneous duplicate groups are all reported (bonus, beyond the prompt's list)
8. existing required-field validation (`validateInputMapping`) remains intact and unaffected

Regression: the existing Session 12.4 idempotency/contract suite (`campaign-idempotency-verify.mjs`) re-run unchanged — **15/15 passed**. `tsc --noEmit`, `npm run build`, `npm run lint` all clean at the established baseline (117 errors / 36 warnings, unchanged from Session 12.4).

## 6. Live deployment verification

Deployed to production and aliased (`callcenter-three-livid.vercel.app`, `● Ready`, Production). Verified in the browser end-to-end on the real deployed Input Mapping step, using a synthetic, clearly-named draft campaign ("SESSION 12.4.1 UI VERIFICATION - DO NOT LAUNCH") with a synthetic single-row CSV (columns: `name`, `phone`, `customer_reference`, `emi_amount_raw`, `due_date_raw`) against the real EMI Reminder agent (8 live input fields):

- Mapped **Customer Name** → CSV column `emi_amount_raw`. Opening **EMI Amount**'s CSV column dropdown showed only `due_date_raw` and `customerReference` — `emi_amount_raw` was correctly excluded (already used by Customer Name).
- Mapped **EMI Due Date** → Customer 360 `Phone number`. Opening **Loan Type**'s Customer 360 field dropdown showed only `Customer 360 reference (CIF)` — `Phone number` was correctly excluded.
- Changed **EMI Due Date**'s mapping from `Phone number` to `Customer 360 reference (CIF)`. Re-opening **Loan Type**'s dropdown immediately showed `Phone number` available again — confirming release-for-reuse happens live, with no separate action needed.
- With all 3 required fields mapped and no duplicates, neither the "required fields unmapped" nor the "duplicate source mapping" warning rendered — confirming both warnings are conditional, not always-on.

**No campaign was created, saved, or launched.** The wizard was abandoned mid-flow (browser tab closed without ever reaching or submitting Review & Launch), and no telephone call was placed at any point. Phase E's historical evidence (campaign `b0de9fae-...`, target `7c319e38-...`, execution `32d6e4bb-...`, call `45237051-...`) was not touched by this session.

## 7. Confirmation

The single-source-usage rule is now enforced at both the campaign configuration UI and the persistence boundary, using one authoritative pure function (`validateMappingSourceUniqueness`) mirrored on the frontend for UI-side prevention. No real campaign was created or launched, and no telephone call was placed, during verification.
