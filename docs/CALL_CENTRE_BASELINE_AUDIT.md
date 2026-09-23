# Call Centre Application — Baseline Audit

**Phase:** 1 — Inspect & document only. No behavior, UI, routing, or Supabase changes were made while producing this report.
**Repo:** `C:\projects\call-center` (single commit `5b3ee79 "Working Lovable baseline"`, branch `main`)
**Date:** 2026-09-22

---

## 1. Executive Summary

This is a Lovable-generated Vite + React + TypeScript SPA for a multi-tenant ("industry-switchable") call centre product ("TARDIS VoiceForce"). It has **19 screens / 21 routes**, all wired and reachable.

Of the app's functional surface:

- **Genuinely live today:** WhatsApp authentication/OTP, WhatsApp chat, and Formatting Hub — all via Supabase (Postgres + Edge Functions + Realtime). Initiate Call is also live, calling the external Vapi.ai voice API directly from the browser.
- **Entirely mock/simulated today:** Dashboard, Call Logs, Outbound Campaigns, NPS Campaigns, Live View, QA Review, AI Agents, Orchestrator (all 4 sub-screens), Analytics, Reports, User Management. These read from static fixture files in `src/data/` and/or "industry-aware" generator functions in `src/utils/industry*.ts` — nothing is fetched from a network in these screens. Settings persists nothing at all (not even to `localStorage`).
- **No service/data-source abstraction layer exists.** A prior Lovable planning document (`.lovable/plan.md`) already identified this gap and proposed building exactly such a layer, but that plan was never executed — the current README still contains the generic Lovable template text, not the documentation described in that plan.
- **Main application login is not Supabase auth.** It is a client-side check against a hardcoded password (`password123`) matched against `src/data/sampleUsers.ts`, with the resulting user object cached in `localStorage`. Supabase is used only for the separate WhatsApp OTP flow.
- **One real, exposed secret:** a Vapi.ai bearer token and phone-number ID are hardcoded in `src/utils/initiateCallApi.ts` and shipped in the browser bundle.
- **Four Supabase tables have Row-Level Security enabled but fully permissive policies** (`USING (true) WITH CHECK (true)`), meaning anyone holding the public anon key (which is embedded in the bundle) can read/write those tables directly, bypassing the edge functions.
- **Build, type-check pass clean.** Lint has 68 pre-existing errors (mostly `no-explicit-any`) and 17 warnings — none block the build. No test suite exists in the repo.
- **No connection yet exists** between this frontend and the external Call Centre API server (static public IP) referenced in the target architecture — that integration has not started.

---

## 2. Current Architecture

```mermaid
flowchart TB
    subgraph Browser["Browser (React SPA)"]
        Router["react-router-dom<br/>21 routes"]
        Pages["src/pages/* (19 screens)"]
        Ctx["Contexts: Auth, Industry, Layout"]
        Hooks["Hooks: useIndustryData, useInitiateCall"]
        DataFiles["src/data/*.ts<br/>static fixtures"]
        Generators["src/utils/industry*.ts<br/>generators"]
        SupaClient["Supabase JS client<br/>(hardcoded URL + anon key)"]
    end

    subgraph Supabase["Supabase Project (wyzmsetlxltnojyxjkkd)"]
        DB[(Postgres tables:<br/>whatsapp_*, sms_messages,<br/>vapi_response_logs,<br/>orchestrator_*, user_roles)]
        Realtime[Realtime channels]
        EdgeFns["Edge Functions:<br/>send-otp, validate-password,<br/>reset-password, send-sms,<br/>send-whatsapp-message,<br/>whatsapp-webhook,<br/>process-pending-message"]
    end

    subgraph ThirdParty["Third-party services"]
        Twilio["Twilio (SMS/WhatsApp)"]
        Vapi["Vapi.ai voice API"]
    end

    subgraph Future["Not yet integrated"]
        CallCentreAPI["Existing Call Centre API<br/>(static public IP)<br/>— no code references it"]
    end

    Router --> Pages
    Pages --> Ctx
    Pages --> Hooks
    Hooks --> Generators --> DataFiles
    Pages -. "direct mock import\n(bypasses hooks)" .-> DataFiles
    Pages -->|WhatsApp Hub, Formatting Hub,\nWhatsApp Authenticate| SupaClient
    SupaClient --> DB
    SupaClient --> Realtime
    SupaClient -->|functions.invoke| EdgeFns
    EdgeFns --> Twilio
    EdgeFns --> DB
    Pages -->|Initiate Call: direct fetch()\nwith hardcoded API key| Vapi

    style Future stroke-dasharray: 5 5
    style CallCentreAPI stroke-dasharray: 5 5
```

