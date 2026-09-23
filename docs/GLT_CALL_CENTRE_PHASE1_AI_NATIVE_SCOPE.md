# Call Centre — Phase 1 AI-Native Product Scope

**Phase:** 4 — Product scope and implementation plan  
**Purpose:** Define the Phase 1 scope for an AI-native Call Centre Control Plane, map the existing Lovable application into that scope, identify additions/gaps, and divide implementation into eight Claude Code coding sessions.  
**Build principle:** No mock, random, simulated, or decorative business data remains in the completed Phase 1 product. Where the current UI has no valid live counterpart, the item is reviewed case by case: extend the backend/API, derive from live data, modify the UI, or remove it.

This document builds on:

- `CALL_CENTRE_BASELINE_AUDIT.md`
- `CALL_CENTRE_LIVE_INTEGRATION_PLAN.md`
- `CALL_CENTRE_FULL_FUNCTIONAL_SCOPE.md`
- Trigger Call API
- Session Transcript API
- Call Data API
- Voicebot Dashboard User Guide

---

## 1. Product Definition

Phase 1 will build an **AI-native Call Centre Control Plane**.

The AI Voice Agent is a separate execution system. Telephony call routing, SIP/PABX endpoint handling, and trunk routing are handled outside this product by the existing telephony/front-end layer.

The Call Centre product is responsible for operating, supervising, recording, evaluating, and analysing AI-agent interactions.

### 1.1 Product boundary

```text
Telephony / Front-End Layer
FreeSWITCH / PABX / SIP Trunk
        ↓
Defined AI-agent endpoint
        ↓
AI Voice Agent Runtime
        ↓
AI-Native Call Centre Control Plane
        ├── interactions
        ├── live operations
        ├── campaigns
        ├── operational customer context
        ├── AI-agent visibility
        ├── quality / evaluation
        ├── analytics
        ├── reports
        └── digital channel operations
```

### 1.2 Explicitly not in Phase 1

The Call Centre product will **not** attempt to become:

- a CRM;
- a telephony/PABX routing engine;
- a conventional workforce-management system;
- an AI-agent reasoning/orchestration engine;
- a replacement for the organisation's systems of record.

The organisation's CRM and other business systems remain authoritative for customer master data. The Call Centre may fetch essential customer context from those systems and feed interaction outcomes back to them.

---

## 2. Phase 1 Product Principles

1. **AI-native, not human-agent-first.**  
   Features must support supervision and operation of AI agents rather than copying conventional workforce-management concepts that are irrelevant when the AI agent is always available.

2. **Interaction-centric architecture.**  
   Voice is the first and dominant channel, but the architecture should treat a call as one type of interaction so WhatsApp and future channels can fit without redesigning the core.

3. **Domain-neutral.**  
   Current API examples may contain banking terminology, but the product and integration architecture must remain multi-domain.

4. **No fabricated operational data.**  
   The finished Phase 1 system must not display mock, random, hardcoded, or simulated business values.

5. **APIs may evolve.**  
   The current APIs are a strong starting point, not an immutable contract. If a required operational field/action is missing, the backend may be enhanced.

6. **Screens are not automatically sacred.**  
   Existing layouts are the starting point, but individual fields, metrics, buttons, or flows may be modified or removed when they do not make sense in the real product.

7. **Frontend screens do not call backend services directly.**  
   All live integration flows through a typed service/API layer and a thin server-side proxy/BFF.

8. **Authentication is last priority.**  
   The current development login can remain until the functional Call Centre is live. Proper authentication and user management are completed near the end of Phase 1.

9. **NPS and Orchestrator are deferred.**  
   NPS is a useful Voice-of-Customer extension but is not foundational to the Phase 1 Call Centre. The current Orchestrator is not required for the Phase 1 control plane and is lowest priority.

---

## 3. Core Phase 1 Functional Scope

Phase 1 consists of the following primary product modules.

### 3.1 Dashboard

Operational summary of the live Call Centre.

Core information:

- active interactions;
- interaction volume;
- resolved / escalated outcomes;
- FCR;
- average handling time;
- intent accuracy;
- sentiment;
- current agent activity;
- recent interactions;
- campaign activity;
- operational exceptions.

