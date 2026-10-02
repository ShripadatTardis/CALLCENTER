# Call Centre Functional Product Audit — Phase 1: Existing Functional Screen Inventory

**Scope:** Factual inventory of every existing screen/function as implemented today. Not a redesign, not a gap analysis against Supabase/backend capability (that is Phase 2), not a prioritization (Phase 3/4). Per `prompts/callCprompt 81 Call Centre Functional Product Audit .txt`.

---

## 1. Audit scope and methodology

The repository (`C:\projects\call-center`) was inspected directly — route definitions, sidebar navigation config, page components, subordinate dialogs/detail views, hooks, services, BFF/API routes (`api/*.ts`), Supabase repository/RPC call sites, and Supabase Edge Functions — using the live implementation as the sole authority for "what exists today." Prior session documentation (`docs/SESSION_*.md`, `docs/SCREEN_REVIEW_*.md`) was consulted only to understand *why* something was built, never as evidence that it currently works.

Nine parallel research passes, each covering a cluster of related functional areas, independently inspected their area's routes/pages/components/hooks/services/API routes with file:line citations, then this document consolidates their findings into one consistent structure. No code, database, configuration, or documentation other than this deliverable was modified during this audit.

---

## 2. Actual route/navigation inventory

**30 routes** are registered in `src/App.tsx` (29 functional + the catch-all 404). Primary navigation is driven by `src/components/layout/pillarNav.ts`, which groups **19 nav items across 7 pillars** (Observe, Control, Operationalize, Integrate, Improve, Measure, Govern).

| Route | In sidebar nav? | Notes |
|---|---|---|
| `/` | No (public) | Index/Login — unprotected, redirects to `/dashboard` if already signed in |
| `/whatsapp-authenticate` | No | Customer-facing, not `ProtectedRoute`-gated, not in `pillarNav.ts` |
| `/dashboard` | Yes (Observe) | |
| `/initiate-call` | Yes (Control) | |
| `/call-logs` | Yes (Observe) | |
| `/customers` | Yes (Observe, "Customers") | |
| `/customers/:customerId` | No (opened from Customers) | Sub-route of Customers |
| `/chat` | Yes (Control) | |
| `/chat-logs` | Yes (Observe) | |
| `/outbound-campaigns` | Yes (Operationalize) | |
| `/outbound-campaigns/create` | No (opened from Outbound Campaigns) | Sub-route |
| `/outbound-campaigns/:campaignId` | No (opened from Outbound Campaigns) | Sub-route |
| `/nps-campaigns` | Yes (Operationalize) | |
| `/live-view` | Yes (Observe) | |
| `/qa-review` | Yes (Improve, labeled "Interaction Quality") | |
| `/whatsapp-hub` | Yes (Integrate) | |
| `/formatting-hub` | Yes (Integrate) | |
| `/ai-agents` | Yes (Improve) | |
| `/ai-agents/:agentId` | No (opened from AI Agents) | Sub-route |
| `/orchestrator` | Yes (Integrate) | |
| `/orchestrator/new` | No (opened from Orchestrator) | Same component as `/orchestrator/flow/:flowId` |
| `/orchestrator/flow/:flowId` | No (opened from Orchestrator) | |
| `/orchestrator/integrations` | **No — no in-app link found at all** | Hidden/internal route |
| `/analytics` | Yes (Measure) | |
| `/ratios` | Yes (Measure, "Ratios") | |
| `/ratios/:ratioId` | No (opened from Ratios) | Sub-route |
| `/reports` | **No — explicitly in `UNLISTED_ROUTES`** | Legacy, kept only for bookmark compatibility |
| `/user-management` | Yes (Govern) | |
| `/settings` | Yes (Govern) | |
| `*` | N/A | 404 NotFound |

**Genuinely hidden/non-navigable routes found: 3** — `/reports` (explicit `UNLISTED_ROUTES` entry, code comment: "still Lovable-era mock data"), `/orchestrator/integrations` (no link from `FlowLibrary.tsx` or anywhere else in `src/`), `/whatsapp-authenticate` (customer-facing, reached via an external `?phone=` link presumably sent by the WhatsApp bot itself, outside this repo).

---

## 3. Master functional-screen table