---

## 3. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | React | 18.3.1 |
| Language | TypeScript | 5.5.3 |
| Build tool | Vite (+ `@vitejs/plugin-react-swc`) | 5.4.1 |
| Lovable dev tooling | `lovable-tagger` (dev-mode Vite plugin only) | 1.1.7 |
| Routing | react-router-dom | 6.26.2 |
| Styling | Tailwind CSS + shadcn/ui (Radix primitives) | Tailwind 3.4.11 |
| Forms | react-hook-form + zod + @hookform/resolvers | — |
| Data-fetching lib | @tanstack/react-query | 5.56.2 — **installed and provider-wrapped in `App.tsx`, but `useQuery`/`useMutation` are never called anywhere in `src/`** |
| Backend-as-a-service | @supabase/supabase-js | 2.50.2 |
| Flow canvas (Orchestrator) | reactflow | 11.11.4 |
| Charts | recharts | 2.12.7 |
| Package manager | npm (package-lock.json present) — `bun.lockb` also present but appears stale/unused alongside it | — |
| Linting | ESLint 9 flat config + typescript-eslint | — |
| Tests | **None found** — no test runner, no `*.test.*`/`*.spec.*` files, no `test` script in `package.json` | — |

---

## 4. Route & Screen Inventory

All 19 screens confirmed present and wired in `src/App.tsx` (21 `<Route>` entries including the catch-all):

| # | Screen | Route | Page component | Guard |
|---|---|---|---|---|
| 1 | Login / Landing | `/` | `pages/Index.tsx` | Public |
| 2 | WhatsApp Authenticate | `/whatsapp-authenticate` | `pages/WhatsAppAuthenticate.tsx` | Public |
| 3 | Dashboard | `/dashboard` | `pages/Dashboard.tsx` | `ProtectedRoute` |
| 4 | Initiate Call | `/initiate-call` | `pages/InitiateCall.tsx` | `ProtectedRoute` |
| 5 | Call Logs | `/call-logs` | `pages/CallLogs.tsx` | `ProtectedRoute` |
| 6 | Outbound Campaigns | `/outbound-campaigns` | `pages/OutboundCampaigns.tsx` | `ProtectedRoute` |
| 7 | Create New Outbound Calling Campaign | `/outbound-campaigns/create` | `pages/CreateCampaign.tsx` | `ProtectedRoute` |
| 8 | NPS Campaigns | `/nps-campaigns` | `pages/NPSCampaigns.tsx` | `ProtectedRoute` |
| 9 | Live View | `/live-view` | `pages/LiveView.tsx` | `ProtectedRoute` |
| 10 | QA Review | `/qa-review` | `pages/QAReview.tsx` | `ProtectedRoute` |
| 11 | WhatsApp Hub | `/whatsapp-hub` | `pages/WhatsAppHub.tsx` | `ProtectedRoute` |
| 12 | Formatting Hub | `/formatting-hub` | `pages/FormattingHub.tsx` | `ProtectedRoute` |
| 13 | AI Agents | `/ai-agents` | `pages/AIAgents.tsx` | `ProtectedRoute` — **hidden from Sidebar nav** (`Sidebar.tsx:48` explicitly filters `item.name !== 'AI Agents'`) but fully reachable by direct URL, confirmed intentional per `.lovable/plan.md`. **Left unchanged.** |
| 14 | Orchestrator — list | `/orchestrator` | `pages/Orchestrator.tsx` → `FlowLibrary` | `ProtectedRoute` |
| 15 | Orchestrator — new | `/orchestrator/new` | `pages/OrchestratorNew.tsx` → `FlowEditor` | `ProtectedRoute` |
| 16 | Orchestrator — flow editor | `/orchestrator/flow/:flowId` | `pages/OrchestratorFlow.tsx` → `FlowEditor` | `ProtectedRoute` |
| 17 | Orchestrator — integrations | `/orchestrator/integrations` | `pages/OrchestratorIntegrations.tsx` → `IntegrationsManager` | `ProtectedRoute` |
| 18 | Analytics | `/analytics` | `pages/Analytics.tsx` | `ProtectedRoute` |
| 19 | Reports | `/reports` | `pages/Reports.tsx` | `ProtectedRoute` |
| 20 | User Management | `/user-management` | `pages/UserManagement.tsx` | `ProtectedRoute` |
| 21 | Settings | `/settings` | `pages/Settings.tsx` | `ProtectedRoute` |
| — | Not Found | `*` | `pages/NotFound.tsx` | `ProtectedRoute` (wrapped, so an unauthenticated user hitting a bad URL sees the login form, not the 404 page) |