Hardcoded screenshot-match values and random values are removed.

### 3.2 Interactions

The authoritative interaction history for the Call Centre.

Initially focused on voice calls, with architecture capable of supporting other channels.

Capabilities:

- interaction list;
- filtering/search;
- inbound/outbound direction;
- customer/contact;
- AI agent;
- timestamps and duration;
- status/stage;
- outcome;
- intent and confidence;
- sentiment;
- escalation information;
- transcript;
- summary;
- recording/media;
- campaign reference;
- authentication/verification state;
- export where useful.

### 3.3 Interaction Detail

Detailed operational record of one interaction.

Includes:

- full transcript;
- recording/media;
- summary;
- intent;
- sentiment;
- outcome;
- AI-agent identity;
- customer/contact context;
- escalation details;
- quality/evaluation information where available;
- related campaign;
- interaction timeline.

### 3.4 Live Operations

Supervisor view of interactions currently in progress.

Capabilities:

- active calls;
- connecting/in-progress/escalated state;
- live duration;
- customer/contact;
- AI agent;
- current intent/context;
- live transcript;
- sentiment;
- exception/escalation visibility;
- transfer/escalation action only if supported by a real backend API.

This module is for **monitoring and operational intervention**, not telephony routing.

### 3.5 Initiate Call

Ad-hoc outbound call initiation.

Capabilities:

- enter destination number;
- select a live AI agent;
- optional customer/external ID;
- initiate call through the new Voice Agent backend;
- observe initial call state;
- link directly to the resulting interaction record.

Vapi is removed from this voice path.

### 3.6 Campaigns

A real outbound campaign subsystem.

Capabilities should include, subject to backend/API support:

- create campaign;
- edit/duplicate where useful;
- target contact list;
- CSV/API contact import;
- select AI agent;
- schedule;
- allowed calling window;
- call interval/concurrency where relevant;
- retry policy;
- callback/recycling policy where genuinely required;
- launch;
- pause/resume/cancel;
- progress;
- per-contact outcome;
- campaign interaction history;
- campaign analytics.

The existing Lovable campaign wizard is used as product-intent input, not as an unquestioned specification.

### 3.7 Operational Customers / Contacts

A **new Phase 1 module**.

This is not a CRM.

The Call Centre keeps only customer/contact information essential to interaction operations.

Minimum operational context:

- primary phone number;
- display name if known;
- optional external CRM/customer ID;
- tags/segment needed for operations;
- preferred language/channel if operationally relevant;
- first/last interaction timestamps;
- interaction count;
- recent intents;
- recent outcomes;
- recent sentiment;
- escalation history;
- campaign participation;
- links to transcripts/recordings/interactions.

The organisation's CRM remains the system of record for the broader customer profile.

Integration direction:

```text
CRM / Business Systems
        ↕
customer lookup / essential context
        ↕
AI-Native Call Centre
        ├── operational contact profile
        ├── interaction history
        ├── campaigns
        └── outcomes
```

The Call Centre should be able to:

- fetch essential customer context before/during an interaction;
- associate an interaction to a phone number and optional external customer ID;
- push interaction outcome/summary/disposition back to an external CRM where required.

### 3.8 AI Agents

Operational directory and performance view of AI agents.

Phase 1 should focus on:

- agent identity;
- name;
- direction/capability;
- live usage/activity where available;
- interaction counts;
- outcomes/success;
- escalation rate;
- quality metrics.

Agent configuration screens should only remain editable where a real backend configuration API exists. The Call Centre must not pretend to control AI-agent configuration if configuration is owned by the AI runtime.

### 3.9 Quality / Evaluation

AI-interaction quality management.

This replaces the conventional human-agent QA emphasis with AI-agent evaluation.

Evaluation dimensions may include, where supported:

- task completion;
- correct intent recognition;
- response correctness;
- policy/compliance adherence;
- appropriate tool usage;
- appropriate escalation;
- hallucination/error detection;
- interaction efficiency;
- customer sentiment;
- outcome/resolution;
- reviewer comments/manual score.

