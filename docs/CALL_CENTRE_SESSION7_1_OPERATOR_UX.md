# Session 7.1 — Operator UX: Smart Search, Faceted Filtering, Collapsible Views & Chat Selection

Implemented on top of Session 6.2's Domain → Category → Agent → Channel
classification model (`useClassification()`, `groupInteractions()`,
`GroupedInteractionTree`) and Session 7's real Analytics — no new
classification model was created, per the prompt's core principle.

## 1. Screens changed

- **Call Logs** (`src/pages/CallLogs.tsx`) — client-side FCR/Authenticated/Campaign
  facets, active filter chips, "Clear all".
- **Chat Logs** (`src/pages/ChatLogs.tsx`) — search box (client-side, current
  page), server-side Status facet (`agentId`/`status` params `api/chat/logs.ts`
  already accepted), Authenticated facet, active filter chips.
- **Interaction Quality** (`src/pages/QAReview.tsx`) — already had extensive
  Channel/Agent/Outcome/Escalation/FCR/Sentiment/Intent/Campaign filters and
  grouping from Session 6.1/6.2; this session added active filter chips on
  top of the existing filter set (no new filter dimensions were needed — it
  was already close to the target shape).
- **Customer 360 Interaction Timeline** (`src/pages/CustomerDetail.tsx`) —
  new Domain→Category→Agent→Channel grouping of the customer's own
  interactions (§17), reusing `GroupedInteractionTree`/`groupInteractions`
  unchanged. Fetches a bounded larger page (500) specifically for grouping
  so branch counts can honestly sum to the customer's total in the common
  case; honestly labeled "first N of M" when a customer's history exceeds
  that bound.
- **Chat Console** (`src/pages/ChatConsole.tsx` + new
  `src/components/chat/ChatIdentitySelector.tsx`) — full rebuild of the
  identity-entry workflow (§19), see §10 below. `ChatInteractionHeader.tsx`
  (the old raw-ID-first header) was deleted, fully replaced.
- **Analytics** — **not changed this session.** Session 7's Analytics
  already reuses `useClassification()`/the real classification model for
  its Category/Agent comparison table, and its scoped-vs-all-access branching
  already IS the authorization-first behavior this session asks for
  elsewhere. Adding chips/collapsible sections on top was assessed as
  low-value UX polish with real risk of touching Session 7's metric-formula
  code by accident; deferred (see §15).

## 2. Shared search model

