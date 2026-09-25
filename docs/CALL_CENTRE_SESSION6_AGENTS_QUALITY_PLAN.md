# Session 6 — AI Agents + Quality / Runtime Visibility: Plan (audit-only)

**Status: planning/audit only, per instruction. No implementation in this session.**
The Voice Agent demo server (`https://bankingvoicebot.nl-demo.com`) is currently unavailable (502). Per instruction, this is **not** treated as evidence any API is broken — every claim below is sourced from API docs, existing code, or demo-UI screenshots, and labeled accordingly. Live-only checks are listed in §21 as deferred, not guessed.

**Source-labeling key used throughout:**
- **[API-DOC]** — confirmed by a vendor `.docx` in `docs/` (the public `https://bankingvoicebot.nl-demo.com/api/v1/*` integration surface this project actually has credentials for).
- **[CODE]** — confirmed by reading this repo's current implementation.
- **[DEMO-UI]** — visible only in the demo dashboard's own screenshots or its `Voicebot_Dashboard_User_Guide.docx`, which documents the demo web app's *own* internal UI (served from its own backend, typically `:3000`/`:5050`), not the public integration API this project calls. **This is a different surface** — nothing in the demo UI's user guide is, by itself, evidence of a documented `/api/v1/*` endpoint.
- **[DEFERRED]** — requires a live call against the now-down backend; cannot be verified this session.

---

## 1. Audit of current AI Agents/Quality code