Sidebar nav items are additionally gated by a `permission` string checked via `hasPermission(user, permission)` (`src/contexts/AuthContext.tsx`), driven by the `permissions[]` array on each mock user in `sampleUsers.ts`.

---

## 5. Component Architecture

- `src/pages/*` — one component per route/screen, generally thin containers that pull data (via hooks or direct imports) and compose feature components.
- `src/components/<feature>/*` — feature-scoped components (e.g. `campaigns/`, `nps/`, `orchestrator/`, `whatsapp/`, `call-logs/`, `csat/`, `dashboard/`, `initiate-call/`, `qa/`).
- `src/components/orchestrator/canvas/` — a React Flow-based visual flow editor: `Canvas.tsx`, `NodePalette.tsx`, `NodeInspector.tsx`, a custom edge, and 10 typed node components (Start, End, IntentRouter, KBAnswer, ProductLookup, CollectDTMF, ComposeReply, APICall, Authentication, HumanEscalation, Listen).
- `src/components/layout/` — `Layout.tsx`, `Sidebar.tsx`, `UserProfile.tsx`, `IndustryIndicator.tsx`. `Layout` is the shell wrapping all protected pages.
- `src/components/ui/` — the full shadcn/ui primitive set (buttons, dialogs, tables, forms, etc.), largely untouched from the shadcn template.
- Providers are mounted in `src/main.tsx`: `IndustryProvider` → `AuthProvider` → `App` (which itself wraps `QueryClientProvider` → `TooltipProvider` → toasters → `BrowserRouter`).

---

## 6. Data Source Architecture

**No `services/` or `api/` abstraction layer exists.** This was already identified and explicitly planned in `.lovable/plan.md` (section 2, "Centralising sample data") but never implemented. Today, three different access patterns coexist:

1. **Hook-mediated fixture/generator access** (most screens) — `useIndustryData()` (`src/hooks/useIndustryData.ts`) memoizes calls into `src/utils/industryDataGenerator.ts`, which procedurally builds industry-flavored data (banking / telecom / airlines / hotels / hospitals / automotive / insurance) seeded from the static files in `src/data/`.
2. **Direct generator calls, bypassing the hook** — Live View and Create Campaign call generator functions (`generateIndustrySpecificLiveViewCalls`, `generateIndustrySpecificSalesforceCampaigns`, etc.) directly instead of through `useIndustryData()`. Functionally similar, just inconsistent.
3. **Direct mock-file or inline imports, bypassing everything** — the clearest gaps to close before real API wiring:
   - `UserManagement.tsx` → imports `sampleUsers` directly
   - `OutboundCampaigns.tsx` → imports `sampleCallScripts` directly (alongside its generator calls)
   - `FlowLibrary.tsx` / `FlowEditor.tsx` (Orchestrator list/new/flow-editor) → import `sampleFlows` from `src/data/orchestratorFlows.ts` directly — notable because Supabase **already has** `orchestrator_flows`/`orchestrator_versions`/etc. tables (see §9) that the UI does not use at all
   - `QAReview.tsx` → data is hardcoded as literal arrays **inside the page component**, not even in a `src/data/` file
   - `IntegrationsManager.tsx` (Orchestrator Integrations) → same, fully inline hardcoded array
   - `AuthContext.tsx` → imports `sampleUsers` directly (expected — this *is* the mock-auth layer)

`Settings.tsx` has no data layer at all: `handleSave` only `console.log`s; nothing persists, even to `localStorage`.

Industry switching is driven by `IndustryContext` (`src/contexts/IndustryContext.tsx`), default `'banking'`, persisted to `localStorage['tardis_industry']`, with per-industry config/terminology in `src/types/industry.ts` (`INDUSTRY_CONFIGS`).

---

## 7. Screen-to-Data Mapping