Automated signals can come from the Voice Agent backend; manual review/write-back requires persistence/API support.

### 3.10 Analytics & Reports

Analytics and Reports should use one shared live data/aggregation layer.

Core analytics:

- interaction volume;
- active concurrency;
- FCR;
- resolution/escalation rate;
- average handling time;
- intent distribution/accuracy;
- sentiment;
- campaign performance;
- AI-agent performance;
- quality/evaluation trends.

Reports:

- on-demand operational reports;
- CSV/download/export where useful;
- scheduled/multi-format reports only if confirmed as a real product requirement.

### 3.11 Digital Channel — WhatsApp

The existing WhatsApp transport remains a live product module.

Existing:

- Supabase;
- Twilio;
- conversation history;
- realtime updates;
- authentication flow.

Vapi-based AI reply generation must eventually be replaced with the new AI runtime's text/chat capability when its contract is available.

Long-term architectural direction: WhatsApp messages and voice calls can share the higher-level Interaction model while retaining their channel-specific implementation.

### 3.12 Administration

Supporting Phase 1 capabilities, implemented late:

- application authentication;
- user management;
- roles/permissions;
- persisted settings;
- deployment/environment configuration.

---

## 4. Core Interaction Model

The frontend/service architecture should normalize interaction data into a consistent operational model.

Recommended conceptual shape:

```text
interaction_id
channel
phone_number
customer_id (optional external reference)
agent_id
direction
start_time
end_time
status
outcome
intent
intent_accuracy
sentiment
sentiment_score
transcript
summary
recording/media
campaign_id
escalation
quality/evaluation
```

### 4.1 Current API coverage

The present Call Data / Session / Trigger APIs already cover much of this model:

- call/session identifier;
- channel;
- phone/caller number;
- agent identity;
- start time;
- status/stage;
- outcome;
- FCR;
- intent and intent accuracy;
- sentiment and sentiment score;
- transcript and summary;
- recording URL;
- campaign name;
- escalation trigger;
- analysis/confidence information.

Likely API enhancements to request:

- return `customer_id` in interaction/call-data responses;
- return `direction` explicitly on every interaction row;
- return `end_time`;
- provide a stable `campaign_id`, not campaign name only;
- expose customer/contact history lookup by phone number and/or external customer ID;
- expose or define quality/evaluation persistence;
- expose campaign lifecycle APIs;
- expose transfer/escalation action if Live Operations requires it;
- expose richer agent information/status if needed.

The frontend service layer may normalize `call_sid`, `call_id`, and `session_id` into one UI-facing `interactionId` without forcing an immediate backend rename.

---

## 5. Target Technical Architecture

```text
React Screens
     ↓
Hooks / View Models
     ↓
TanStack Query
     ↓
Typed Domain Services
     ↓
DTO ↔ UI Model Adapters
     ↓
Shared Transport Client
     ↓
Thin Server-Side Proxy / BFF
     ↓
Voice Agent / Call Centre APIs

Existing Supabase/Twilio
     ↓
WhatsApp / Formatting modules
```

### 5.1 Architecture rules

- no direct API calls from page components;
- API keys never exposed in browser bundles;
- DTO types mirror actual backend contracts;
- UI models remain independent from backend response naming;
- adapters own mapping/derivation logic;
- TanStack Query owns fetching/caching/polling/mutations;
- all errors normalized through one transport layer;
- no mock fallback after a module is converted to live;
- no new dependency unless justified;
- domain-neutral names throughout.

### 5.2 Suggested domain services

Create only when the domain is implemented:

```text
src/services/
  transport/
  calls/
  contacts/
  campaigns/
  agents/
  quality/
  analytics/
  reports/
  digital/
  users/
  settings/
```

Do not create speculative empty service modules.

---

## 6. Existing Screen → Phase 1 Scope Mapping