No new search engine or index. Each screen's search is either:
- a real backend query parameter, forwarded as-is (Call Logs' `search` ->
  `/call-data`'s own `search`, which matches `caller_number`/`caller_name`);
  or
- a client-side substring filter over the currently-authorized, currently-
  fetched page (Chat Logs, since `/chat/sessions` has no free-text search
  param at all — confirmed against `Chat_Sessions_API.docx`).

No transcript-text search anywhere (no indexed capability exists).

## 3. Searchable fields by screen

| Screen | Fields |
|---|---|
| Call Logs | caller name, phone number (server, via `search`) |
| Chat Logs | session ID, customer ID/CIF, contact ID, caller name, phone, agent name, latest intent (client, current page) |
| Interaction Quality | intent (client, current page — pre-existing) |
| Chat Console customer picker | customer display label, CIF, masked phone (server-side authorized search, via existing `useCustomers`) |

## 4. Server-side vs page-local search/filter matrix

| Dimension | Call Logs | Chat Logs |
|---|---|---|
| search/query text | server-side global (backend `search` param) | client-side, current page |
| date range | server-side global (`date_from`/`date_to`) | not supported by backend — not added |
| outcome / direction | server-side global | n/a |
| agent/category | client-side grouping selection (narrows an already-authorized page) | server-side (`agentId` param), authorized |
| status | n/a | server-side (`status` param) |
| FCR / authenticated / campaign / sentiment / intent | client-side, current page (no backend param exists) | client-side (authenticated), current page |

Every client-side-only control is labeled "(current page)" or "(page)" in
its own UI, per §13 — no control implies complete-history coverage it
doesn't have.

## 5. Autocomplete sources

Only the Chat Console customer picker has true autocomplete (debounced,
400ms), and it calls the same authorized `useCustomers()` search every
other Customer 360 screen uses — results are therefore already
authorization-filtered server-side; no hidden customer can ever appear.
Category/Agent pickers are closed enumerations from `useClassification()`,
not autocomplete, since the authorized set is always small.

## 6. Authorization behavior

No new authorization logic was added anywhere in this session — every
addition reads through the SAME already-authorized data Session 6.2 already
enforces server-side (`api/calls/data.ts`, `api/chat/logs.ts`) or the same
authorized Customer 360 search (`useCustomers`, `useCustomerDetail`). Search
and filters only ever narrow an already-authorized result set further; they
cannot widen it. Hidden-session direct access still 404s (unchanged, since
`api/chat/logs.ts` wasn't touched this session). The current localStorage
role model remains an application-level, not cryptographic, boundary — this
session doesn't change or misrepresent that.

## 7. Date/time semantics

Unchanged from Session 7's empirical finding: `window=24h` in
`/analytics/metrics` is a **rolling** 24-hour window, not calendar-day-
aligned. Call Logs' date range remains calendar `date_from`/`date_to` (the
only form `/call-data` accepts) — never blended with the Analytics rolling
window.

## 8. Grouped/collapsible UX

`GroupedInteractionTree` (Session 6.2) already implements collapsible
Category/Agent/Channel levels with semantic `<button>` elements (keyboard-
operable, visible focus via default browser/Tailwind focus styles) — reused
unchanged everywhere in this session, including the new Customer 360
timeline grouping. No new collapsible-panel component was needed for the
Advanced Filters areas, since Call Logs' `AdvancedFilters` already had an
expand/collapse toggle from an earlier session.

## 9. Customer 360 timeline changes

See §1 — `CustomerDetail.tsx` now groups the customer's own interactions by
Category/Agent/Channel via the same `groupInteractions()`/
`GroupedInteractionTree` used on Call Logs/Chat Logs/Interaction Quality.
Selecting a channel leaf narrows the flat list below it; the summary cards
above and the existing Voice/Chat drill-down (`InteractionLookupDialog`,
unmodified) are untouched.

## 10. Chat Console selector flow

`ChatIdentitySelector.tsx` implements Domain → Category → Agent → Customer →
Contact exactly per §19:
- Category dropdown: authorized categories only, from `useClassification()`.
- Agent dropdown: only agents mapped to the selected category (still the
  real `/agents` identity via `classification.agentsById`).
- Customer: a debounced search popover over `useCustomers()` (server-side
  authorized), displaying `getCustomerDisplayLabel()`'s
  `display_name → CIF → masked phone → "Customer"` hierarchy — never a raw
  UUID.
- Contact: once a customer is selected, `useCustomerDetail()` supplies its
  known phone numbers (masked in the picker via `maskPhoneLast4`); the
  first one defaults as primary. The full canonical value is retained
  internally and only that raw value is ever sent to the backend.
- First-turn payload: `agentId` (real), `customerId` (the customer's
  `sourceCustomerRef`/CIF **only** — never the Customer 360 row UUID; omitted
  entirely if the customer has no CIF), `contactId` (always omitted — no
  genuine backend contact-id concept exists anywhere in this app's current
  Customer 360 model), `phoneNumber` (the selected canonical phone).
- Session lock: reuses the existing `hasActiveSession`/`isBound` state from
  `useChatSession` — once a session exists, the selector renders a locked
  summary row showing the backend-returned `agentName`/`customer_id`/
  `contact_id` instead of the pickers.
- "New Chat" resets via a `resetKey` prop bump, clearing all local selector
  state.
- "Advanced / Manual IDs" toggle preserved for support/testing — free-text
  Agent/Customer ID/Contact ID/Caller Name/Phone inputs, explicitly labeled,
  not the default view.

## 11. Export behavior

Unchanged from Session 7/earlier: Call Logs' CSV export already reflects
exactly the currently-filtered, already-authorized `interactions` array
rendered on screen (now including the new client-side facets, since export
reads the same filtered variable) — a scoped role cannot export hidden rows
because the export never has access to anything beyond what the page itself
received. No new export was added to Chat Logs/Interaction Quality this
session (not requested for those screens by the prompt's §14/§15/§16).

## 12. URL-state behavior

**Deferred.** Persisting `q`/`category`/`agent`/`channel`/`from`/`to`/
`outcome` in the URL was not implemented this session. Each of the three
list screens (Call Logs, Chat Logs, Interaction Quality) already manages a
non-trivial amount of local state (view mode, grouped-selection, multiple
filter dimensions); wiring all of that through `useSearchParams` correctly
— without introducing state-sync bugs between the URL and the grouped-tree
selection — is a real, separable piece of work. Per §21's own allowance
("if URL persistence complicates existing routes materially, document and
defer rather than forcing it"), this is deferred rather than rushed.

## 13. Performance strategy

- Chat Console's customer search is debounced (400ms), matching the
  existing pattern already used on the Customers list page.
- Customer 360 timeline grouping uses one bounded page (500 rows) rather
  than an unbounded fetch-all loop; honestly labeled when a customer's
  history exceeds that bound.
- No new backend calls were introduced on every keystroke anywhere —
  client-side facets filter already-fetched data in memory.

## 13.1. Fixed after this session: CIF search gap

Live verification after this session's initial ship found that searching
"CIF003" in the Customer 360 list and the Chat Console customer picker
returned zero results, even though the customer existed and was
authorized. Two independent causes, both fixed:

1. `call_center_list_customers`'s search predicate only matched
   `display_name` — never `source_customer_ref` (CIF) or phone. Extended
   (migration `20261001000000_customer360_list_customers_search_cif_phone`)
   to also match `source_customer_ref` (`ilike`) and phone contact points
   (digits-only substring match against `customer_contact_points.normalized_value`).
   Authorization/visibility filtering (`p_all`/`p_agent_ids` → `v_visible`)
   was untouched — only the search predicate was widened, in both the count
   and rows branches identically. `source_customer_ref` remains a
   display/search field only, never an identity join key.
2. `api/customers/index.ts` dispatches any search string through
   `normalizePhoneNumber` first; since that strips all non-digit
   characters, "CIF003" silently became `"003"` and the request was
   misrouted into the phone-materialization branch (which resolves to at
   most one customer via a contact-point lookup) — it never reached
   `listCustomers` at all, regardless of the RPC fix above. Fixed by only
   attempting phone-search dispatch when the raw query is phone-shaped
   (`/^[0-9+\-\s()]+$/` — digits and phone punctuation only, no letters);
   a CIF/name query now falls through to `listCustomers` correctly.

Verified live in production: "CIF003" now resolves via both the Customer
360 list search and the Chat Console picker; a role not mapped to CIF003's
category gets zero results (no authorization leak); phone search is
unaffected (a full phone number for the same customer still resolves via
the materialization branch as before). No duplicate customer rows —
this is a read-only search-path fix. Function count unchanged at 11 (no
new route file). Commit: see below.

## 14. Backend limitations (unchanged, reconfirmed during this session)

- `/call-data` has no agent/category/FCR/escalation/sentiment/authenticated/
  campaign query params — only `status`/`direction`/`outcome`/`date_from`/
  `date_to`/`search`/`min_duration`/`max_duration`.
- `/chat/sessions` has no free-text search param, no date-window param —
  only `customer_id`/`contact_id`/`agent_id`/`status`/`page`/`page_size`.
- No genuine backend "contact_id" concept has ever been observed for a
  Customer 360 contact point — the Chat Console selector's Contact field
  is therefore phone-number selection only, never a real contact_id.

## 15. Deferred items

- URL-state persistence (§12, above).
- Analytics-tab UX additions (chips/collapsible sections) — Session 7's
  Analytics already satisfies the authorization-first principle this
  session cares about most; further chrome was judged not worth the risk
  of touching Session 7's formula code in the same pass.
- A dedicated collapsible "Advanced Filters" drawer component shared across
  screens — each screen kept its own pre-existing filter-panel shape rather
  than being forced into one new shared component, since Call Logs already
  had an expand/collapse pattern and Interaction Quality's filter set didn't
  need one.
