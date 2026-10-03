# Session 13.4 — Campaign Configuration History Exposure (DEC-CAMP-01)

**Scope:** expose the configuration-version provenance Session 12.7 already built and captures (`campaign_configuration_versions`, versioned `campaign_agent_input_mappings`, `campaign_audit_events`) but which the UI never showed as a history. This is exposure/provenance only — no change to how configuration versions are created, how concurrency is enforced, or how the Campaign Runner/reconciliation resolve a version. The existing "Configuration" (edit) and "History" (audit log) buttons on Campaign Detail are both untouched.

---

## 1. What was already there, confirmed by inspection

- `call_center_campaign_list_configuration_versions` / `call_center_campaign_get_configuration_version` RPCs, and the repository methods/API actions (`listConfigurationVersions`, `getConfigurationVersion`) already existed and were already being called by the frontend — but only to resolve `activeConfigurationVersion.id` for `CampaignSettingsDialog`'s optimistic-concurrency check. The full version list was fetched and discarded, never rendered.
- `campaign_agent_input_mappings` rows are tagged with `configuration_version_id` (Session 12.7) and the server-side `CampaignAgentInputMapping` type already carried `configurationVersionId` — but **the frontend-facing type (`src/types/campaign.ts`) was missing this field**, even though the API (`call_center_campaign_get`) already returns it on every row. This is the one genuine type-exposure gap found: the data was already flowing over the wire, just untyped/unused on the client. Fixed by adding `configurationVersionId: string | null` to the frontend `CampaignAgentInputMapping` interface — zero runtime change, purely a type correction.
- `call_center_campaign_get`'s `mappings` array returns **every mapping row for the campaign across all versions, unfiltered** (confirmed by reading the live SQL: `select ... from campaign_agent_input_mappings m where m.campaign_id = p_id`, no `configuration_version_id` filter). Each `createConfigurationVersion` call always inserts a full, self-contained set of mapping rows for the new version (either the caller's new set, or the base version's rows copied forward unchanged) — so grouping the full mapping array client-side by `configurationVersionId` reconstructs each version's exact mapping set with no backend change needed.
- `campaign_result_rules` (the "legacy" generic-result rule table) are **not** dead — `reconcileExecutions.ts` actively uses them (`deriveCampaignResult`) to compute every target's generic Current Result (`campaignResultCode`/`campaignResultLabel`/`isSuccess`) on every reconciliation, completely independent of the newer Agent Outcome / Campaign Classification layers. They are not versioned (no `configuration_version_id` column) — a flat, campaign-level rule set.

## 2. What was built

**`src/lib/campaignConfigurationDiff.ts`** (new, pure, no React) —
- `buildConfigurationVersionViews(versions, allMappings, current)` — groups the campaign's full mapping-row array by `configurationVersionId` and pairs each group with its version row, sorted current-first (versionNumber descending). When a campaign has never been edited since launch (`versions.length === 0`), synthesizes a single "v1 (current, unversioned)" view from the campaign's own live columns and the mapping rows whose `configurationVersionId` is still `null` — never fabricated, just a relabeling of the campaign's actual current state, matching the "v1 only" case.
- `diffConfigurationVersions(prev, curr)` — a deterministic structural diff between one version and the one immediately before it: Agent changed, Agent Contract changed (input/outcome/output field-set signature comparison), Input Mapping added/removed/changed per field code, Outcome Mapping added/removed/changed per outcome code. No AI/LLM summarization anywhere; an entry is only ever pushed when the two sides are provably different, so unchanged fields are never reported as changed.

**`src/components/campaigns/CampaignConfigurationHistory.tsx`** (new) — read-only dialog content:
- One collapsible row per version (current highlighted with a "Current" badge and cyan accent border, others "Superseded"; the synthetic v1 case additionally badged "unversioned"), showing version number, Agent, created-at/by, and the change reason when present.
- A structural diff against the previous version shown inline under each row ("No changes from vN." when the diff is genuinely empty — never silently omitted).
- Expanding a row (disclosure button, `aria-expanded`/`aria-controls`) reveals the full read-only detail: contract field counts, the version's own Input Mapping table, and Outcome Mapping table.
- A separate, non-versioned "Legacy Result Rules" section at the bottom (only rendered when the campaign actually has rows), explicitly labeled and explained as still governing the generic Current Result independently of Outcome Mapping — satisfying §6 without reviving legacy rules as the current structured-campaign model.
- Nothing in this component ever calls `createConfigurationVersion`/`updateDraft`/any mutation — purely a `useCampaignConfigurationVersions` read plus client-side grouping of data the parent already fetched.