| Screen | Data source / hook | Underlying file(s) | Returned type | Bypasses hook layer? |
|---|---|---|---|---|
| Login/Landing | `useAuth()` → `AuthContext` | `src/data/sampleUsers.ts` | `User` (`types/auth.ts`) | N/A (auth) |
| WhatsApp Authenticate | `supabase.functions.invoke()` (`validate-password`, `send-otp`, `process-pending-message`, `reset-password`) | — live Supabase | — | N/A — genuinely live |
| Dashboard | `useIndustryData()` | `industryDataGenerator.ts` | industry-derived | No — but several headline metrics are **hardcoded static values** (comment: "Static for the screenshot match"); other counters use `Math.random()` |
| Initiate Call | `useInitiateCall()` → `initiateCallApi.ts` (`makeApiCall`) | `src/data/initiateCallAgents.ts` for agent list; call history in `localStorage` (`tardis_call_history_{userId}`) | `InitiatedCall` (`types/initiateCall.ts`) | N/A — genuinely live external call (see §10) |
| Call Logs | `useIndustryData()` + `getIndustrySpecificTranscript()` | `industryDataGenerator.ts`, `industryTranscriptGenerator.ts`, `detailedTranscripts.ts` | industry-derived | No, but sentiment/confidence/intent-accuracy are randomized with `Math.random()` per render (non-deterministic) |
| Outbound Campaigns | `useIndustryData()` + `getIndustrySpecificCampaigns/Contacts()` | `industryCampaignGenerator.ts`, `industryCampaignContactGenerator.ts`, **+ direct `sampleCallScripts` import** | `OutboundCampaign` | **Yes — partial** |
| Create Campaign | `getIndustryCampaignTypes()`, `generateIndustrySpecificScripts()`, `generateIndustrySpecificSalesforceCampaigns()` | `industryDataGenerator.ts` | — | No — but note: "Salesforce" campaign import is **simulated client-side**, not a real Salesforce integration |
| NPS Campaigns | `useIndustryData()` | `sampleNPSCampaigns.ts`, `sampleNPSScripts.ts`, `sampleNPSResponses.ts` via generator | `NPSCampaign` | No |
| Live View | direct generator calls (no hook) | `industryDataGenerator.ts` | inline | No full bypass, but inconsistent pattern; data regenerated on industry change, "live" is simulated client-side with no polling/WebSocket |
| QA Review | **none — hardcoded inline arrays in the page** | none | none | **Yes — worst case** |
| WhatsApp Hub | live Supabase: Postgres tables + Realtime channel + `send-whatsapp-message` edge function | `Database` type (`integrations/supabase/types.ts`) | — | N/A — genuinely live |
| Formatting Hub | live Supabase query (`supabase.from(...).select()`) | — | — | N/A — genuinely live |
| AI Agents (hidden) | `useIndustryData()` | `sampleAIAgents.ts` via generator | — | No |
| Orchestrator (list/new/flow editor) | direct `sampleFlows` import, no hook | `src/data/orchestratorFlows.ts` | `types/orchestrator.ts` | **Yes** — despite matching Supabase tables already existing |
| Orchestrator Integrations | hardcoded inline array | none | none | **Yes — worst case** |
| Analytics | `useIndustryData()` for totals; chart trend data hardcoded inline | `industryDataGenerator.ts` + inline arrays | — | Partial |
| Reports | `useIndustryData()` + `hasPermission()` gating | `industryDataGenerator.ts`, `sampleReports.ts`, `types/reports.ts` | — | No |
| User Management | direct `sampleUsers` import | `src/data/sampleUsers.ts` | `User` | **Yes** |
| Settings | local `useState` only | none | none | N/A — no persistence at all |
| Not Found | none | none | none | N/A |

---

## 8. Current External Integrations

| Integration | Screens | Mechanism | Status |
|---|---|---|---|
| Supabase (Postgres + Realtime + Edge Functions) | WhatsApp Authenticate, WhatsApp Hub, Formatting Hub | `@supabase/supabase-js` client + `supabase.functions.invoke()` | Live, must remain operational |
| Twilio (SMS/WhatsApp send + webhook receive) | Behind the WhatsApp edge functions only (not called directly from the browser) | Edge functions call Twilio's REST API server-side | Live |
| Vapi.ai (voice calling) | Initiate Call | Direct `fetch('https://api.vapi.ai/call', ...)` from browser code, and referenced again server-side inside the `process-pending-message`/`whatsapp-webhook` edge functions (which also hold `VAPI_API_KEY`/`VAPI_ASSISTANT_ID` as edge-function secrets) | Live, but browser-side call exposes a credential (see §11) |
| Existing Call Centre API (static public IP) | None | No code anywhere references it | **Not yet integrated** — this is the subject of the next phase |