| Functional Area | Screen / View | Route / Entry | Purpose | Key Information | Key Actions | Main Data Source | State-changing? | Maturity |
|---|---|---|---|---|---|---|---|---|
| Govern (auth) | Login (Index) / ProtectedRoute | `/` (public), gates all protected routes | Sign in; gate protected screens | Login form | Login submit | Static `sampleUsers` array (local) | Yes (sets `localStorage`) | **PARTIAL** |
| Observe | Dashboard | `/dashboard` (sidebar) | Cross-agent operational overview | Active calls/agents, FCR, escalation, AHT, Needs Attention, Recent Calls, Agent Load | Open Call Detail, navigate to Call Logs/Agent Detail | `useAnalyticsMetrics` + `useCallData` + `useAgents` | No | FUNCTIONAL |
| Observe | Live View | `/live-view` (sidebar) | Real-time active-call monitoring | Live metrics, active-call table, sentiment, transcript tail | Search/filter, View Details dialog, navigate to Agent Detail | `useLiveCallData` (4s poll) + `useAgents` | No | FUNCTIONAL |
| Control | Initiate Call | `/initiate-call` (sidebar) | Manually place one outbound voice call | Call config form, post-trigger status, recent calls | Initiate Call, refresh status | Voice API (`/api/v1/call`), live call-data | Yes (dials a real call) | FUNCTIONAL |
| Control | Chat (Console) | `/chat` (sidebar) | Live text conversation with an AI agent | Transcript, per-turn AI metadata, identity/session summary | Send message, New Chat, select identity mode | Backend Chat API (`/api/chat`), Customer 360, Campaigns | Yes (persists a session + sends messages) | FUNCTIONAL |
| Observe | Call Logs | `/call-logs` (sidebar) | Review completed voice interactions | Timestamp, caller, agent, duration, outcome, FCR, intent accuracy, summary KPIs | Search, filter, paginate, export (page), view detail | `useCallData` → `/api/calls/data` → Voice API | No (export is local-only) | FUNCTIONAL |
| Observe | Call Detail | Dialog from Call Logs "View" (also reused by Campaign Detail, Customer Detail, Dashboard, Live View) | Investigate one call's full record | Identity, agent, duration, FCR, intent confidence, sentiment, summary, recording, transcript | Search transcript, play recording, refresh live transcript | `useCallData` + `useInteractionTranscript` → `/api/calls/session/[id]` | No | FUNCTIONAL |
| Observe | Chat Logs | `/chat-logs` (sidebar) | Browse chat session history | Timestamp, customer/context, agent, msg count, status, intent, auth | Search (page), filter (agent/status server-side; auth page-only), paginate, open detail | `GET /api/chat/logs` → live `/api/v1/chat/sessions`, Supabase fallback | No | FUNCTIONAL |
| Observe | Chat Detail | Dialog from Chat Logs "View" | Inspect one session's identity + full transcript | Identity, status, agent, span, msg count, auth, intent confidence, latency, per-turn transcript+metadata | Search transcript, copy ID, copy raw message | Same as Chat Logs | No | FUNCTIONAL |
| Observe | Customers (list) | `/customers` (sidebar) | Search/browse the authorized Customer 360 roster | Display label, interaction count, last-seen, latest outcome, latest sentiment | Search, paginate, open Customer Detail | `useCustomers` → `GET /api/customers` | No | FUNCTIONAL |
| Observe | Customer Detail | `/customers/:customerId` (from Customers list; direct route also works) | Single-customer 360° view | Identity+contact, summary metrics, interaction history, campaign participation | Refresh (force re-check), open interaction detail | `useCustomerDetail`/`useCustomerInteractions`/`useCustomerCampaigns` → `GET /api/customers/{id}` | Yes (Refresh only — no data edit) | **PARTIAL** |
| Operationalize | Outbound Campaigns | `/outbound-campaigns` (sidebar) | Browse/launch into campaigns | Stats strip, filterable table | Search (page-only), filter (page-only), open, New Campaign | `campaignsService.ts` → `api/campaigns.ts` → Supabase | No | FUNCTIONAL |
| Operationalize | Create Campaign | `/outbound-campaigns/create` (from Outbound Campaigns) | Configure + launch a new campaign | 7-step wizard (agent, contract, audience, mapping, outcome policy, review) | Create, import targets, set mappings, launch | Same | Yes | FUNCTIONAL |
| Operationalize | Campaign Detail | `/outbound-campaigns/:id` (from Outbound Campaigns) | Operate one campaign | Stats, targets table, lifecycle state | Start/Pause/Resume/Stop, Retry | Same | Yes | FUNCTIONAL |
| Operationalize | ↳ Campaign Configuration | Dialog from Campaign Detail "Configuration" | Edit agent/mapping/outcome policy | Agent, contract, mapping, outcome tables | Save (draft or new version) | Same | Yes | FUNCTIONAL |
| Operationalize | ↳ Campaign History | Dialog from Campaign Detail "History" | Audit trail | Human-readable event log | View only | Same | No | FUNCTIONAL |
| Operationalize | ↳ Target Actions Menu | Per-row menu in Campaign Detail | Skip/Hold/Release/Amend one target | State-aware action list | Skip, Hold, Release Hold, Amend | Same | Yes | FUNCTIONAL |
| Operationalize | ↳ Add Targets | Dialog from Campaign Detail "Add Targets" | Add targets to a launched campaign | CSV preview | Upload + add (dedup via identity resolution) | Same | Yes | FUNCTIONAL |
| Operationalize | NPS Campaigns | `/nps-campaigns` (sidebar) | (intended) NPS survey campaigns | Campaign list, NPS scores | None persist (self-disclosed banner) | `useIndustryData()` (generated mock) | No (fake) | **PLACEHOLDER** |
| Improve | Interaction Quality (QA Review) | `/qa-review` (sidebar) | Cross-channel read-only review of real interaction signals | Outcome, FCR, escalation, intent, confidence, sentiment, auth, duration/latency | Search/filter/group, open Call/Chat Detail | `useCallData`, `useChatLogs`, `useClassification` | No | FUNCTIONAL |
| Integrate | WhatsApp Hub | `/whatsapp-hub` (sidebar) | Live two-way WhatsApp messaging console | Message thread, sandbox info, (static) connection status | Send message | Supabase `whatsapp_messages` (+ Realtime) | Yes (send) | FUNCTIONAL |
| Integrate (hidden) | WhatsApp Authenticate | `/whatsapp-authenticate` (external link only, no auth gate) | External customer login/password-reset | Login/reset forms | Login, send OTP, reset password | 4 Supabase Edge Functions | Yes | FUNCTIONAL |
| Integrate | Formatting Hub | `/formatting-hub` (sidebar) | Diagnostic log of WhatsApp response-formatting pipeline | Strategy, number, session, formatted/original text | Search, refresh, expand original | Supabase `vapi_response_logs` | No | FUNCTIONAL |
| Improve | AI Agents / Agent Detail | `/ai-agents`, `/ai-agents/:agentId` | View live agent roster + per-agent operational profile | Direction, usage counts, business/quality/performance metrics, recent interactions | View detail, open call/chat drill-down | Live Voice API (`/api/v1/agents`) + Call/Chat/Campaign hooks | No | FUNCTIONAL |
| Integrate | Orchestrator — Flow Library | `/orchestrator` (sidebar) | Browse conversational-flow definitions | Static sample flow cards | Browse, search/filter (client-side) | Hardcoded `sampleFlows` array | No | **PLACEHOLDER** |
| Integrate | Orchestrator — Flow Editor | `/orchestrator/new`, `/orchestrator/flow/:flowId` | Visually build a flow on a node canvas | Canvas nodes/edges (never loaded from existing data), flow name | Drag nodes; Save/Validate/Simulate (all fake) | None — local component state only | Appears yes, **actually no** | **PLACEHOLDER** |
| Integrate (hidden) | Orchestrator — Integrations | `/orchestrator/integrations` (no nav link) | Manage external integrations | Hardcoded list of 3 integrations | None functional (buttons inert) | Hardcoded inline array | No | **PLACEHOLDER** |
| Measure | Analytics | `/analytics` (sidebar, 5 tabs) | Cross-channel performance reporting | KPI tiles, charts, per-channel breakdowns | Time-window filter, tab switch, CSV export | `api/analytics/metrics.ts` + live Campaign/Customer/Chat queries | No (export is local) | FUNCTIONAL |
| Measure | Ratios (catalogue) | `/ratios` (sidebar) | List drillable KPIs | Ratio catalogue | Open a ratio | Ratio registry | No | FUNCTIONAL |
| Measure | Ratio Explorer | `/ratios/:ratioId` (from Ratios) | Drill one KPI to its interactions | Hero/trend/breakdown/driver/interactions | Breakdown select, drill, compare, page | `src/server/analytics/ratio*.ts` via API | No | FUNCTIONAL |
| Measure (hidden) | Reports | `/reports` (not in nav) | — (dead) | 3 hardcoded "reports," fake stats | Search/filter/favorite (local only) | None — static generator | No | **PLACEHOLDER** |
| Govern | User Management | `/user-management` (sidebar) | Administer users/roles | 2 hardcoded users, hardcoded permission matrix | None functional (buttons inert) | `src/data/sampleUsers.ts` (static) | No | **PLACEHOLDER** |
| Govern | Settings | `/settings` (sidebar, 5 tabs) | App/account configuration | 5 tabs; 4 fake, 1 real (Appearance) | Theme toggle (real); all other fields fake, Save is a no-op | `ThemeContext`/localStorage (Appearance only) | Appearance: yes (real); rest: no | **PARTIAL** |

---

## 4. Detailed screen sheets

### 4.1 Login (Index) / ProtectedRoute

- **Route:** `/` (public, unprotected). `ProtectedRoute` (`src/components/auth/ProtectedRoute.tsx`) wraps every other route except `/` and `/whatsapp-authenticate`.
- **Purpose:** Sign in; prevent protected screens from rendering without a signed-in user.
- **Primary activity:** Authenticate.
- **Information shown:** Full-screen spinner while loading (`Index.tsx:11-16`), otherwise a login form.
- **Actions:** Submit login → `login(email, password)` (`AuthContext.tsx:50-63`). Logout exists (`AuthContext.tsx:65-69`) but is invoked elsewhere (account menu), not on this screen.
- **Data source:** `src/data/sampleUsers.ts` — a static in-repo array (`AuthContext.tsx:4`). No API, no Supabase call anywhere in this auth path.
- **Persistence:** `setUser()` + `localStorage.setItem('tardis_user', ...)` (`AuthContext.tsx:55-58`); read back on load (`:40-47`). Entirely client-side.
- **Relationships:** Already-signed-in user at `/` is redirected to `/dashboard` (`Index.tsx:19-20`). `ProtectedRoute` renders the login form inline (not a redirect) for any protected route requested without a session.
- **Limitations:** Password check is a single hardcoded literal (`password === 'password123'`, `AuthContext.tsx:55`) compared client-side against every account — no server-side credential verification at all. Session state is a hand-editable `localStorage` blob with no server check. Debug `console.log` calls remain throughout the shipped auth path (`AuthContext.tsx:25,41,44,51,54,56,61,66`).
- **Mock/placeholder:** The entire identity set (`sampleUsers`) is fabricated, in-repo data standing in for a real identity provider — not legitimate test data in a real system, since no real system exists here.
- **Maturity: PARTIAL.** The routing/redirect flow genuinely works end-to-end; the authentication it gates has no real backend.

### 4.2 Dashboard

- **Route:** `/dashboard`, sidebar (Observe), permission `view_all_dashboards`.
- **Purpose:** Cross-agent operational snapshot for a supervisor.
- **Primary activity:** Observe.
- **Information shown:** Active calls, Active agents, FCR rate (all-time), Escalation rate (all-time, warning tone >20%), Avg handle time; a "Needs Attention" list (escalated/stale-active, capped to 5); a "Recent Calls" list (capped to 5); a compact "Agent Load" panel.
- **Actions (read-only):** Click a row → opens the shared `InteractionDetailDialog`. "View all → Call Logs" → navigates to `/call-logs`. Click an agent in Agent Load → `/ai-agents/:agentId`.
- **Data source:** `useAnalyticsMetrics()` → `api/analytics/metrics.ts`; `useCallData({ page_size: 5 })` → `api/calls/data.ts` → external Voice Partner API; `useAgents()`.
- **Persistence:** None (read-only).
- **Relationships:** Dashboard → Call Detail (inline dialog), Dashboard → Call Logs, Dashboard → Agent Detail.
- **Limitations:** Both 5-row caps are hardcoded client-side workarounds because the upstream Partner API doesn't reliably honor `page_size` (documented, `Dashboard.tsx:36-42`, citing `docs/SCREEN_REVIEW_01_DASHBOARD.md §5`). Avg Sentiment/CSAT tiles were deliberately removed (no backing field) per the file's own header comment.
- **Mock/placeholder:** None — every tile/list traces to a real API call.
- **Maturity: FUNCTIONAL.**