**`src/components/campaigns/CampaignDetail.tsx`** — added a "Config History" button (next to the existing "Configuration"/"History" buttons) opening the above in a `Dialog`, read-only, never invoking campaign edit behavior. Also extended `AgentResultDialog` (the existing per-target result drill-in) with a "Configuration" line resolving `target.latestConfigurationVersionId` against the already-fetched `configurationVersions` list — satisfying the execution-provenance requirement ("this execution ran under configuration vN") at the one place execution-level attribution is already available on the frontend (`CampaignTargetRow.latestConfigurationVersionId`, the most recent execution's version; there is no separate execution-list endpoint, and adding one would have been new backend behavior, out of scope for an exposure-only session). A target whose latest execution predates configuration versioning (or whose campaign has never been versioned) honestly shows "Unversioned (pre-12.7 or never-edited campaign)" rather than guessing.

## 3. Current vs historical, and read-only guarantee

The "Current" badge is driven by `status === 'active'` on the real version row (or the synthetic v1, which is always `status: 'active'` by construction when there's only one). Every control inside `CampaignConfigurationHistory` is inert display — no form inputs, no Save/Cancel, no destructive action. Opening a historical (superseded) version's detail cannot trigger `CampaignSettingsDialog`'s edit flow; the two are entirely separate components reached by separate buttons.

## 4. Known, pre-existing, NOT fixed (out of scope)

While building this feature, reading `call_center_campaign_get`'s mapping query surfaced a real latent correctness gap in `CampaignSettingsDialog.tsx`: its initial `fieldMappings` state is built from `campaign.mappings` (`Object.fromEntries(campaign.mappings.map(...))`), which — as confirmed above — contains **every mapping row across every version, ordered by `agent_input_field_code`, not by version**. For a campaign with two or more configuration versions whose mappings share the same field code with different source values, the Settings dialog's initial state could non-deterministically reflect a stale (superseded) mapping rather than the current one. This is a pre-existing gap from Session 12.7, lives entirely inside the Campaign edit workflow, and §7 of this session's scope explicitly forbids touching that workflow — so it is documented here, not fixed. A future session should scope `CampaignSettingsDialog`'s initial state to only the active version's mapping rows (filter by `configurationVersionId === activeConfigurationVersion.id`, the same grouping logic this session's `buildConfigurationVersionViews` already does correctly for display).

## 5. Tests

`.tooling/scripts/campaign-configuration-history-verify.mjs` (17/17 passing, against the real esbuild-compiled `campaignConfigurationDiff.ts`), covering the full §8 list: v1 only (synthesized, zero real version rows), v1 → v2 (Agent unchanged, Agent Contract changed, Input Mapping added, unchanged mapping correctly NOT reported), a dedicated Agent-changed case, a dedicated Outcome-Mapping-changed case with no cross-area noise, and a fully-identical-consecutive-versions case producing an empty diff (unchanged data never reported as changed). Legacy-campaign-without-versions is exercised by the same v1-only case (an empty `versions` array is exactly that state). Legacy-rule-handling is a plain passthrough render (the component shows whatever `campaign.rules` already contains) with no derived logic to unit test — verified live instead (see below). No campaign was launched to manufacture history; all cases use literal fixture data shaped like the real contract/mapping/policy snapshots.

## 6. Verification

- `npm run typecheck` — 0 errors. `npm run build` — clean. `npx eslint` on every touched file — 0 errors.
- `npm run verify:full` — all suites green, including the new 17/17 and every pre-existing suite unchanged.
- HIG design review performed jointly with Session 13.5 (see the combined report in that session's completion notes) — findings addressed before commit.
- Live browser verification against the deployed app: see the combined Integration section of the final completion report (Campaign Detail → Config History → a real campaign's version list, expand a version, confirm the diff and Legacy Result Rules sections render correctly).

## 7. Decision Register

`DEC-CAMP-01` marked implemented after deployed verification succeeded — see `docs/CALL_CENTRE_PHASE_4_DECISION_REGISTER.md`.