---

## 9. Supabase Usage

- **Client setup** (`src/integrations/supabase/client.ts`): the Supabase project URL and anon/publishable key are **hardcoded directly in this auto-generated file**, not read from `.env`/`import.meta.env`. A repo-wide search confirms `VITE_SUPABASE_*` / `import.meta.env` are **never referenced anywhere in `src/`** — the `.env` file's values are effectively unused by the running app (see §11).
- **Tables** (from `supabase/migrations/*.sql`): `whatsapp_messages`, `whatsapp_sessions`, `sms_messages`, `vapi_response_logs`, `user_roles`, and a full Orchestrator schema added in the most recent migration (`orchestrator_flows`, `orchestrator_versions`, `orchestrator_snippets`, `orchestrator_integrations`, `orchestrator_runs`, `orchestrator_approvals`) — **none of which the Orchestrator UI currently reads from** (see §6).
- **Row-Level Security:** enabled on all of the above, but policy strictness varies sharply by migration date:
  - Earlier migrations (`whatsapp_messages`, `whatsapp_sessions`, `sms_messages`, `vapi_response_logs`): RLS is **on**, but the policy is `USING (true) WITH CHECK (true)` — i.e. fully permissive, equivalent to no protection at all for anyone holding the public anon key.
  - The most recent migration (`user_roles`, all `orchestrator_*` tables, dated 2025-10-09): uses **proper granular, permission-based policies** (e.g. "Users with `orchestrator_view` can view flows"). This is the correct pattern and should be the template going forward.
- **Edge Functions** (`supabase/functions/`), all Deno `Deno.serve` handlers with CORS headers (`Access-Control-Allow-Origin: '*'`):
  - `send-otp` — generates a 6-digit OTP, delivers via WhatsApp or SMS (Twilio) depending on `SEND_OTP_METHOD`.
  - `validate-password` — hashes and checks a password server-side (SHA-256).
  - `reset-password` — validates OTP then updates a hashed password.
  - `send-sms` — sends an arbitrary SMS via Twilio.
  - `send-whatsapp-message` — sends a WhatsApp message via Twilio.
  - `whatsapp-webhook` — receives inbound Twilio WhatsApp webhooks, logs/stores them.
  - `process-pending-message` — bridges an inbound WhatsApp message to Vapi (voice) and Twilio, using `shared/vapi-formatter.ts` to format Vapi responses.
  - All functions correctly source `SUPABASE_SERVICE_ROLE_KEY`, `TWILIO_*`, and `VAPI_*` credentials from `Deno.env.get(...)` (edge-function secrets) — **none of these server-side secrets are exposed to the browser.** This is the correct pattern.

---

## 10. Voice Service Integration (Initiate Call)

- `src/utils/initiateCallApi.ts` calls `POST https://api.vapi.ai/call` directly from the browser with:
  - A hardcoded `Authorization: Bearer <token>` (Vapi.ai API key), literal string at `src/utils/initiateCallApi.ts:16`.
  - A hardcoded `phoneNumberId` literal at `src/utils/initiateCallApi.ts:6`.
- Both values are shipped in the client-side JS bundle and are visible to any user of the deployed app (view-source / devtools network tab). **This matches the prompt's expectation exactly** — it is a real, currently-exposed credential that must move server-side (e.g. behind a new edge function or the future API gateway) before production use, and should be treated as compromised/rotated once moved, since it is also committed to git history in this baseline.
- Call history is persisted only to `localStorage` (`tardis_call_history_{userId}`), not to Supabase or any backend — it is cleared on logout.

---

## 11. Security Observations