**`src/pages/AIAgents.tsx`** — **entirely mock** **[CODE]**. It calls `useIndustryData()` (the generic industry-mock generator, unrelated to `useAgents()`/`GET /api/v1/agents`) and then, per-row, fabricates:
- `status`: hardcoded `index === 0 ? 'engaged' : index === 1 ? 'idle' : 'awaiting_input'` — not a real backend concept anywhere in this project (this exact fake-status problem was already identified and removed once before, in `AgentActivityPanel.tsx`'s own doc comment: *"Replaces the previous fake 'AI Agent Status' treatment... none of which the backend supports as a per-agent state"* — `AIAgents.tsx` itself was apparently never converted when that fix landed elsewhere).
- `successRate`: `Math.random() * 0.2 + 0.8` — pure fabrication.
- `totalCalls`: `Math.floor(Math.random() * 100) + 50` — pure fabrication.
- `engagementTime`: `Math.floor(Math.random() * 300) + 60` — pure fabrication.
- **"Create Agent" button** — opens `AgentConfiguration` dialog; no backend endpoint exists to create an agent (the documented `/api/v1/agents` contract is read-only — `GET` only, no `POST`/`PUT`/`DELETE` documented anywhere). **No-op / misleading.**
- **Settings (configure) button** — opens the same `AgentConfiguration` dialog against a fabricated `agentId`.
- **Play/Pause buttons** — no handler beyond icon toggling; no backend concept of pausing an agent exists. **No-op / misleading.**

**`src/components/ai-agents/AgentConfiguration.tsx`** (383 lines) — a full-looking configuration dialog (name, persona, capabilities, etc.) with no persistence and no real endpoint behind it. **Entirely mock/no-op.**

**`src/data/sampleAIAgents.ts`** — static sample data, superseded by the real `/api/v1/agents` roster everywhere else in the app but still present and unused-except-by-`AIAgents.tsx`'s transitive `useIndustryData()` path.

**Contrast — what's already real, elsewhere in the same codebase:**
- **`src/hooks/agents/useAgents.ts`** → **`src/services/agents/agentsService.ts`** → `api/agents/index.ts` → live `GET /api/v1/agents` **[CODE]/[API-DOC]**. This is the real roster, already used correctly by:
  - Initiate Call (agent dropdown)
  - Chat Console (agent selector, now genuinely bound to the session per Session 5.1)
  - Campaigns (`campaign.agentId`, Create Campaign's agent selector)
  - Customer 360 category mapping (`customer360_category_agents`, seeded 1:1 from the live roster per Session 4/Customer 360 population work)
  - **`src/components/agents/AgentActivityPanel.tsx`** (used on `Dashboard.tsx` and `LiveView.tsx`) — already real: shows `agentId`/`displayName`/`direction`/`language`/`personaName` from the live roster plus a genuinely-derived "N active calls" count (grouping live `call-data?status=active` rows by `agent_id`). Its own doc comment explicitly documents why it deliberately shows **no** status label for a zero-active-call agent ("a fact, not an inferred state") — this is the correct precedent Session 6's Agent Detail should extend, not replace.

**Conclusion: agent identity is already unified across Voice/Chat/Customer 360/Campaigns [CODE]** — the *only* place still disconnected from the real roster is the standalone `AIAgents.tsx` page itself and its two child components. Session 6 does not need to invent identity unification; it needs to retire one page's mock data and build a real operational view using the roster (and per-agent aggregation) that already flows correctly everywhere else.

**QA/Quality — adjacent existing module, out of direct scope but relevant context:** `src/pages/QAReview.tsx` + `src/components/qa/QualityScoring.tsx` exist as a separate, already-present "QA Review" sidebar item. Not audited in depth here (it predates and is broader than Session 6's brief), but flagged: if it displays fabricated quality scores, that is a pre-existing gap outside this session's scope — Session 6 must not add a *second*, differently-sourced quality-score concept without reconciling with it. Recommendation (not for this session): a future session should audit `QAReview.tsx` on its own terms before Session 6's Quality/Runtime concept and QA Review risk presenting two different "quality" numbers for the same interaction.

**Navigation/permissions** — `AI Agents` currently sits as its own top-level sidebar item (`permission: 'view_all_dashboards'`), separate from `AI Orchestrator` (a different, already-known-to-be-disconnected-from-backend module per `docs/CALL_CENTRE_FULL_FUNCTIONAL_SCOPE.md` — Orchestrator has zero relation to the Voice Agent APIs and is out of scope for Session 6 entirely; no overlap).

---

## 2. Mock/no-op inventory

| Item | Location | What it is | Disposition |
|---|---|---|---|
| Fake status (`engaged`/`idle`/`awaiting_input`) | `AIAgents.tsx` | Hardcoded by row index | **Remove.** No backend concept exists; `AgentActivityPanel`'s "N active calls" fact is the correct real replacement. |
| Fake success rate | `AIAgents.tsx` | `Math.random()` | **Remove.** Replace with real FCR/resolution-rate derived per §7/§9 below, or omit if not derivable for a given agent. |
| Fake total calls / engagement time | `AIAgents.tsx` | `Math.random()` | **Remove.** Replace with real counts from `call-data`/`chat/sessions` grouped by `agent_id`. |
| "Create Agent" button | `AIAgents.tsx` | No-op / opens a dialog with nothing behind it | **Remove.** No documented API to create an agent — the roster is backend-owned. |
| "Configure" (Settings) button + `AgentConfiguration.tsx` | `AIAgents.tsx` | No-op, no persistence | **Remove** in its current form. A future read-only "Agent Detail" replaces it (§3), not a configuration editor. |
| Play/Pause buttons | `AIAgents.tsx` | No-op | **Remove.** No backend concept of pausing an individual agent. |
| `sampleAIAgents.ts`, `useIndustryData()`'s agent branch | `src/data/`, `src/hooks/useIndustryData.ts` | Static/generated mock | **Remove usage from Agents module** (file may still be used elsewhere for unrelated industries' mock screens — verify no other consumer before deleting the file itself, same discipline as Session 5's `industryCampaignGenerator.ts` retirement). |

**No operational mock data is proposed to survive Session 6's implementation**, per the prompt's explicit requirement.

---

## 3. Confirmed agent API capabilities

`GET /api/v1/agents` **[API-DOC]/[CODE]** (confirmed live in Session 1, `src/types/api/agents.ts`):

```
{
  "success": true,
  "default_agent_id": "inbound-banking-default",
  "agents": [
    { "agent_id": "...", "display_name": "...", "persona_name": "...",
      "direction": "inbound"|"outbound", "language": "...", "is_default": bool }
  ]
}
```

This is **read-only** — no documented write/create/update/delete for agents anywhere in the four API docs reviewed for this project (Trigger Call, Session Transcript, Call Data, Chat Mode/Sessions/Transcript, Analytics Metrics). **Do not plan any agent-editing UI.**

Cross-module identity confirmed **[CODE]**: every consumer (Initiate Call, Chat, Campaigns, Customer 360 category seeding, `AgentActivityPanel`) keys strictly on `agent_id` from this one roster. Session 6 must do the same — **no second agent identity model.**

---

## 4. Tools/capabilities API audit

The demo screenshots show a "Tool Selector" panel (9 tools: `get_account_details`, `get_transaction_history`, `get_card_details`, `get_loan_status`, `get_fixed_deposit_details`, `get_customer_profile`, `get_customer_portfolio`, `block_card` [tagged `ACTION`], and a 9th tool not fully visible in the captured screenshot) with per-tool enable/disable toggles and "Preview disabled message." **[DEMO-UI]**

`Voicebot_Dashboard_User_Guide.docx` §11 documents this panel in detail **[DEMO-UI]** — but confirms it as a feature of the **demo dashboard's own web UI** (opened via a `Tools` button in that app's own top bar, talking to that app's own backend at `:5050`/`:3000`), explicitly framed as *"a testing feature — it lets you see how the bot copes when a banking system is down."* Nothing in this document, or in any of the four `/api/v1/*` docs reviewed, describes a public integration endpoint for:
- listing tools
- reading tool enabled/disabled state
- tool → agent mapping
- writing/toggling tool state

**Audit result: no documented API exists for any of this.** Tools stays **demo-visible-only, integration-unconfirmed [DEMO-UI]**.

**Recommendation, per the prompt's explicit guardrail** ("do not plan writable controls as if they already work; propose read-only placeholders only if genuinely useful, otherwise defer"): **defer entirely.** A read-only placeholder would have nothing real to display (this project has no confirmed way to fetch even the *list* of tools, let alone their state) — inventing a static list from the screenshot would itself be exactly the kind of demo-UI-copying the prompt prohibits. **Do not build a Tools tab in Session 6.**

---

## 5. Quality model

"Quality" is defined here **only** from fields already confirmed real and flowing through this app today — no new scoring is invented. Sources, all **[CODE]**/**[API-DOC]** (already ingested by Customer 360/Campaigns per Sessions 4–5.2):

| Signal | Source field | Already in this app? |
|---|---|---|
| Outcome | `call-data.outcome` / `campaign_results.call_outcome` | Yes — `Interaction.outcome`, `campaign_results` |
| FCR | `call-data.fcr` (boolean) | Yes — `Interaction.fcr` |
| Intent accuracy/confidence | `call-data.intent_accuracy` (voice) / Chat's `confidence` (0–1, per turn) | Yes — `Interaction.intentAccuracy`; chat `confidence` ingested via `chatInteractionSource.ts` |
| Sentiment | `call-data.sentiment_score` | Yes — `Interaction.sentimentScore` (voice only; no documented chat sentiment field) |
| Escalation | `call-data.escalation_trigger` / `analytics.escalation_rate` | Yes |
| Authentication | `call-data.wasAuthenticated` (voice) / Chat's `authenticated` (per session) | Yes, both channels |
| Call duration / AHT | `call-data.duration_seconds`/`aht_seconds` / `analytics.avg_aht_seconds` | Yes |
| Campaign result | `campaign_results.is_success` (explicit, configured, never inferred — Session 5's house rule) | Yes |
| Chat intent/confidence | Chat Session API's `intent`/`confidence`/`data_source`/`detection_method` (Session 5.1) | Yes |
| Latency | `call-data`'s implicit timing / `analytics.avg_turn_latency_ms`/`p95_turn_latency_ms` (aggregate only — see §8) / Chat's `latency_ms` (per turn) | Yes, aggregate voice + per-turn chat |

**Separation, per the prompt's explicit requirement — three distinct categories, never blended into one number without saying so:**

1. **Business outcome quality** — did the interaction achieve its purpose? Sources: `outcome`, `fcr`, `escalation_trigger` (voice); `campaign_results.is_success` (campaigns); resolved-vs-escalated share (chat has no explicit outcome field today — only `status: active|completed`, which is a *session lifecycle* state, not a business outcome; **chat business outcome is not currently derivable** and must not be fabricated).
2. **Conversational quality** — did the AI understand/respond appropriately? Sources: `intent_accuracy`/chat `confidence`, `sentiment_score` (voice only), `authenticated`.
3. **Technical/runtime quality** — was it fast/available? Sources: `avg_turn_latency_ms`/`p95_turn_latency_ms`/`live_concurrent_calls`/`peak_concurrency` (aggregate, from Analytics), chat's per-turn `latency_ms`.

**No composite score is proposed in this plan.** Per the prompt ("Do not create arbitrary scores unless every component and formula is explicitly defined... must be transparent and optional"), Session 6's Agent Detail should show these three categories' real, named fields side by side, not collapse them into a single number. If a future session wants a composite, it would need an explicit, documented formula approved separately — out of scope here.

---

## 6. Business vs conversational vs technical quality separation

Covered above (§5) — restated as the concrete UI rule: **Agent Detail's "Quality" section must be laid out in three visually distinct groups** (Business Outcomes / Conversational Quality / Technical Performance), each showing only its own real fields, with no cross-category derived score.

---

## 7. Agent performance aggregation sources

Every metric below has a named, real source. No field is proposed without one.

```
Agent
├── identity / direction / language     ← GET /api/v1/agents                              [API-DOC]
├── calls handled                        ← GET /call-data, grouped by agent_id/ai_agent_id [API-DOC]
├── chats handled                        ← GET /chat/sessions, grouped by agent_id         [API-DOC]
├── resolved / escalated                 ← call-data.outcome/escalation_trigger, aggregated [API-DOC]
├── FCR                                  ← call-data.fcr, aggregated                       [API-DOC]
├── AHT                                  ← call-data.duration_seconds/aht_seconds, avg      [API-DOC]
├── avg intent confidence                ← call-data.intent_accuracy (voice) +
│                                            chat/sessions.confidence (chat), averaged separately per channel [API-DOC]
├── avg turn latency                     ← analytics/metrics.avg_turn_latency_ms is GLOBAL, NOT
│                                            per-agent (see §8/§9 gap) — chat's per-session latency_ms
│                                            CAN be averaged per agent_id; voice per-agent latency has
│                                            no confirmed source                              [API-DOC gap]
├── campaign outcomes                    ← campaign_results (joined via campaigns.agent_id)  [CODE]
└── recent interactions                  ← call-data + chat/sessions, filtered by agent_id,
                                             sorted by started_at/updated_at, reusing existing
                                             list-fetch patterns                              [API-DOC]
```

**Named gap:** `GET /api/v1/analytics/metrics` is a **global aggregate** (optionally filtered by `direction`, never by `agent_id`) — it has `calls_by_agent: [{agent, count}]` **[API-DOC]** (a count breakdown, confirmed) but **no per-agent latency/FCR/AHT breakdown**. Per-agent operational numbers (FCR, AHT, resolved/escalated, avg confidence) must therefore be computed by **this app**, client- or server-side, from `call-data`/`chat/sessions` rows filtered/grouped by `agent_id` — not read pre-aggregated from Analytics. This is a real, load-bearing design decision, not a nice-to-have: it means Agent Detail's aggregation is **derived**, computed the same way Customer 360's `aggregationService.ts` already derives customer-level aggregates from raw interaction rows (same pattern, new grouping key).

---

## 8. Per-call runtime metrics audit

The demo's Call Metrics table shows, per call: **STT, TTFT, LLM, TTS TTFB, Turn Latency, Tool, RAG, Orchestrator** (all in ms), plus Concurrent Users. **[DEMO-UI]**, documented in `Voicebot_Dashboard_User_Guide.docx` §7.2.

Classification, checked against all four `/api/v1/*` docs actually available to this project:

| Metric | Classification | Basis |
|---|---|---|
| `avg_turn_latency_ms`, `p95_turn_latency_ms` | **Confirmed aggregate API** | `analytics/metrics.metrics.*` — window/direction-scoped, not per-call |
| `live_concurrent_calls`, `peak_concurrency` | **Confirmed aggregate API** | `analytics/metrics.metrics.*` |
| `latency_over_time`, `concurrency` series | **Confirmed aggregate API** | `analytics/metrics.charts.*` — bucketed time series, not per-call |
| Chat's `latency_ms` | **Confirmed per-interaction API** | Chat Session/Transcript API — one value per chat turn/session, real |
| Per-call STT / TTFT / LLM / TTS TTFB / Tool / RAG / Orchestrator latency | **Demo-visible only** | Only in the demo dashboard's own Call Metrics table; **no field for any of these exists** in `Call_data_API.docx`, `Trigger_Call_API.docx`, or `Session_Transcript_API.docx` — confirmed already in this project's own prior audits (`docs/CALL_CENTRE_LIVE_INTEGRATION_PLAN.md`: *"Turn latency, P95 latency, per-stage STT/LLM/TTS timing, GPU cost — Not in call-data at all... BACKEND_GAP"*) |
| Per-call "Concurrent Users" column | **Demo-visible only** | Same — not a documented `call-data` field |

**Do not assume the per-call breakdown API exists merely because the demo UI displays it** (per instruction) — confirmed: it does not, in any doc this project has. **Session 6 must not build a per-call runtime-metrics table.** The confirmed, real alternative is the *aggregate* Analytics data already scoped for Session 7 (§9).

---

## 9. Analytics API overlap

`GET /api/v1/analytics/metrics`'s full confirmed contract was already captured for a future Session 7 in `docs/CALL_CENTRE_SESSION4_5_CHAT_PLAN.md` (Session 5.1's addition) — `window`/`direction`/`date_from`/`date_to` filters; `metrics.{total_calls, calls_in_window, fcr_rate, avg_aht_seconds, escalation_rate, resolved_count, escalated_count, avg_intent_accuracy, live_concurrent_calls, peak_concurrency, avg_turn_latency_ms, p95_turn_latency_ms}`; `charts.{call_volume, latency_over_time, concurrency}`; `outcomes`; **`calls_by_agent: [{agent, count}]`**; `aht_distribution`. **[API-DOC]**

**Overlap with Session 6:** `calls_by_agent` is the *only* per-agent field this endpoint exposes — a simple count, useful as a cross-check for Agent Detail's own derived "calls handled" number, but not a replacement for it (it has no FCR/AHT/latency breakdown per agent). **Session 6 should not re-implement general Analytics** (that's Session 7's job) — it should, at most, read `calls_by_agent` as one supporting data point on Agent Detail, sourced from the same endpoint Session 7 will build its full dashboard from. No duplicate analytics endpoint should be added.

---

## 10. Langfuse/observability audit

Demo screenshots show a full self-hosted Langfuse instance at an **internal IP** (`106.51.70.119:3001`), **not** the public `bankingvoicebot.nl-demo.com` host this project integrates with — Traces (`voice_turn`, `chat_turn`), Model costs, and 183 Scores (`tts_ttfb_ms`, `stt_ms`, `turn_ms`, `llm_ms`, each with count/avg). **[DEMO-UI]**

Audit of `docs/*.docx` and the whole repo: **zero references** to a Langfuse API, a stored trace ID on any call/chat record, or any observability endpoint in any of the four confirmed integration APIs. The `Voicebot_Dashboard_User_Guide.docx` itself only says the demo dashboard's top bar shows a `Langfuse` link that "opens the detailed AI tracing tool in a new tab" (i.e. it's a raw external link into that separate internal Langfuse UI, not an API this project calls) — and even that link is explicitly gated: *"Only shown when tracing is switched on."*

**No integration exists. Per instruction ("prefer link to/source selected useful metrics over attempting to rebuild Langfuse... if integration is not documented, mark it deferred"): mark deferred.** Nothing to build in Session 6. If a future backend enhancement exposes a `trace_id` on `call-data`/`chat/sessions` rows, a simple "View trace" outbound link could be added trivially later — not now, since no such field exists today.

---

## 11. Resource/System Health audit

Demo screenshots show a full GPU/VRAM/CPU/RAM/Disk/Network dashboard with a live utilization-over-time chart. **[DEMO-UI]**, documented in `Voicebot_Dashboard_User_Guide.docx` §9 as the demo dashboard's own "Resources" tab — again explicitly a feature of that separate demo web app, with its own note: *"If you see 'GPU metrics unavailable', the dashboard hasn't been given access to the graphics cards... a setup matter for your administrator."* This confirms it's sourced from local host introspection inside the demo deployment, not from the public integration API surface.

**No documented API exists** in any of the four `/api/v1/*` docs for GPU/CPU/RAM/disk/network figures. **Audit result: unavailable to this project.**

Per the user's explicit stated preference in the prompt — *even if such an API were later confirmed* — this data would belong under **Admin/System Health**, not the AI Agents page, unless proven agent-specific (GPU/VRAM utilization is host-level, not per-agent, so it would never qualify). **Do not implement any resource/infrastructure monitoring in Session 6**, from screenshots or otherwise.

---

## 12. Agent Detail UX

One operational view, not many disconnected screens — per instruction. Proposed structure: `AI Agents` (list) → `Agent Detail` (one screen per agent, likely a route like `/ai-agents/:agentId` reusing the existing `Layout`/`Card`/`Tabs` shadcn components already used throughout this app), organized as tabs or stacked sections within one page:

1. **Identity** — `display_name`, `persona_name`, `direction`, `language`, `is_default` (straight from `/agents`).
2. **Activity** — calls handled, chats handled, recent interactions list (drill-down per §13).
3. **Quality** — the three-category breakdown from §5/§6, real fields only.
4. **Campaign outcomes** — for outbound agents only (`direction: outbound`), campaign result summary reusing Session 5's existing target-level `effective_result_id` success-rate pattern, scoped to this agent's campaigns.

No Tools tab (§4), no Resources tab (§11), no Langfuse tab (§10) — all three stay deferred/out of scope, consistent with the audits above.

---

## 13. Interaction drill-down reuse

Agent Detail's "recent interactions"/"calls handled"/"chats handled" lists must **link into existing detail mechanisms**, never build new ones **[CODE]**, reusing exactly what Sessions 3–5.2 already built:
- Voice → `InteractionDetailDialog` (already used by Call Logs and Customer 360's interaction timeline).
- Chat → `ChatSessionDetailDialog`, reading `GET /api/v1/chat/sessions/{id}` (Session 5.1).
- Campaign → `CampaignDetail.tsx`'s existing target/result views (Session 5).
- Customer 360 → the existing interaction timeline component.

No duplicate transcript/recording viewer is proposed.

---

## 14. QA/evaluation backend audit

No evaluation/QA API is documented anywhere in the four confirmed docs. **[API-DOC absence confirmed.]** No "AI QA score" will be fabricated. Per instruction, Session 6 distinguishes:
- **Available now**: the objective operational metrics in §5 (outcome, FCR, intent confidence, sentiment, escalation, AHT, campaign result, chat confidence, turn latency).
- **Future evaluator/QA capability**: a manual-review or automated-evaluator layer, **not defined or stubbed in this plan** — no fake review records will be created. If a future session wants this, it needs its own scoped plan once a real requirement/backend exists (note: this app already has a separate `QAReview.tsx`/`QualityScoring.tsx` module — see §1 — which should be reconciled with any future evaluator work rather than duplicated).

---

## 15. Exact real fields/metrics to implement

- Agent identity: `agent_id`, `display_name`, `persona_name`, `direction`, `language`, `is_default` — `GET /api/v1/agents`.
- Calls handled, chats handled — derived counts from `call-data`/`chat/sessions` grouped by `agent_id`.
- Resolved/escalated counts, FCR rate, AHT — derived from `call-data.outcome`/`.escalation_trigger`/`.fcr`/`.duration_seconds` grouped by `agent_id`.
- Avg intent confidence (voice: `intent_accuracy`; chat: `confidence`) — derived, kept per-channel, not blended.
- Chat avg turn latency (`latency_ms`) — derived, chat-only (voice has no per-agent latency source, see §7 gap).
- `calls_by_agent` count — read directly from `analytics/metrics` as a cross-check value only.
- Campaign outcomes for outbound agents — reused from Session 5's existing `campaign_targets`/`effective_result_id`/`campaign_results` model, scoped by `campaigns.agent_id`.
- Recent interactions list — `call-data`/`chat/sessions` filtered by `agent_id`, drill-down via existing dialogs (§13).

## 16. Exact fields/features to defer

- Tools/capabilities list, state, or toggle controls (§4) — no API.
- Per-call STT/TTFT/LLM/TTS TTFB/Tool/RAG/Orchestrator breakdown (§8) — no API.
- Per-call "Concurrent Users" column (§8) — no API.
- Langfuse trace links/embedding (§10) — no integration, no stored trace IDs.
- GPU/CPU/RAM/Disk/Network resource monitoring (§11) — no API; would belong under Admin/System Health if ever confirmed, not Agent page.
- Composite/blended quality score (§5) — no approved formula.
- Fabricated QA/evaluation scores (§14) — no backend.
- Agent create/edit/pause/configure controls — no write API.
- Per-agent voice turn latency — no source (chat-only latency is real; voice per-agent latency is not derivable from any confirmed field).
- Chat business-outcome classification — no confirmed field (`status: active|completed` is session lifecycle, not outcome).

## 17. API/backend gaps

1. No per-call runtime-stage latency breakdown (STT/LLM/TTS/Tool/RAG/Orchestrator) in any documented endpoint — demo-UI-only.
2. No per-agent latency/FCR/AHT aggregate endpoint — `analytics/metrics` is global/direction-scoped only, with `calls_by_agent` as its one per-agent field (count only).
3. No Tools list/state/mapping API.
4. No Langfuse integration API or stored trace-ID field on any interaction record.
5. No GPU/CPU/RAM/disk/network resource API.
6. No QA/evaluation API.
7. No agent write/create/update/delete API (roster is read-only, backend-owned).
8. No chat business-outcome field (only session lifecycle `status`).

## 18. Exact routes/services/hooks/components

**No new serverless route required** — everything Session 6 needs is either already-exposed data (`/agents`, `/call-data`, `/chat/sessions`, `/analytics/metrics`, campaign tables) or client/service-side aggregation over data already fetched by existing hooks. Proposed:

- `src/services/agents/agentPerformanceAggregator.ts` — pure functions grouping `Interaction[]`/`ChatSession[]`/`CampaignTarget[]` by `agentId`, mirroring `src/server/customer360/aggregationService.ts`'s existing aggregation-math pattern (client-side or a thin server helper — decide at implementation time based on payload size; likely client-side, since this is read/derived-only, not persisted).
- `src/hooks/agents/useAgentDetail.ts` — composes `useAgents()` + existing calls/chat/campaign hooks, filtered by `agentId`.
- `src/pages/AgentDetail.tsx` (new) — the single operational view (§12).
- `src/pages/AIAgents.tsx` — rewritten to use `useAgents()` (real roster) instead of `useIndustryData()`, linking each row into `AgentDetail`.
- Remove: `AgentConfiguration.tsx`'s usage from `AIAgents.tsx` (component itself can be deleted if genuinely unused elsewhere — verify first, same discipline as every prior session's mock retirement).
- Reuse, unchanged: `AgentActivityPanel.tsx`, `InteractionDetailDialog`, `ChatSessionDetailDialog`, `CampaignDetail.tsx`'s target/result views.

## 19. Vercel function-count impact

**Zero new serverless functions.** Every data source Session 6 needs (`/agents`, `/call-data`, `/chat/sessions`, `/analytics/metrics`, campaign RPCs) is already exposed via existing routes (`api/agents/index.ts`, `api/calls/data.ts`, `api/chat/logs.ts`, and campaigns via `api/campaigns.ts`). Aggregation is a client/service-layer concern, not a new backend route. Function count remains **11**.

## 20. Verification plan (once approved and implemented)

1. `tsc --noEmit`, `npm run build`, `npm run lint` — zero new errors.
2. Confirm `AIAgents.tsx` shows the real roster (`GET /api/v1/agents`) — same list Initiate Call/Chat/Campaigns already show, no divergence.
3. Confirm `Math.random()`-based fields are gone (grep for `Math.random` in the agents module — should return zero matches).
4. Confirm Agent Detail's counts (calls handled, chats handled) match manual counts from `call-data`/`chat/sessions` filtered by that `agent_id`, via the Supabase MCP / direct API cross-check.
5. Confirm no Tools/Langfuse/Resources UI was added.
6. Confirm campaign-outcome section only appears for `direction: outbound` agents and reuses Session 5's `effective_result_id` logic unmodified (no new success-rate formula invented).
7. Confirm function count still 11 (`find api -name "*.ts" ! -name "_*" | wc -l`).
8. `git diff --stat` — confirm only the files in §18 changed; no Campaigns/Customer 360/Chat domain logic touched.

## 21. Live checks deferred due to backend outage

- A real `GET /api/v1/agents` call reflecting any roster change since Session 1's original capture (unlikely to have changed, but not re-verified live this session).
- Real-time cross-check of Agent Detail's derived counts against a *live* `call-data`/`chat/sessions` fetch (today's verification, once implemented, will need to run against whatever data is already in Supabase from prior sessions' backfills, not a fresh live pull).
- Confirming `calls_by_agent` from a live `analytics/metrics` call actually matches this app's own derived per-agent count (cross-check deferred).
- Any check that would require a new live voice/chat interaction to be created during Session 6 implementation.

---

## Recommended Session 6 scope (summary)

**Build:** rewrite `AIAgents.tsx` on the real roster; add one `AgentDetail` page with Identity/Activity/Quality(3-category)/Campaign-outcomes sections, all client/service-derived from already-confirmed real endpoints; drill-down links into existing detail dialogs; zero new serverless functions.

**Do not build:** Tools panel, per-call runtime-metrics table, Langfuse integration, Resource/System Health monitoring, any composite quality score, any fake QA/evaluation records, any agent create/edit/pause control.

**Stop after this plan, per instruction.** Awaiting approval before implementation.