### 4.3 Live View

- **Route:** `/live-view`, sidebar (Observe), permission `monitor_real_time`.
- **Purpose:** Real-time console of every currently-active call.
- **Primary activity:** Observe / monitor in real time.
- **Information shown:** Metric strip (active/escalated/AHT/escalations-with-trigger); live-scoped Agent Load panel; searchable/filterable table of up to 20 active calls (name/phone, intent, agent, duration, sentiment, status); a "View Details" dialog per row (caller info, call details, last 6 transcript turns, a "Call Analysis" block); an "Active Escalations" panel (capped to 5).
- **Actions (read-only):** search/filter (client-side), "View Details" dialog, Agent Load click → Agent Detail.
- **Data source:** `useLiveCallData()` = `useCallData({ status: 'active' }, { refetchInterval })`, polling every 4s; `useAgents()`.
- **Persistence:** None. The screen's own header comment documents that a prior Transfer-to-Human dialog, Listen-In/Mute controls, and a fake local duration-increment simulation were all already removed because none had real backend support.
- **Relationships:** Live View → Agent Detail. The "View Details" dialog here is a **separate, hand-rolled** implementation — not the shared `InteractionDetailDialog` used by Dashboard/Call Logs/Customer Detail/Campaign Detail.
- **Limitations:** Three different escalation signals on one screen (row badge, "Escalated (live)" metric, "Escalations w/ trigger" metric) can disagree — a documented, still-open upstream semantics question (`LiveView.tsx:41-43`). The in-dialog "Call Analysis" block reads a separate `call.analysis.*` field path that the shared Call Detail dialog already found to always duplicate other fields and deliberately dropped — Live View's own dialog still shows it (unverified here, carried to Phase 2).
- **Mock/placeholder:** None in the live data path; several previously-fabricated behaviors are already-resolved history (documented, removed).
- **Maturity: FUNCTIONAL**, with one unverified (not confirmed fake, not confirmed real) sub-panel noted above.

### 4.4 Initiate Call

- **Route:** `/initiate-call`, sidebar (Control), permission `test_bound_calls`.
- **Purpose:** Manually place one outbound voice call via a selected AI agent, outside any campaign.
- **Primary activity:** Initiate; observe post-trigger status; review recent calls.
- **Information shown:** Call Configuration form (phone, agent select); Post-Trigger Status Card (destination, agent, interaction ID, status, 60s polling-capped notice); Recent Calls (last 5).
- **Actions:** Read — browse Recent Calls, refresh post-trigger status, dismiss status card. **State-changing — Initiate Call, genuinely dials**: `useInitiateCall` → `useTriggerCall` → `POST /api/calls/trigger` → real external Voice API `POST /api/v1/call`, including a specific fix for the documented "upstream returns HTTP 200 even on failure" gotcha.
- **Data source:** `useAgents()` (live roster), `useCallData({ page_size: 5 })` (recent calls), `useInteractionTranscript` (post-trigger polling).
- **Persistence:** `UI → useTriggerCall → POST /api/calls/trigger → external Voice API`. No direct Supabase write; the call later surfaces in Call Logs once the backend records it.
- **Relationships:** No direct click-through from this screen into Call Detail for the just-placed call.
- **Limitations:** No outcome/transcript shown inline even after completion — only a status badge; full detail requires Call Logs.
- **Mock/placeholder:** None — every path traced is live.
- **Maturity: FUNCTIONAL.**

### 4.5 Chat (Console)

- **Route:** `/chat`, sidebar (Control), permission `test_bound_calls`.
- **Purpose:** Live, real-time text chat with an AI agent — standalone, bound to a real Customer 360 customer, launched against a real campaign target, or explicitly isolated Trial/Test.
- **Primary activity:** Initiate and converse.
- **Information shown:** Conversation transcript (user/AI bubbles); per-AI-turn metadata (dataSource, authenticated, intent, confidence, detectionMethod, latencyMs — genuinely returned by the backend); identity selector (3 modes); bound-session summary once a session exists.
- **Actions:** Read — switch identity mode, browse campaign targets, search customers. **State-changing — Send message** (real, `POST /api/chat`, identity fields sent only on the first turn per the documented Chat API contract); **New Chat** (closes prior session via `POST /api/chat?action=close`).
- **Data source:** `useAgents`, `useCustomers`/`useCustomerDetail`, `useCampaigns`/`useCampaignTargets`, `useClassification` — all live.
- **Persistence:** `UI → sendChatMessage → POST /api/chat → backend Chat API`; the app's own `/api/chat` route additionally persists `customer360_customer_id`/`campaign_id`/`campaign_target_id`/`is_trial` onto its own `chat_sessions` row, explicitly documented as never entering the Voice campaign-execution/reconciliation pipeline.
- **Relationships:** Completed sessions → Chat Logs/Chat Detail. Campaign Customer mode links to a real `campaign_targets` row.
- **Limitations:** Trial/Test mode's manual identity fields are free-text/unvalidated — by design.
- **Mock/placeholder:** None.
- **Maturity: FUNCTIONAL.**

### 4.6 Call Logs

- **Route:** `/call-logs`, sidebar (Observe).
- **Purpose:** Searchable, filterable record of completed voice interactions.
- **Primary activity:** Search / filter / review.
- **Information shown:** Table (timestamp, caller/context, agent, duration, outcome, FCR, intent accuracy); summary strip (FCR rate, AHT, intent accuracy, escalation rate).
- **Actions:** Read — free-text search (server-side), advanced filter panel (date range, outcome, direction, duration — server-side), Call Agent/FCR/Authenticated/Campaign facets (**explicitly client-side-only on the already-fetched page**, labeled "(page)" in the UI), pagination (real server-side). **State-changing-adjacent — Export** (CSV of the current filtered page only, client-side `Blob` download, not a server job).
- **Data source:** `useCallData` → `GET /api/calls/data` → external Voice Partner API, with server-side role/category authorization filtering.
- **Persistence:** None — Export writes only to the browser's local download.
- **Relationships:** Call Logs → Call Detail. Call Detail is also reused by Campaign Detail and Customer Detail as their own drill-down.
- **Limitations:** Export and the four client-side facets are honestly page-scoped only, labeled as such in the UI. Summary KPIs become page-scoped (not global) the moment server-side category authorization filters rows (`scoped: true`, not visibly surfaced on this screen itself).
- **Mock/placeholder:** None.
- **Maturity: FUNCTIONAL.**

### 4.7 Call Detail

- **Route:** Not a route — a dialog (`InteractionDetailDialog`, `src/components/call-logs/InteractionDetailDialog.tsx`) opened from Call Logs' "View" button. Also reused by Campaign Detail's Transcript/Recording action, Customer Detail's interaction drill-down, and Dashboard/Live View's row click.
- **Purpose:** Full single-call record — identity, outcome, metrics, summary, recording, transcript.
- **Primary activity:** Investigate.
- **Information shown:** Header (caller name/phone, direction/agent/start-time, outcome badge, raw Interaction ID as plain text); MetricStrip (Duration, FCR, Intent confidence, Sentiment); secondary facts (Phone, Authenticated, Escalation trigger, Campaign name — **plain text, not a link**); Call Summary section (summary + tags, shown only if present); Recording section (native `<audio>` if a URL exists); searchable/highlightable Conversation transcript with per-turn speaker/sentiment/confidence.
- **Actions:** Read-only — transcript search/highlight, play recording, Refresh (re-fetch live transcript for an active call), live polling every 3s capped at 60s while active.
- **Data source:** `useCallData` (passed in) + `useInteractionTranscript` → `GET /api/calls/session/[id]`.
- **Persistence:** None.
- **Relationships:** Opened from Call Logs, Dashboard, Live View, Campaign Detail, Customer Detail. Does **not** itself link onward to Customer360 or Campaign Detail despite displaying a customer identity and campaign name.
- **Limitations:** Campaign/Customer fields are inert text with no drill-down, even though the identical data is a real link elsewhere. "Call Summary"/"Recording" sections silently fall back when fields are null with no indication of why.
- **Mock/placeholder:** None.
- **Maturity: FUNCTIONAL.**

### 4.8 Chat Logs