| Item | Location | Type | Risk | Recommendation |
|---|---|---|---|---|
| Vapi.ai bearer token + phoneNumberId hardcoded in frontend | `src/utils/initiateCallApi.ts:6,16` | **Secret** | High — callable by anyone who extracts it from the bundle; billing/abuse risk | Move call initiation behind a server-side gateway/edge function; rotate the key once moved |
| `.env` file committed to git | repo root, tracked (`git ls-files` confirms) | Mixed — contains only `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key), `VITE_SUPABASE_PROJECT_ID` | Low in isolation (Supabase anon key is designed to be public and access is meant to be enforced by RLS) but **bad practice**, and currently pointless since the code doesn't even read it | Stop committing `.env`; add to `.gitignore`; if kept, note it is dead config today since `client.ts` hardcodes the same values independently |
| Supabase URL/anon key hardcoded a second time, independently of `.env` | `src/integrations/supabase/client.ts:5-6` | Public config (anon key) | Low (anon key is safe to expose by design) | Fine to keep as-is; optionally consolidate to read from env at build time for easier rotation/environment promotion |
| RLS fully permissive (`USING (true) WITH CHECK (true)`) on 4 tables | `supabase/migrations/20250628*`, `20250629185059*`, `20250630101811*` | **Real vulnerability** | High — anyone with the public anon key (embedded in the bundle) can read/write `whatsapp_messages`, `whatsapp_sessions`, `sms_messages`, `vapi_response_logs` directly via the Supabase REST/JS client, bypassing all edge-function logic | Replace with real per-user/per-role policies before production, following the pattern already used for `user_roles`/`orchestrator_*` in the latest migration |
| Main app login is fully client-side and trivially bypassable | `src/contexts/AuthContext.tsx` | Architecture gap, not a "secret" | High for a real deployment — password is a literal `'password123'` constant; `ProtectedRoute` only checks for a `user` object read from `localStorage['tardis_user']`, which any user can hand-edit in devtools to grant themselves any role/permission set with no server round-trip | This is expected for a Lovable mock baseline; flag clearly that real authentication (ideally via Supabase Auth, consistent with the rest of the app) must replace this before go-live |
| Verbose `console.log` debug statements dumping user identity/permissions | `src/contexts/AuthContext.tsx` (login, hasPermission, logout, mount) | Info leakage (dev-only in intent) | Low-medium — no secrets logged, but full user objects and permission arrays are printed to the browser console on every permission check | Strip debug logging before any non-local deployment |
| Supabase `service_role` key | Not found anywhere in `src/` (grep negative) — only referenced via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` inside edge functions | Correctly server-side | None currently | No action needed; keep this pattern |
| CORS on all edge functions is `Access-Control-Allow-Origin: '*'` | `supabase/functions/*/index.ts` | Config | Low-medium — fine for current dev use, but should be scoped once a production domain is fixed | Restrict to the deployed origin(s) before production |
| `voiceforce-backend-v01-main.zip` (~488 KB) tracked in git at repo root; empty untracked `voiceforce-backend/` directory alongside it | repo root | Unknown/unexplored (not opened, per phase-1 "inspect only" scope) | Unknown — flagged for follow-up | Confirm with the team what this artifact is intended for; if it contains real backend code/secrets it likely should not live as a zip in this frontend repo's git history |

**Distinguishing normal public config from actual secrets:** the Supabase URL and anon/publishable key are *designed* to be public (protection is meant to come from RLS, which is currently insufficient on 4 tables — see above). The Vapi.ai bearer token is a genuine secret that must not be client-exposed. No Supabase `service_role` key, Twilio credentials, or Vapi credentials beyond the one in §10 were found exposed to the browser.

---

## 12. Hosting Architecture

- **Local dev:** `npm run dev` (Vite dev server, configured for host `::`, port `8080` in `vite.config.ts`). Confirmed working during this audit.
- **Build:** `npm run build` → static `dist/` output. Confirmed working (see §16). Output is a single large JS chunk (~1.56 MB / ~429 KB gzip) — Vite warns about this; not a functional blocker but worth code-splitting before production.
- **Vercel/custom-domain deployment:** nothing in the repo currently configures this (no `vercel.json`). As a Vite SPA, deploying to Vercel needs an SPA fallback rewrite (all paths → `index.html`) for client-side routing (`react-router-dom`) to work on hard refresh/deep links — currently unconfigured.
- **Environment variables:** `.env` values are unused by the app today (see §11); if a real backend/gateway is introduced, new env vars will be needed for its base URL, and existing Supabase env handling should be reconciled with the hardcoded values in `client.ts`.
- **CORS:** edge functions currently allow all origins (`*`); will need tightening once a production/custom domain is fixed.
- **HTTPS:** Supabase and Vapi.ai endpoints are HTTPS; no HTTP endpoints found.
- **WebSocket/SSE:** the only realtime channel in use is Supabase Realtime (WhatsApp chat), which works over WSS and is compatible with static/Vercel hosting since Supabase hosts the socket server, not this app.
- **API proxy/gateway:** none exists yet. This is precisely the "API integration / backend gateway" layer called out in the target architecture — it does not exist in this repo today.