| Existing module/screen | Phase 1 treatment | Target role |
|---|---|---|
| Login / Authentication | Keep temporarily; replace late | Proper application auth in final Phase 1 session |
| Dashboard | **Retain + make live** | Operational control-plane summary |
| Initiate Call | **Retain + replace Vapi** | Ad-hoc outbound call initiation |
| Call Logs | **Retain + promote to Interactions** | Canonical interaction history |
| Transcript / Call Detail | **Retain + enhance** | Interaction detail with transcript/recording/context |
| Live View | **Retain + make live** | Live operational supervision, not routing |
| Outbound Campaigns | **Retain + fully implement** | Campaign lifecycle and progress |
| Create Campaign | **Retain + rationalize** | Real create/edit campaign workflow |
| NPS Campaigns | **Defer** | Optional Voice-of-Customer extension after Phase 1 |
| QA Review | **Retain + reshape** | AI Quality / Evaluation |
| WhatsApp Hub | **Retain live** | Digital-channel operations |
| WhatsApp Authenticate | **Retain live** | Existing channel-specific customer authentication |
| Formatting Hub | **Retain as supporting/admin** | Message-formatting/debug support |
| AI Agents | **Retain + simplify/realign** | Agent directory/status/performance; edit only where API supports it |
| Orchestrator | **Defer / hide** | Lowest priority; not part of core Phase 1 |
| Analytics | **Retain + make live** | Operational / agent / campaign / quality analytics |
| Reports | **Retain + simplify initially** | Real operational reports/export |
| User Management | **Retain but implement late** | Real users/roles/permissions |
| Settings | **Retain but implement late** | Persisted application settings |
| **Customers / Contacts** | **NEW** | Operational customer/contact context and interaction history |

### 6.1 Screens/features that should not survive unchanged

The following current patterns are explicitly temporary:

- hardcoded dashboard values;
- `Math.random()` business metrics;
- simulated Salesforce integration;
- fake toast-success actions that do not persist;
- `console.log` save/edit actions;
- dead controls with no handler;
- hidden/dead operational controls presented as if implemented;
- Vapi voice integration;
- client-local call history as system-of-record;
- duplicated mock agent directories;
- decorative report counts/metrics;
- mock industry generators as live data sources.

---

## 7. Backend/API Work Required for Phase 1

### 7.1 Already well covered

Current APIs strongly support:

- trigger outbound call;
- active/completed call data;
- summaries;
- status/stage;
- caller/phone information;
- agent information embedded in calls;
- outcome;
- FCR;
- handling time;
- intent/accuracy;
- sentiment;
- campaign name;
- transcript summary;
- detailed transcript;
- recording URL;
- escalation trigger;
- session transcript.

### 7.2 APIs/fields to request or confirm

Before or during implementation, request/confirm:

1. full `/agents` API contract;
2. `customer_id` returned in interaction records;
3. explicit `direction` on returned call rows;
4. `end_time`;
5. stable `campaign_id`;
6. lookup interaction history by phone number;
7. lookup interaction history by optional external customer ID;
8. campaign CRUD/lifecycle/contact-list APIs;
9. agent performance/status data where required;
10. live-call escalation/transfer action if retained;
11. QA/evaluation persistence/write-back;
12. text/chat API replacing Vapi for WhatsApp AI replies;
13. richer analytics endpoints if current call-data is insufficient;
14. CRM integration hooks/patterns for customer lookup and interaction outcome push.

The current API should be enhanced where necessary rather than forcing the frontend to fabricate missing operational data.

---

## 8. Phase 1 Definition of Done

Phase 1 is complete when:

- every Phase 1 core screen uses live data and real actions;
- no mock/random/simulated operational data remains in the active product;
- Vapi is removed from the voice-call path;
- existing WhatsApp/Twilio/Supabase functionality remains operational;
- the new AI runtime replaces Vapi chat where required;
- Campaigns are real and persistent;
- operational customer/contact history exists without becoming a CRM;
- AI-agent views use real agent data;
- Quality/Evaluation uses real interaction data and persists manual evaluation where included;
- Analytics and Reports are based on the same live data model;
- service/API architecture is modular and reusable;
- backend API keys are server-side only;
- authentication/user management/settings are made real before release;
- NPS and Orchestrator are excluded from the active Phase 1 product/navigation unless explicitly brought back by a later decision;
- production build passes and hosting is configured.

---

# 9. Eight Claude Code Coding Sessions

