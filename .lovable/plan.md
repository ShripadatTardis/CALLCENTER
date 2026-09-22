# Handover Preparation (No Visual Changes)

Goal: make this project ready to hand to an outside development team, without altering a single screen, layout, colour or interaction. The app as it looks today stays the visual baseline.

## 1. Route and screen audit

All 19 screens are already wired into routing and reachable:

Public: Login / landing (`/`), WhatsApp Authenticate (`/whatsapp-authenticate`).

Signed-in: Dashboard, Initiate Call, Call Logs, Outbound Campaigns, Create New Outbound Calling Campaign, NPS Campaigns, Live View, QA Review, WhatsApp Hub, Formatting Hub, AI Agents, Orchestrator (list, new, flow editor, integrations), Analytics, Reports, User Management, Settings, plus the not-found page.

Two notes to record rather than "fix":
- AI Agents is deliberately hidden from the left menu but still reachable by its address. It stays exactly as is; the README will flag it as intentionally hidden.
- Nothing is orphaned, so no new navigation links get added.

## 2. Centralising sample data

Today's sample data lives in two places: a `data` folder of fixed sample files, and generator utilities that build industry-specific content on the fly. A few screens (Analytics, some chart blocks) hold small data arrays inline in the screen file.

Work to do:
- Add a single access layer (one folder of small "data source" modules) that every screen calls instead of importing sample files directly. Each function returns the same values the screen receives today, so rendering is byte-for-byte identical.
- Move the inline chart arrays out of Analytics into that layer.
- Keep the existing sample files and generators untouched behind the new layer — the layer simply reads from them.
- Result: to switch to real Call Centre services later, the outside team replaces the bodies of these functions only, and no screen file changes.

## 3. Cleanup (conservative)

Confirmed unreferenced and safe to remove:
- Two unused UI kit files (command palette, drawer).
- Two unused sample data files (`industrySpecificData`, `liveViewData`).

Nothing else is removed. The older campaign popup component is still referenced by the Outbound Campaigns screen, so it stays.

## 4. Backend and external services

- No new backend, no new service connections, no API wiring.
- The existing Supabase usage stays because it is already essential: WhatsApp login/OTP, the WhatsApp chat screen and the Formatting Hub depend on it today.
- The Initiate Call screen keeps calling the external voice service exactly as it does now. The README will note that its key currently sits in the code and should be moved server-side by the next team.

## 5. README

A new README replacing the template text, covering:
- every route and the screen it shows, including the intentionally hidden one
- major screens and what each one does
- major reusable components (layout/sidebar, dashboard cards, campaign, NPS, QA, orchestrator canvas and nodes, WhatsApp, shared UI kit)
- where the mock data comes from, per screen
- the shape of data each screen expects, so real services can be slotted in
- the environment values in use today
- how the industry switcher drives content across screens
- a short "next phase" section: replace the data-source layer, move the voice-service key server-side

## 6. Verification

- Build and type-check clean.
- Click through every route and compare against the current appearance to confirm nothing shifted.

## Technical notes

- New `src/services/` (or `src/data-sources/`) modules exporting read functions per domain: calls, campaigns, NPS, QA, reports, analytics, users, orchestrator flows, live view. Synchronous returns to start, typed with the existing types in `src/types/` so a later swap to promise-based fetches is a contained change.
- Screens keep their current props, hooks (`useIndustryData`, `useInitiateCall`) and render trees; only the import source changes.
- Env in use: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.
- Existing edge functions under `supabase/functions/` are left untouched and documented.