---

## 13. Real API Integration Matrix

Endpoints are marked **TBD** per instruction — no endpoints are invented here; this only maps existing mock functions to what a future backend call would need to satisfy.

| Data-source function | Current source | Expected request (TBD endpoint) | Expected response type | Consuming screen(s) | Polling? | Realtime/WS? | Auth needed? | Browser- or server-side? |
|---|---|---|---|---|---|---|---|---|
| `useIndustryData()` → call logs | `industryDataGenerator.ts` | TBD — `GET /calls?industry=&filters=` | list of call-log records (`types` TBD) | Dashboard, Call Logs, Analytics, Reports | Likely yes, for near-real-time counts | Possibly (live counters) | Yes (session) | Browser-side fetch via a service layer is fine if the gateway enforces auth/CORS |
| `getIndustrySpecificCampaigns/Contacts()` | `industryCampaignGenerator.ts` | TBD — `GET/POST /campaigns` | `OutboundCampaign[]` | Outbound Campaigns, Create Campaign | On list view, maybe | No | Yes | Browser-side via gateway |
| `useIndustryData()` → NPS | `industryDataGenerator.ts` (NPS fixtures) | TBD — `GET/POST /nps-campaigns`, `/nps-responses` | `NPSCampaign[]` | NPS Campaigns | Maybe (response tallies) | No | Yes | Browser-side via gateway |
| QA review queue (currently inline) | Hardcoded in `QAReview.tsx` | TBD — `GET /qa/reviews` | TBD type (none exists yet) | QA Review | Maybe | No | Yes | Browser-side via gateway |
| `generateIndustrySpecificLiveViewCalls/Agents/Transcripts()` | `industryDataGenerator.ts` | TBD — `GET /live-view` or a stream | TBD | Live View | **Yes, likely required**, or | **WebSocket/SSE strongly appropriate here** | Yes | Server-side proxy for any streaming connection recommended |
| `useIndustryData()` → agents | `industryDataGenerator.ts` (`sampleAIAgents.ts`) | TBD — `GET /agents` | TBD | AI Agents, Dashboard | No | No | Yes | Browser-side via gateway |
| `sampleFlows` (Orchestrator) | `orchestratorFlows.ts` (direct import) | Supabase `orchestrator_flows`/`orchestrator_versions` tables **already exist** — likely served via Supabase directly rather than a new REST endpoint | `Database['public']['Tables']['orchestrator_flows']['Row']` | Orchestrator list/new/flow editor | No | Possibly (run status) | Yes (RLS-gated) | Browser-side via existing Supabase client, once wired |
| Orchestrator integrations (currently inline) | Hardcoded in `IntegrationsManager.tsx` | Supabase `orchestrator_integrations` table **already exists** | same pattern as above | Orchestrator Integrations | No | No | Yes | Browser-side via Supabase client |
| `useIndustryData()` → analytics/report aggregates | `industryDataGenerator.ts` + inline chart arrays | TBD — `GET /analytics`, `/reports` | TBD | Analytics, Reports | Maybe (dashboards) | No | Yes | Browser-side via gateway |
| `sampleUsers` (User Management, Auth) | `sampleUsers.ts` (direct import) | TBD — real auth/user-management API, or migrate to Supabase Auth + `user_roles` (table already exists) | `User` | Login, User Management, permission checks app-wide | No | No | This **is** the auth system | Must be server-verified — current client-only auth cannot simply be pointed at a REST GET |
| `makeApiCall()` (Vapi.ai) | Direct browser `fetch` to `api.vapi.ai` with hardcoded key | Move behind TBD gateway endpoint, e.g. `POST /calls/initiate`, gateway attaches the real Vapi key server-side | `InitiatedCall` | Initiate Call | No | No | Yes | **Must move server-side** — this is the one existing integration that needs re-architecting, not just repointing |
| Settings persistence | None (no-op) | TBD — `GET/PUT /settings` | TBD | Settings | No | No | Yes | Browser-side via gateway |

---

## 14. Recommended Integration Architecture

```
Existing Call Centre API Server (static public IP)
        ↓
API integration / backend gateway  (new — hides the static IP, injects real secrets, centralizes CORS/auth)
        ↓
This web application (via a new src/services/ or src/data-sources/ layer, per .lovable/plan.md's already-drafted approach)
        ↓
Development hosting → Vercel / custom domain
```