Each coding session must begin by reading:

- `docs/CALL_CENTRE_BASELINE_AUDIT.md`
- `docs/CALL_CENTRE_LIVE_INTEGRATION_PLAN.md`
- `docs/CALL_CENTRE_FULL_FUNCTIONAL_SCOPE.md`
- this document

Each session must:

1. preserve already-working functionality;
2. avoid UI redesign unless explicitly required by the approved scope;
3. use the shared service/API architecture;
4. remove mock paths only for modules completed in that session;
5. run TypeScript/build verification;
6. document changes and remaining gaps;
7. commit only after verification.

---

## Session 1 — Integration Foundation

### Objective

Create the production integration architecture without changing business-screen behaviour yet.

### Scope

- create thin server-side proxy/BFF;
- server-side backend base URL/API key configuration;
- create shared transport/error layer;
- establish DTO/UI-model separation;
- establish mapper pattern;
- configure TanStack Query conventions;
- define normalized Interaction and Contact operational types;
- define environment configuration for local and hosted deployment;
- confirm/fetch current API contracts before hardcoding types;
- no broad screen conversion yet.

### Deliverable

- reusable integration foundation;
- no backend secret in browser code;
- architecture document updated if implementation differs;
- build/type-check passes.

### Stop condition

Stop before converting all screens. Review architecture first.

---

## Session 2 — Core Interaction Lifecycle

### Objective

Make the fundamental AI Call Centre interaction path live end to end.

### Scope

- replace Vapi voice-call initiation;
- live AI-agent list for Initiate Call;
- `POST` call initiation;
- Call Logs → live Interactions;
- interaction filtering/search where API supports it;
- interaction detail;
- full transcript;
- recording playback;
- status/outcome/intent/sentiment;
- normalize `call_sid` / `call_id` / `session_id` to `interactionId`;
- remove mock/random data from these modules.

### Deliverable

A user can initiate a real call and subsequently see the same real interaction, transcript and recording in the product.

---

## Session 3 — Live Operations + Dashboard

### Objective

Make operational supervision and dashboard metrics live.

### Scope

- Live View using active interactions;
- polling through TanStack Query;
- current duration/stage/context/transcript;
- connecting/escalated counts;
- Dashboard operational metrics from the same interaction service;
- recent interactions;
- live AI-agent activity only where supportable from real data;
- remove hardcoded/random dashboard and Live View values;
- flag transfer/escalation control if backend action still unavailable rather than faking it.

### Deliverable

Dashboard and Live Operations display internally consistent live values sourced from the same interaction model.

---

## Session 4 — Customers / Contacts + CRM Boundary

### Objective

Add the operational customer/contact layer without creating a CRM.

### Scope

- new Customers/Contacts screen/module;
- phone number as primary operational identity;
- optional external CRM/customer ID;
- interaction history by phone;
- contact summary;
- interaction counts;
- last interaction/outcome/intent/sentiment;
- campaign participation where available;
- transcript/recording links;
- CRM adapter/interface points for future lookup and outcome push;
- use real APIs; if required endpoints are absent, implement against approved backend enhancements rather than local mock storage.

### Deliverable

Operators can navigate from a phone/contact to its relevant Call Centre interaction history and operational context.

---

## Session 5 — Campaign Operations

### Objective

Turn the existing Campaign screens into a real outbound campaign subsystem.

### Scope

- campaign list/detail;
- create/edit workflow;
- target contact import;
- CSV handling;
- AI-agent selection;
- scheduling;
- call windows;
- concurrency/call interval if supported;
- retry/callback logic where approved;
- launch;
- pause/resume/cancel;
- progress;
- per-contact call outcome;
- campaign interaction history;
- remove simulated Salesforce option unless a real Salesforce integration is approved;
- reconcile existing duplicate/inconsistent script sources.

### Deliverable

A campaign can be created, launched, monitored and completed using real backend state.

---

## Session 6 — AI Agents + Quality / Evaluation

### Objective

Make agent operations and interaction quality real.

### Scope