- **Route:** `/chat-logs`, sidebar (Observe, permission `view_call_logs`).
- **Purpose:** Browse chat session history — the chat equivalent of Call Logs.
- **Primary activity:** Observe / search / investigate.
- **Information shown:** Table (timestamp, customer/context, agent, message count, status badge, latest intent, authenticated).
- **Actions:** Read — free-text search (page-local only, no upstream param), Call Agent filter (real server-side), Status filter (server-side), Authenticated filter (page-local only), pagination (real server-side, capped to 1 page for a category-scoped role — documented limitation).
- **Data source:** `useChatLogs` → `GET /api/chat/logs` → live backend `GET /api/v1/chat/sessions` as primary, Supabase local-copy fallback on failure (`source: 'live' | 'local-fallback'`, surfaced via an amber banner when fallback is active).
- **Persistence:** None.
- **Relationships:** Chat Logs → Chat Detail. No link out to Customer360 (resolved customer label is text, not a link).
- **Limitations:** Search and Authenticated filters are page-local only (disclosed in-UI). Category-scoped role's pagination total is capped at 1 page (disclosed limitation of filtering an already-paginated upstream response).
- **Mock/placeholder:** None.
- **Maturity: FUNCTIONAL.**

### 4.9 Chat Detail

- **Route:** Not a route — dialog (`ChatSessionDetailDialog.tsx`) opened from Chat Logs' "View." Rebuilt this session cycle on a shared `src/components/interaction-detail/` architecture also used by Call Detail.
- **Purpose:** Inspect one chat session's full identity/metadata context and complete transcript.
- **Primary activity:** Investigate.
- **Information shown:** Header (resolved customer identity, status badge, agent, start time, subordinate copyable session ID); Summary strip (session span, message count, authenticated, intent confidence, latest latency); Session Context card (Backend Customer ID/CIF, Contact/Phone, Agent, Latest intent, Latest data source — RAG/LLM badge); Conversation — full transcript with per-turn speaker, timestamp, and (for AI turns, when present) intent/confidence/data-source/latency.
- **Actions:** Read-only — transcript search, copy session ID, copy raw message text.
- **Data source:** Same `GET /api/chat/logs?id=` endpoint as the list — live primary, Supabase fallback.
- **Persistence:** None.
- **Relationships:** Opened only from Chat Logs. No link to Customer360 or to a same-customer Call interaction.
- **Limitations:** Per-turn metadata genuinely absent for customer turns/unpopulated AI turns, rendered honestly as `—`, not fabricated. Zero-vs-unavailable confidence explicitly distinguished.
- **Mock/placeholder:** None.
- **Maturity: FUNCTIONAL.**

### 4.10 Customers (list)

- **Route:** `/customers`, sidebar (Observe, "Customers").
- **Purpose:** Search/browse the authorized Customer 360 roster.
- **Primary activity:** Search, browse, drill in.
- **Information shown:** Per row — display label (name/CIF/masked-phone fallback), total interaction count, last-seen, latest outcome badge, latest sentiment %.
- **Actions:** Read-only — debounced search (phone/name/CIF), server-side pagination (25/page), row click → Customer Detail.
- **Data source:** `useCustomers` → `GET /api/customers`.
- **Persistence:** None.
- **Relationships:** Customers → Customer Detail.
- **Limitations:** A `materializationWarning` banner exists for when the backend can't check for new interactions — a visible degraded-state indicator, not itself a defect.
- **Mock/placeholder:** None.
- **Maturity: FUNCTIONAL.**

### 4.11 Customer Detail — special attention

- **Route:** Opened from Customers list row click (primarily); direct route `/customers/:customerId` also works standalone. Per the page's own comment, Customers list is "today the only screen that links here."
- **Purpose:** Single-customer 360° view — identity, interaction history, campaign participation.
- **Primary activity:** Investigate one customer's history.
- **Information shown (4 sections):**
  1. **Identity & Contact** — customer ref (CIF) and masked phone number(s) **only**.
  2. **Summary MetricStrip** — first seen, last seen, visible interaction count (+inbound/outbound split), latest intent, latest outcome, escalation count.
  3. **Interaction History** table — Time, Channel (+Direction), Agent, Intent, Duration, Outcome, Sentiment %. Optional Domain→Category→Agent/Channel grouping filter, collapsed by default.
  4. **Campaign Participation** table — Campaign name, Call Agent, Target Status, Attempts, Latest Execution status, Current Result, Follow-up due, "View call" action.