Concretely:

1. Build the `src/services/` (or `src/data-sources/`) layer proposed in `.lovable/plan.md` first — synchronous read functions per domain (calls, campaigns, NPS, QA, reports, analytics, users, orchestrator flows, live view), typed against the existing `src/types/*`, so every screen's import source changes but no screen's props/render tree does. This makes the later real-API swap a contained, low-risk change per function.
2. Wire the new gateway behind that layer using TanStack Query (already installed, currently unused) for caching/polling instead of ad hoc `useEffect`/`useState`.
3. Move the Vapi.ai call behind the gateway (or a new Supabase edge function) so the API key leaves the browser bundle entirely.
4. Fix the 4 permissive RLS policies before any production traffic touches those tables.
5. Wire the Orchestrator screens to the Supabase tables that already exist for them, rather than leaving that as a second, later migration.
6. Defer real authentication replacement (client-only mock → Supabase Auth or the future gateway's own auth) to an explicit, separate decision point, since it affects every protected route.

---

## 15. Issues / Risks / Unknowns

- **Unknown:** purpose and status of `voiceforce-backend-v01-main.zip` / `voiceforce-backend/` at repo root — not opened per phase-1 scope; needs clarification before the next phase.
- **Unknown:** whether `bun.lockb` (present alongside `package-lock.json`) reflects an intended package manager choice or stale artifact — the app was installed/run with npm during this audit without issue.
- **Risk:** the fully permissive RLS policies (§11) are live in the connected Supabase project right now, not just in this repo's history — this is a running exposure, not only a code smell.
- **Risk:** git history includes the exposed Vapi.ai key from the very first commit; moving it server-side later does not remove it from history — rotation is required, not just a code change.
- **Risk:** client-only auth means any "role-gated" behavior observed in this app (Sidebar items, Reports permissions, etc.) is a UI convenience only, not a real access boundary — important to set expectations correctly with stakeholders before the next phase is scoped as if auth already exists.
- **Open question:** README still contains generic Lovable boilerplate; `.lovable/plan.md` describes a more complete README that was apparently planned but never written — confirm whether that should be completed as part of, or before, the next integration phase.

---

## 16. Proposed Implementation Sequence

1. Clarify the `voiceforce-backend*` artifacts (§15) before scoping further work.
2. Rotate the exposed Vapi.ai credential; stop committing `.env`.
3. Tighten the 4 permissive Supabase RLS policies.
4. Build the `src/services/` abstraction layer (byte-for-byte identical output to today, per `.lovable/plan.md`) — no visual change, contained diff.
5. Wire Orchestrator screens to their already-existing Supabase tables (lowest-risk "real" integration to prove the pattern).
6. Stand up the API integration/backend gateway in front of the existing Call Centre API server; connect Dashboard/Call Logs/Campaigns/NPS/QA/Analytics/Reports/AI Agents through the new services layer, screen by screen.
7. Move Initiate Call's Vapi.ai request behind the gateway.
8. Evaluate Live View for polling vs. WebSocket/SSE once the gateway's real-time capabilities are known.
9. Replace client-only authentication with a real, server-verified mechanism (Supabase Auth or gateway-issued sessions), reconciling it with the existing WhatsApp OTP flow.
10. Configure Vercel/custom-domain hosting: SPA rewrite rule, environment variables, CORS scoping to the production origin.

---

## Build/Type/Lint Status (this audit run)

| Check | Command | Result |
|---|---|---|
| Dependency install | (pre-existing `node_modules/`, not reinstalled) | Present |
| TypeScript check | `npx tsc --noEmit -p tsconfig.app.json` | **Clean — no errors** |
| Lint | `npm run lint` | **68 errors, 17 warnings** — pre-existing, mostly `@typescript-eslint/no-explicit-any` across orchestrator node components, several pages, and `industryDataGenerator.ts`; a few `react-refresh/only-export-components` warnings from shadcn/ui + context files; one `no-constant-binary-expression` in `LiveView.tsx:444`; one `no-useless-escape` in `industryTranscriptGenerator.ts`; one `no-require-imports` in `tailwind.config.ts`. None block the build. |
| Tests | — | No test runner/framework configured; no test files present |
| Production build | `npm run build` | **Succeeds** — `dist/` produced in ~11s; single JS chunk is ~1.56 MB (429 KB gzip), Vite recommends code-splitting (not currently an error) |