**AI Agents**
- one canonical agent directory;
- real identity/direction/capability data;
- interaction counts/performance;
- escalation/outcome metrics;
- live status only if backend supports a real definition;
- remove fake per-agent random metrics;
- configuration becomes editable only where real backend write APIs exist.

**Quality / Evaluation**
- real interaction queue;
- open real transcript/recording during review;
- automated quality signals from interaction data;
- manual scoring/comments where persistence API is available;
- remove hardcoded QA arrays;
- persist review status/results if included in approved backend scope.

### Deliverable

AI-agent performance and quality evaluation are based entirely on actual interactions.

---

## Session 7 — Analytics, Reports + Digital Channel Alignment

### Objective

Complete management visibility and align the existing WhatsApp channel with the new AI-native architecture.

### Scope

**Analytics**
- real call/interactions metrics;
- time-series aggregations;
- intent/sentiment/outcome distributions;
- campaign and AI-agent performance;
- quality trends;
- no hardcoded chart arrays.

**Reports**
- real report datasets;
- on-demand export;
- remove decorative report counts/actions;
- scheduling/multi-format generation only if approved.

**WhatsApp**
- preserve existing Supabase/Twilio messaging;
- replace remaining Vapi AI-reply dependency with approved text/chat API;
- preserve formatting pipeline where useful;
- optionally normalize voice and WhatsApp at the shared Interaction abstraction without forcing storage migration.

### Deliverable

Analytics/Reports use the same live source data as operations, and WhatsApp no longer depends on Vapi.

---

## Session 8 — Administration, Mock Retirement, Production Readiness

### Objective

Finish the product and remove all remaining prototype behaviour.

### Scope

- proper application authentication;
- User Management;
- roles/permissions;
- persisted Settings;
- final removal of active mock generators/files/imports;
- remove dead/no-op controls or complete them;
- hide/remove NPS and Orchestrator from Phase 1 navigation;
- security/config cleanup appropriate for release;
- production environment handling;
- Vercel/custom-domain deployment configuration;
- SPA routing;
- final lint/type/build checks;
- end-to-end route verification;
- final live-data audit: no mock/random/simulated values in active Phase 1 modules.

### Deliverable

Deployable Phase 1 AI-native Call Centre Control Plane.

---

## 10. Session Dependency Summary

```text
Session 1
Foundation
   ↓
Session 2
Interaction Lifecycle
   ↓
Session 3
Live Ops + Dashboard
   ↓
Session 4
Customers / Contacts
   ↓
Session 5
Campaigns
   ↓
Session 6
Agents + Quality
   ↓
Session 7
Analytics + Reports + WhatsApp alignment
   ↓
Session 8
Auth/Admin/Hardening/Deployment
```

Backend API enhancements can proceed in parallel, but each session should only consume contracts that are confirmed and testable.

---

## 11. Deferred Beyond Phase 1

### NPS

Net Promoter Score / Voice-of-Customer surveys are useful but not foundational to the AI-native Call Centre control plane. Revisit after Phase 1.

### Orchestrator

The current Orchestrator does not need to be part of the Phase 1 product. Revisit only if it is later given a real role controlling/configuring the AI runtime.

### Conventional Workforce Management

Not required for the current AI-agent architecture. AI agents are always available; telephony delivery/routing is managed by the existing telephony/PABX/front-end layer.

### CRM

Never intended to be rebuilt inside this product. Integration with enterprise CRM/business systems is the target.

---

## 12. Executive Phase 1 Scope

**Build:** an AI-native Call Centre Control Plane.

**Primary modules:**

1. Dashboard
2. Interactions / Call Detail / Transcript
3. Live Operations
4. Initiate Call
5. Campaigns
6. Customers / Contacts
7. AI Agents
8. Quality / Evaluation
9. Analytics & Reports
10. WhatsApp / Digital Channel

**Supporting modules:**

- Authentication
- User Management
- Settings
- Formatting Hub

**Deferred:**

- NPS
- Orchestrator
- conventional WFM/routing
- CRM functionality

**Core architectural boundary:** the AI runtime handles the conversation; the telephony layer handles call delivery/routing; the Call Centre control plane manages interaction operations, history, campaigns, customer operational context, supervision, evaluation and insights.