- **Actions:** Read — expand grouping filter, click an interaction/campaign row → opens the shared Call/Chat Detail dialog. **State-changing — only Refresh** (forces a backend interaction-materialization check — not a data edit). **No note/task/reminder creation, no edit action anywhere on this page.**
- **Data source:** `useCustomerDetail`, `useCustomerInteractions` (bounded to 500 for grouping), `useCustomerCampaigns`, `useClassification`.
- **Persistence:** Refresh only — `useRefreshCustomer` → `POST /api/customers/{id}?action=refresh` → Supabase.
- **Relationships:** Customer Detail → Call/Chat Detail dialog. Customer Detail ← Customers list (the only current entry point).
- **Limitations:** Identity & Contact is deliberately minimal (CIF + phone only — no email, no name beyond display label, no tier/segment). No per-row Authenticated/Recording-available indicator in Interaction History despite both fields existing on the underlying record type. Uses ordinary page scroll rather than the single-bounded-scroll pattern other list screens use (a documented deviation).
- **Mock/placeholder:** None — every value traces to a live Supabase-backed response.
- **Maturity: PARTIAL.** Everything shown is genuinely live and server-backed — but a fully-implemented backend subsystem (Activity/Diary: notes/instructions/tasks/reminders/appointments, 5 types, with `GET/POST ?action=activities` already built, `api/customers/[id]/index.ts:98-162`, backed by `activityRepository.ts`/`supabaseActivityRepository.ts`) has **zero frontend consumption anywhere in `src/`** — no hook, no component, nothing. The screen is "complete" for what it shows; what it shows is a genuine subset of already-implemented capability. (Full detail reserved for Phase 2 per this audit's explicit boundary.)

### 4.12 Outbound Campaigns

- **Route:** `/outbound-campaigns`, sidebar (Operationalize).
- **Purpose:** Index/landing screen for the Campaigns area.
- **Primary activity:** Observe, search/filter, navigate.
- **Information shown:** Header stat strip; search + status filter; table (name+creator, status, call agent, targets, attempted, classified, unclassified-flagged-if->0, success rate); pagination footer.
- **Actions:** Read — search, status filter (**both client-side only over the current page**, documented limitation), row click → Campaign Detail, Prev/Next pagination (server-side). **New Campaign** → navigate to Create Campaign (no mutation here).
- **Data source:** `useCampaigns()` → `GET /api/campaigns?action=list` → `call_center_campaign_list` RPC.
- **Persistence:** None on this screen.
- **Relationships:** Outbound Campaigns ↔ Campaign Detail; → Create Campaign.
- **Limitations:** Search/status filters only operate on the current fetched page (stated limitation).
- **Mock/placeholder:** None.
- **Maturity: FUNCTIONAL.**

### 4.13 Create Campaign

- **Route:** `/outbound-campaigns/create`, reached only via "New Campaign."
- **Purpose:** Guided wizard to define a new campaign end-to-end.
- **Primary activity:** Configure/initiate.
- **Information shown (7 steps):** Basic Info; Call Agent (live roster); Agent Contract (read-only display); Audience (CSV upload + live preview); Input Mapping (per-field source selection with duplicate validation); Outcome Policy (Agent Outcome → Campaign Classification mapping, live classifications, "at least one Successful" rule; legacy "Generic Call Result Rules" editor hidden once the agent has structured outcomes); Review & Launch.
- **Actions:** State-changing — Create (`POST ?action=create`), import CSV audience (`POST ?action=importTargets`), set input mappings (`POST ?action=setInputMappings`), optionally Launch Now (`POST ?action=start`).
- **Data source:** `useAgents()`, `useCampaignClassifications()`, client-side CSV parsing.
- **Persistence:** UI → `campaignsService.ts` → `api/campaigns.ts` → `supabaseCampaignRepository.ts` → Supabase RPCs.
- **Relationships:** Create Campaign → Campaign Detail (on success).
- **Limitations:** None significant beyond what's self-documented in-UI.
- **Mock/placeholder:** None.
- **Maturity: FUNCTIONAL.**

### 4.14 Campaign Detail (+ sub-views)

- **Route:** `/outbound-campaigns/:campaignId`.
- **Purpose:** Operational home for one campaign — lifecycle control, configuration, target-level intervention, audit trail — deliberately keeping the list screen clean.
- **Primary activity:** Observe, administer, intervene.
- **Information shown:** Header (name, description, status badge); action row (Configuration, History, lifecycle buttons); stats row (targets, calls triggered, success rate, classified/successful-policy, agent, created date); targets table (Name, Phone, Status, Current Result, Agent Outcome, Campaign Classification [+drift badge], Next Action, Follow-up Due, Attempts, Actions); skip/held badges with reason tooltip; "amended" badge for edited targets.
- **Actions:** Read — view targets, open Transcript/Recording (shared Call Detail dialog), open Agent Result, view History. **State-changing** — Start/Pause(reason)/Resume/Stop(reason+confirm); per-target Retry/Skip(reason+conditional comment)/Hold(reason+note)/Release Hold/Amend (field-by-field editor, never free JSON); Add Targets (CSV, dedup via identity resolution); Save Configuration (draft → direct update; launched → new configuration version).
- **Data source:** `useCampaignDetail`/`useCampaignTargets` → `api/campaigns.ts` (`get`, `listTargets`, `listSkipReasons`, `listConfigurationVersions`, `listAuditEvents`).
- **Persistence:** Each action → a dedicated `api/campaigns.ts` action → a dedicated Supabase RPC (e.g. `call_center_campaign_skip_target`, `call_center_campaign_hold_target`/`_release_hold`, `call_center_campaign_amend_target`, `call_center_campaign_update_draft_configuration`/`_create_configuration_version` (optimistic-concurrency guarded), `call_center_campaign_set_status_audited`).
- **Relationships:** Outbound Campaigns ↔ Campaign Detail; Campaign Detail → Call Detail (via a target's Transcript/Recording). **Does not** currently link a target row to Customer360.
- **Limitations:** `campaign.stats.targetCount` can exceed rendered rows (a known join-gap, self-flagged in-UI with an amber warning). Configuration's Input Mapping editor uses a plainer control than Create Campaign's richer picker.
- **Sub-views (all FUNCTIONAL, all dialogs opened from Campaign Detail, not separate routes):**
  - **Campaign Configuration** — Agent → Contract summary → Input Mapping → Outcome Mapping → Reason/Review in one scrollable form. Changing the agent clears mapping state below it.
  - **Campaign History** — read-only, human-readable audit log (status changes, skip/hold/release/amend/retry, configuration-version creation, targets-added) with actor/timestamp/reason, never raw JSON.
  - **Target Actions Menu** — per-row, state-aware (only shows actions valid for the target's current status).
  - **Add Targets** — CSV upload reusing the exact same parser/identity-resolution path as Create Campaign's audience step.
- **Mock/placeholder:** None anywhere in this area.
- **Maturity: FUNCTIONAL** (Campaign Detail and all 4 sub-views).

### 4.15 NPS Campaigns

- **Route:** `/nps-campaigns`, sidebar (Operationalize).
- **Purpose (as implemented):** Intended NPS survey campaign management — but explicitly self-disclosed as non-functional.
- **Information shown:** Campaign list with filters, NPS score badges, create/edit/transcript/recording dialogs — all from `useIndustryData()`.
- **Actions:** All buttons present (Create, Play/Pause, Edit, Delete, view transcript/recording) but the screen carries its own banner: *"Demo data — NPS Campaigns has no real backend/execution engine yet (Session 5/9 audits). Shown for illustration only; actions below do not persist or place real calls."*
- **Data source:** `useIndustryData()` → `src/utils/industryDataGenerator.ts` — generated/mock dataset.
- **Persistence:** None (confirmed by the screen's own banner).
- **Relationships:** Self-contained, no real connection to Outbound Campaigns.
- **Mock/placeholder:** **Yes — explicitly disclosed**, generated mock data, no backend.
- **Maturity: PLACEHOLDER** (self-disclosed demo shell).

### 4.16 Interaction Quality (QA Review)

- **Route:** `/qa-review`, sidebar (Improve, labeled "Interaction Quality"), permission `review_transcripts`.
- **Purpose:** Read-only, cross-channel review surface over real interaction signals — built explicitly to **replace** a prior fully-fabricated QA/quality-scoring module.
- **Information shown:** Per row — time, channel, agent, outcome, FCR (voice), escalation trigger (voice), intent, intent accuracy %/confidence %, sentiment (voice), authentication, duration/latency, campaign name. A Grouped (Domain→Category→Agent→Channel) tree view, reusing the same classification hierarchy used elsewhere.
- **Actions:** Read-only — search by intent text, filter (channel/agent/outcome/escalation/FCR/sentiment), "campaign interactions only" checkbox, toggle Grouped vs Table, click row → shared Call/Chat Detail dialog.
- **Data source:** `useCallData({ status: 'inactive', page_size: 50 })`, `useChatLogs(1)` — same hooks as Call Logs/Chat Logs; `useClassification()`.
- **Persistence:** None.
- **Relationships:** Reuses Call Detail/Chat Detail exactly as the Logs screens do.
- **Limitations:** No composite quality score, no reviewer assignment, no approval workflow — explicitly deliberate (comment: "No manual-review backend exists"). Voice rows have no latency (hardcoded `null`, explicitly commented as "never fabricated"). Chat rows have no sentiment/FCR (channel gap, shown honestly as `—`).
- **Mock/placeholder:** None — this screen was explicitly rebuilt to *remove* a prior fabricated quality score.
- **Maturity: FUNCTIONAL.**

### 4.17 WhatsApp Hub

- **Route:** `/whatsapp-hub`, sidebar (Integrate), permission `manage_whatsapp_messages`.
- **Purpose:** Live two-way WhatsApp messaging console against Twilio's WhatsApp Sandbox.
- **Information shown:** Left panel — static sandbox number, static setup instructions, a hardcoded "Connected to Sandbox" status indicator. Right panel — full message thread, auto-scrolling.
- **Actions:** Read — message thread is live (Supabase Realtime `postgres_changes` subscription). **State-changing — Send message**: requires typed recipient phone + text, submits via `supabase.functions.invoke('send-whatsapp-message', ...)`.
- **Data source:** Supabase table `whatsapp_messages` (direct query + Realtime channel).
- **Persistence:** `UI → supabase.functions.invoke('send-whatsapp-message') → Edge Function → real Twilio WhatsApp API call → row inserted`. Inbound path: Twilio webhook → `whatsapp-webhook` Edge Function → inserts into `whatsapp_messages`, also writes to `vapi_response_logs` (feeding Formatting Hub) via a shared formatter helper. Both Edge Functions confirmed present, reading real `TWILIO_*` env vars.
- **Relationships:** Data-linked (not UI-linked) to Formatting Hub via the shared `vapi_response_logs` write path.
- **Limitations:** "Connected to Sandbox" indicator is a **hardcoded static badge** with no real connectivity check behind it. Sending requires free-text phone entry — no Customer 360 contact picker. No per-conversation thread separation — all messages render as one combined stream.
- **Mock/placeholder:** Only the static connection-status badge; everything else (message list, send, receive) is a real, live integration.
- **Maturity: FUNCTIONAL** (one static cosmetic element).

### 4.18 WhatsApp Authenticate

- **Route:** `/whatsapp-authenticate` — direct route, **not** `ProtectedRoute`-gated, **not** in `pillarNav.ts`. Customer-facing (reached via an external `?phone=` link, presumably sent by the bot).
- **Purpose:** Let an external WhatsApp user authenticate or reset a password so a gated pending message can be processed.
- **Information shown:** Login form (phone+password) or reset-password form (phone, OTP, new password); phone pre-filled/read-only if passed via query param; a static success screen.
- **Actions (all state-changing):** Login → `validate-password` then `process-pending-message` Edge Functions; Send OTP → `send-otp`; Reset password → `reset-password` then `process-pending-message`.
- **Data source:** None for reads — pure action/form screen.
- **Persistence:** 4 distinct Supabase Edge Functions, all confirmed present in the repo.
- **Relationships:** Logically downstream of the WhatsApp bot flow, but no in-repo code link was found generating the `?phone=` link itself — presumably generated by the bot's own server-side logic, outside this repository.
- **Limitations:** Entirely isolated from the authenticated app by design (external audience).
- **Mock/placeholder:** None — all 4 actions call real, present Edge Functions (internal correctness of those functions not inspected — out of Phase 1 scope).
- **Maturity: FUNCTIONAL** (real edge-function-backed flow); genuinely **UNCLEAR** only on what generates the inbound link, which lives outside this repo.

### 4.19 Formatting Hub

- **Route:** `/formatting-hub`, sidebar (Integrate), permission `view_all_dashboards`.
- **Purpose:** Read-only diagnostic log viewer for the WhatsApp bot's response-formatting pipeline.
- **Information shown:** Per entry — format strategy badge (LOCAL/AI/DISABLED), WhatsApp number, truncated session ID, relative timestamp, formatted message text, expandable original pre-formatting text.
- **Actions:** Read-only — search (debounced, re-queries Supabase), manual Refresh, expand/collapse per row.
- **Data source:** Supabase table `vapi_response_logs`, queried directly client-side (`.limit(100)`).
- **Persistence:** None (read-only); the table itself is populated by the `whatsapp-webhook` Edge Function's formatter call.
- **Relationships:** Data-linked to WhatsApp Hub via the shared table/webhook relationship; no UI cross-navigation between the two.
- **Limitations:** Empty state honestly explains two real reasons for zero rows. Hardcoded 100-row limit, no pagination. No link from a log row back to its originating conversation/customer.
- **Mock/placeholder:** None — genuine Supabase-backed read screen.
- **Maturity: FUNCTIONAL.**

### 4.20 AI Agents / Agent Detail

- **Route:** `/ai-agents`, `/ai-agents/:agentId` (from the roster), sidebar (Improve).
- **Purpose:** Live roster of Call Agents; per-agent operational profile drawn from existing Call/Chat/Campaign data.
- **Information shown (roster):** Display name, `isDefault` badge, agent_id, direction badge, campaign count (bounded to most recent 100). **(Detail):** direction, persona, language, contract-completeness note; bounded-sample calls/chats/campaigns-handled counts; Customer 360 category mapping; Business Outcomes (resolved/escalated/FCR), Conversational Quality (intent accuracy/confidence, sentiment, authenticated counts), Technical Performance (AHT, avg turn latency) — all explicitly labeled as historical observed aggregates, not the agent's contract; Campaign Usage (outbound agents only); a merged most-recent-20 calls+chats list.
- **Actions:** Read-only throughout — open Agent Detail; open a call/chat's detail via the shared dialogs; navigate back. **No create/edit/pause/configure action exists anywhere** (explicitly confirmed by an in-code comment: no documented create/update/delete API).
- **Data source:** `useAgents()` → `GET /api/agents` → real external Voice API `/api/v1/agents`; Detail composes `useAgents()` + `useCallData({page_size:100})` + `useCampaigns({pageSize:100})` + a direct `fetchChatLogs()` call, filtered client-side by agent — no dedicated backend route, bounded to the most recent 100 rows per source.
- **Persistence:** None.
- **Relationships:** AI Agents → Agent Detail → Call Detail / Chat Detail dialogs. Also referenced by Create Campaign's agent selection and Chat's identity selector.
- **Limitations:** Status/description/expected_* contract fields are structurally absent (not merely hidden — the live API doesn't return them). Counts are explicitly bounded/sampled (max 100), labeled honestly. "Intent accuracy" semantics (ground-truth vs. classifier confidence) flagged in-UI as an open question. Per-agent voice turn latency explicitly not shown (no confirmed source).
- **Mock/placeholder:** None.
- **Maturity: FUNCTIONAL.**

### 4.21 AI Orchestrator — Flow Library

- **Route:** `/orchestrator`, sidebar (Integrate).
- **Purpose (as implemented):** Presented as a flow-library browser; in reality a static card display.
- **Information shown:** Cards for each of a hardcoded `sampleFlows` array (`src/data/orchestratorFlows.ts`) — name, description, status, channels, industry, version, "updated by," and (for `status==='live'`) **fabricated** completion/drop-off metrics.
- **Actions:** Read — browse, client-side search/filter against the static array, open a flow in the editor. The "Create Flow" button is additionally dead code — permission-gated **and** short-circuited by a literal `&& false`, so it can never render regardless of permission.
- **Data source:** 100% local/static — zero Supabase/fetch/query calls anywhere in this area (confirmed by grep).
- **Persistence:** None.
- **Relationships:** Flow Library → Flow Editor.
- **Mock/placeholder:** The entire dataset, including fabricated usage metrics presented as real.
- **Maturity: PLACEHOLDER.**

### 4.22 AI Orchestrator — Flow Editor

- **Route:** `/orchestrator/new` and `/orchestrator/flow/:flowId` (confirmed same component, with/without a `flowId` prop).
- **Purpose (as implemented):** Visual node-canvas flow builder — but no action on this screen has any real effect.
- **Information shown:** A node canvas, zoom controls, flow-name input. Opening an existing flow only looks up its **name** from the static array — the canvas itself always initializes empty (`nodes=[]`, `edges=[]`); a flow's actual structure is never loaded.
- **Actions:** Drag nodes, zoom (not independently verified beyond this pass's scope). **Save** — literal `// TODO: Save to database` in the code, does `console.log()` only, then shows a **fake "Flow saved successfully" toast**. **Validate** — ignores the actual canvas content entirely, unconditionally shows "Flow validation passed" after a hardcoded 1-second delay regardless of flow content. **Simulate** — shows an "Opening simulator..." toast; no simulator exists. Auto-save fires the fake Save every 5s when dirty.
- **Data source / persistence:** None whatsoever.
- **Relationships:** None to any other functional area.
- **Mock/placeholder: Yes — and notably, every "state-changing" control actively misrepresents success to the user** (toasts claim success for operations that did nothing) — a materially different and more concerning pattern than a simply-unbuilt feature.
- **Maturity: PLACEHOLDER.**

### 4.23 AI Orchestrator — Integrations

- **Route:** `/orchestrator/integrations` — **no in-app link found anywhere**, reachable only by direct URL.
- **Purpose (as implemented):** Nominally manage external data-source/API connections.
- **Information shown:** A hardcoded inline array of 3 integrations.
- **Actions:** "Add Integration" and "Test Connection" buttons have no `onClick` handler at all — inert.
- **Data source / persistence:** None — hardcoded array, zero backend calls.
- **Relationships:** Functionally orphaned.
- **Mock/placeholder:** Entire screen.
- **Maturity: PLACEHOLDER.**

### 4.24 Analytics

- **Route:** `/analytics`, sidebar (Measure), 5 tabs (Overview, Voice, Chat, Campaigns, Customers).
- **Purpose:** Operational/business-performance reporting across channels — the real successor to Reports (code comment: "Replaces the prior 100%-mock implementation").
- **Information shown:** Overview — 8 global KPI tiles for all-access roles, else 4 "sample" tiles from the caller's authorized data only. Voice — same 8 tiles + 2 charts + calls-by-agent breakdown. Chat — explicitly page/filter-scoped (no date-window API exists), active/completed counts, avg confidence/latency/authenticated-share/message-count, intent distribution, sessions-by-agent. Campaigns — reuses `CampaignOverviewStats`, with an explicit banner that Trigger-Call↔Call-Data correlation is "not yet empirically confirmed." Customers — 6 tiles from the authorized sample, explicit "showing first N of total" truncation notice when sampled.
- **Actions:** Read — time-window picker (1h/6h/12h/24h/7d/30d/custom), tab switch. **State-changing-adjacent** — client-side CSV export (browser-only, no server call) on every tab.
- **Data source:** `api/analytics/metrics.ts` (global aggregate, no role filter) for Overview/Voice; `useChatAnalytics`/`useCustomerAnalytics` (page-sampling); `useCampaigns`. Every tile carries an explicit `MetricSourceCaption` stating `server-aggregate`/`page-scoped`/`unavailable` origin — unusually disciplined about never blurring the two.
- **Persistence:** None.
- **Relationships:** Campaigns tab → same data as Outbound Campaigns; Customers tab reuses Customer 360's authorized list.
- **Limitations:** `GET /analytics/metrics` has no agent/category/domain filter — scoped roles fall back to a client-derived sample instead (disclosed, not hidden). Chat has no real aggregate API at all — every Chat figure is a "fetched sample," never a true total.
- **Mock/placeholder:** None — every number traces to a real query; limitations are disclosed in-UI.
- **Maturity: FUNCTIONAL.**

### 4.25 Ratios (catalogue) + Ratio Explorer

- **Route:** `/ratios` (catalogue, sidebar Measure) → `/ratios/:ratioId` (drill-down, opened from the catalogue).
- **Purpose:** Go from "what's our FCR right now" down to the individual interactions behind that number — one generic explorer shell driven by a per-ratio definition registry, not 21 bespoke pages.
- **Information shown (catalogue):** Ratio list. **(Explorer):** hero value + trend chart + breakdown table (by intent/agent/campaign/outcome/direction) + driver panel (once a breakdown row is selected) + paginated interaction table (once any filter/drill layer is active) + compare control + removable filter chips.
- **Actions:** Read-only — open a ratio, breakdown select, drill, compare date ranges.
- **Data source:** `useRatioSummary`/`useRatioTrend`/`useRatioBreakdown`/`useRatioDrivers`/`useRatioInteractions` → `src/server/analytics/ratioMath.ts`/`ratioDimensions.ts` via an API layer; drill dimensions come from a frontend registry independently re-validated server-side per request.
- **Persistence:** None.
- **Relationships:** Breakdown → Driver panel → Interaction table → (click-through to Call/Chat Detail not independently confirmed this pass — carried to Phase 2).
- **Limitations:** An invalid `ratioId` in the URL is handled with a clean message, not a crash — a deliberately-built edge case.
- **Mock/placeholder:** None.
- **Maturity: FUNCTIONAL** (both).

### 4.26 Reports

- **Route:** `/reports` — explicitly in `UNLISTED_ROUTES`, kept only for bookmark back-compat; no other screen links to it.
- **Purpose:** Nominally a report catalogue/generator; in practice dead code.
- **Information shown:** `generateIndustryReports()` returns 3 hardcoded report objects with a hardcoded `lastGenerated` timestamp; a "Quick Stats" row hardcodes "12 Scheduled Reports" and "156 Downloads This Month" as literal JSX.
- **Actions:** Every report card's Eye/Download/Settings icon buttons have **no `onClick` handler at all**. Only genuinely interactive bits: client-side search/category-filter/favorite-toggle against the 3 fake records.
- **Data source:** `useIndustryData`/`useIndustryTerminology` — the same pre-Session-7 mock-data generators Analytics's own code comment says it replaced.
- **Persistence:** None.
- **Relationships:** Orphaned.
- **Mock/placeholder:** The entire screen.
- **Maturity: PLACEHOLDER** (effectively dead code, confirmed by its own navigation-config comment).

### 4.27 User Management

- **Route:** `/user-management`, sidebar (Govern).
- **Purpose:** Nominally administer user accounts/roles/permissions.
- **Information shown:** A table of exactly 2 hardcoded users (`src/data/sampleUsers.ts` — the same two identities used as demo login accounts app-wide), each with a hardcoded permission-badge subset and a hardcoded "Active" status dot; a hand-built role×permission matrix where each cell's color is a hardcoded string-literal check, not derived from any real ACL data.
- **Actions:** Read — search/filter the 2 static records. **"State-changing" controls exist visually but are non-functional**: "Add User," Edit, "Manage permissions," and Remove all render with no `onClick` at all.
- **Data source:** `src/data/sampleUsers.ts` — static, not Supabase, not any API.
- **Persistence:** None.
- **Relationships:** None observed.
- **Limitations:** The permission matrix doesn't reflect the app's real `AuthContext`/`hasPermission` system used everywhere else.
- **Mock/placeholder:** Entire screen.
- **Maturity: PLACEHOLDER.**

### 4.28 Settings

- **Route:** `/settings`, sidebar (Govern), 5 tabs (General, Notifications, Security, AI Configuration, Appearance).
- **Purpose:** Nominally app/account configuration.
- **Information shown / Actions — mixed by tab:**
  - **Appearance: genuinely real.** Backed by `useTheme()`/`ThemeContext`, persists the light/dark/system preference to `localStorage` and actually drives the app's resolved theme.
  - **General/Notifications/Security/AI Configuration: not real.** Every field is a local `useState` with hardcoded `defaultValue`s (e.g. company name "TARDIS AI Corporation," session timeout "30") or uncontrolled native selects. The screen-level **"Save Changes" button's entire handler is `console.log('Settings saved')`** — nothing persists.
- **Data source:** `ThemeContext`/`localStorage` for Appearance only; nothing for the other 4 tabs.
- **Persistence:** Appearance only, via `localStorage`.
- **Relationships:** None.
- **Limitations:** The single "Save Changes" button implies all 5 tabs save together; 4 of 5 save nothing, and the button does nothing real at all.
- **Mock/placeholder:** 4 of 5 tabs.
- **Maturity: PARTIAL** — one genuinely functional sub-feature (Appearance) embedded in an otherwise fully static shell with a decorative Save button.

---

## 5. Current functional-flow map

```
Login (/) → [session in localStorage] → Dashboard

Dashboard ──┬─→ Call Detail (dialog)
            ├─→ Call Logs → Call Detail (dialog)
            └─→ Agent Detail

Live View ──┬─→ (hand-rolled) View Details dialog
            └─→ Agent Detail

Initiate Call → [places a real call] → (later appears in) Call Logs → Call Detail

Chat (Console) → [sends real messages, persists chat_sessions] → (later appears in) Chat Logs → Chat Detail

Call Logs → Call Detail (dialog)
Chat Logs → Chat Detail (dialog)

Customers → Customer Detail ──┬─→ Call Detail (dialog)
                               ├─→ Chat Detail (dialog)
                               └─→ Campaign row "View call" → Call Detail (dialog)

Outbound Campaigns ──┬─→ Create Campaign → [on save] → Campaign Detail
                      └─→ Campaign Detail ──┬─→ Campaign Configuration (dialog)
                                             ├─→ Campaign History (dialog)
                                             ├─→ Target Actions Menu (per row)
                                             ├─→ Add Targets (dialog)
                                             └─→ Call Detail (dialog, via target Transcript/Recording)

QA Review (Interaction Quality) ──┬─→ Call Detail (dialog)
                                   └─→ Chat Detail (dialog)

AI Agents → Agent Detail ──┬─→ Call Detail (dialog)
                            └─→ Chat Detail (dialog)

WhatsApp Hub ←→ [shared Supabase tables, no UI link] ←→ Formatting Hub

Analytics (Campaigns tab) → [same data as] → Outbound Campaigns
Analytics (Customers tab) → [same data as] → Customers

Ratios (catalogue) → Ratio Explorer → Breakdown → Driver panel → Interaction table
                                                                   (click-through to Call/Chat Detail: unconfirmed)

AI Orchestrator: Flow Library → Flow Editor   [visual only — no real data flows through either]
AI Orchestrator: Integrations                 [orphaned — no inbound link from anywhere]

Reports                                       [orphaned — no inbound link from anywhere]
```

Notable observations from this map:
- **`InteractionDetailDialog` (Call Detail) is the single most-reused functional surface in the product** — reached from Dashboard, Live View (a separate hand-rolled copy, not this one), Call Logs, Customer Detail, Campaign Detail, and QA Review.
- **Customer360 is a terminal node reached from exactly one place** (Customers list) and leads only to Call/Chat Detail — no screen currently links *into* Customer360 from Call Logs, Chat Logs, Campaign Detail, or Agent Detail, despite all of those screens displaying customer-identifying information.
- **Three screens are genuinely orphaned** (no inbound link from any other screen): Orchestrator Integrations, Reports, and (within Orchestrator) the fact that Flow Editor's canvas never actually loads an existing flow's content even when opened "from" the library.

---

## 6. Static/mock/placeholder findings — consolidated

| Screen | Finding | Evidence |
|---|---|---|
| Login / Auth | Entire identity/credential system is a hardcoded `sampleUsers` array with one shared hardcoded password, localStorage-only session, no server verification | `src/contexts/AuthContext.tsx:4,55` |
| NPS Campaigns | Entire screen is `useIndustryData()`-generated mock data, explicitly self-disclosed via an in-UI banner | `src/pages/NPSCampaigns.tsx:191` |
| AI Orchestrator — Flow Library | Entire dataset hardcoded (`sampleFlows`), including fabricated usage metrics presented as real; "Create Flow" is dead code (`&& false`) | `src/data/orchestratorFlows.ts`, `src/pages/FlowLibrary.tsx:64` |
| AI Orchestrator — Flow Editor | Save/Validate/Simulate are all fake and **actively misrepresent success** via toasts; canvas never loads an existing flow's real content; explicit `// TODO: Save to database` left in shipped code | `src/components/orchestrator/FlowEditor.tsx:42-43,89-105` |
| AI Orchestrator — Integrations | Entire screen hardcoded, both action buttons inert, screen is unreachable from any in-app navigation | `src/components/orchestrator/IntegrationsManager.tsx:11-36` |
| Reports | Entire screen fabricated (3 hardcoded reports, hardcoded "Quick Stats," all action buttons inert); route deliberately excluded from nav with an in-repo comment confirming it's legacy mock data | `src/pages/Reports.tsx:63-115,252,263,352-360`, `src/components/layout/pillarNav.ts:122-126` |
| User Management | Entire screen is 2 hardcoded users + a hardcoded permission matrix disconnected from the app's real permission system; every action button inert | `src/data/sampleUsers.ts`, `src/pages/UserManagement.tsx:34-37,105-113,143-177` |
| Settings | 4 of 5 tabs are hardcoded `defaultValue`s with a Save button whose entire handler is `console.log('Settings saved')`; only Appearance is real | `src/pages/Settings.tsx:20-22` |
| WhatsApp Hub | One static element: the "Connected to Sandbox" indicator is a fixed badge with no real connectivity check | `src/components/whatsapp/WhatsAppSidebar.tsx:47-51` |

No other screen in this inventory contains fabricated application behavior. Every other "FUNCTIONAL"/"PARTIAL" screen's data paths trace to a real Supabase table, a real external API, or a real Supabase Edge Function — confirmed per-screen above. Legitimate test/integration data stored in real systems (e.g. campaign test records, Phase E proof calls referenced in prior session docs) is explicitly **not** flagged here, per the audit's own instruction.

---

## 7. Questions carried into Phase 2

**Customer360 (priority — explicit audit focus area):**
1. The Activity/Diary subsystem is fully implemented server-side (`GET/POST /api/customers/[id]?action=activities`, 5 activity types: note/instruction/task/reminder/appointment, with an `activeInstructionsOnly` filter mode referencing a design doc §4.2/§7.2) but has **zero frontend consumption anywhere** — no hook, no component. Confirm scope/cost of wiring it to Customer Detail.
2. `Customer.authSummary` (`everAuthenticated`, `lastAuthenticatedAt`) exists on the aggregate type but isn't rendered anywhere on Customer Detail.
3. `Customer.channels` (precomputed list of channels used) exists but isn't surfaced as a summary value.
4. `Customer.latestAgentId`/`latestAgentDisplayName` exist but aren't in the Summary MetricStrip.
5. `CustomerInteractionRecord.recordingAvailable` and `.escalationTrigger` exist per-row but aren't columns/indicators in the Interaction History table.
6. Identity & Contact shows only CIF + phone — confirm whether the backend model holds additional fields (e.g. email contact points, a declared `ContactPointType`) never rendered.
7. `reconcileJob.ts`/`backfillJob.ts` exist server-side — confirm whether any reconciliation/backfill status is exposed anywhere in the UI.

**Cross-screen Customer360 linkage:**
8. Chat Logs/Chat Detail show a resolved customer identity/CIF as plain text with no link into Customer360.
9. Call Detail shows a customer identity and campaign name as plain text with no link to Customer360 or Campaign Detail, despite the identical data being a real link elsewhere.
10. Campaign Detail's target rows show no link to the target's Customer360 record.
11. Confirm whether Customer360's own view of a chat session has the same pagination-cap limitation documented for category-scoped roles on Chat Logs.

**Call/Live View:**
12. Does the backend `/call-data` API genuinely lack server-side filtering on agent/FCR/authenticated/campaign, or is the frontend just not using params that exist?
13. Live View's hand-rolled "View Details" dialog still renders a `call.analysis.*` block that Call Detail's shared dialog already found to always duplicate other fields and deliberately dropped — confirm whether `analysis.*` ever carries genuinely distinct values.
14. Is there a true full-history (not page-scoped) export capability anywhere in the backend that Call Logs doesn't expose?
15. `api/calls/session/[id].ts` (live transcript) wasn't independently traced against everything `InteractionDetailDialog` renders — confirm full field coverage.

**Campaigns:**
16. Does Campaign Detail's target table have access to a customer_id that a Customer360 link could use, just not currently wired?
17. Legacy `campaign_result_rules` data for pre-12.7 campaigns — is it visible anywhere today, or only via the now-conditional Create Campaign editor?
18. `campaign_configuration_versions` stores full agent-contract/outcome-policy snapshots per version — Campaign History only shows event summaries; is a full version-by-version diff ever surfaced?
19. Root cause of the self-flagged `campaign.stats.targetCount` vs. rendered-rows join gap.

**Chat:**
20. How much of Chat's captured per-turn metadata (dataSource/confidence/etc.) does Chat Logs/Chat Detail actually surface versus what's available?
21. Confirm what generates the `?phone=`-bearing link WhatsApp Authenticate depends on (appears to live entirely outside this repo, inside the WhatsApp bot's own backend).

**Analytics/Ratios:**
22. Does `InteractionTable` in Ratio Explorer link out to Call/Chat Detail, or is drill-down currently terminal at the interaction-row level?
23. Is there a Supabase-side aggregate function that could give Analytics a real role/category-filtered global metric, closing the scoped-role "page-sample fallback" gap?
24. Does Supabase have the data to support a genuine category/role permission model for the Campaigns Analytics tab (which currently has none)?

**Platform-wide:**
25. Is there any real backend user/role/permission table in Supabase that User Management and Settings could eventually bind to, or does one not yet exist in the schema at all?
26. WhatsApp Hub and Formatting Hub share `vapi_response_logs`/`whatsapp_messages` data but have no UI cross-navigation — is there a `session_id`-based join that could link a formatting log back to its WhatsApp conversation?
27. Does Supabase contain any table backing Orchestrator flows/nodes/edges/integrations at all, or is there genuinely zero backend capability built for that functional area?

---

## 8. Repository evidence index (by functional area)

- **Auth:** `src/contexts/AuthContext.tsx`, `src/components/auth/ProtectedRoute.tsx`, `src/pages/Index.tsx`, `src/data/sampleUsers.ts`
- **Dashboard/Live View:** `src/pages/Dashboard.tsx`, `src/pages/LiveView.tsx`, `src/hooks/calls/useLiveCallData.ts`, `src/hooks/analytics/useAnalyticsMetrics.ts`
- **Initiate Call/Chat:** `src/pages/InitiateCall.tsx`, `src/pages/ChatConsole.tsx`, `src/components/chat/ChatIdentitySelector.tsx`, `api/calls/trigger.ts`, `api/chat/index.ts`
- **Call Logs/Detail:** `src/pages/CallLogs.tsx`, `src/components/call-logs/InteractionDetailDialog.tsx`, `src/hooks/calls/useCallData.ts`, `src/hooks/calls/useInteractionTranscript.ts`, `api/calls/data.ts`, `api/calls/session/[id].ts`
- **Chat Logs/Detail:** `src/pages/ChatLogs.tsx`, `src/components/chat/ChatSessionDetailDialog.tsx`, `src/components/interaction-detail/*`, `src/hooks/chat/useChatLogs.ts`, `api/chat/logs.ts`
- **Customer360:** `src/pages/Customers.tsx`, `src/pages/CustomerDetail.tsx`, `src/server/customer360/*` (incl. `activityRepository.ts`, `types.ts`, `reconcileJob.ts`, `backfillJob.ts`), `api/customers/*`
- **Campaigns:** `src/pages/OutboundCampaigns.tsx`, `src/pages/CreateCampaign.tsx`, `src/pages/CampaignDetailPage.tsx`, `src/components/campaigns/*`, `src/pages/NPSCampaigns.tsx`, `src/services/campaigns/campaignsService.ts`, `api/campaigns.ts`, `src/server/campaigns/*`
- **QA/WhatsApp/Formatting:** `src/pages/QAReview.tsx`, `src/pages/WhatsAppHub.tsx`, `src/pages/WhatsAppAuthenticate.tsx`, `src/components/whatsapp/*`, `src/pages/FormattingHub.tsx`, `supabase/functions/send-whatsapp-message/`, `supabase/functions/whatsapp-webhook/`, `supabase/functions/validate-password/`, `supabase/functions/send-otp/`, `supabase/functions/reset-password/`, `supabase/functions/process-pending-message/`
- **AI Agents/Orchestrator:** `src/pages/AIAgents.tsx`, `src/pages/AgentDetail.tsx`, `src/hooks/agents/useAgentDetail.ts`, `api/agents/index.ts`, `src/pages/Orchestrator.tsx`, `src/pages/OrchestratorNew.tsx`, `src/pages/OrchestratorFlow.tsx`, `src/pages/OrchestratorIntegrations.tsx`, `src/components/orchestrator/*`, `src/data/orchestratorFlows.ts`, `src/types/orchestrator.ts`
- **Analytics/Ratios/Reports/Admin:** `src/pages/Analytics.tsx`, `src/components/analytics/*`, `api/analytics/metrics.ts`, `src/pages/Ratios.tsx`, `src/pages/RatioExplorer.tsx`, `src/server/analytics/ratioMath.ts`, `src/server/analytics/ratioDimensions.ts`, `src/pages/Reports.tsx`, `src/pages/UserManagement.tsx`, `src/pages/Settings.tsx`, `src/contexts/ThemeContext.tsx`
- **Navigation/routing:** `src/App.tsx`, `src/components/layout/pillarNav.ts`
