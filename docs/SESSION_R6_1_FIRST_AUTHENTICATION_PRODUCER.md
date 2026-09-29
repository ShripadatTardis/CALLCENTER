# Session R6.1 — First Real InteractionEvent Producer: Authentication

**Phase A concluded: no genuine event-time authentication producer exists today, in either Voice or Chat.** Per the session's own explicit instruction, this session stops after the audit — Phases B/C/D were not entered, nothing was implemented, no code was changed, `call_center.interaction_events` remains empty of any real (non-test) row. Campaign Session 12.3 Phase E confirmed untouched; no telephone call was triggered.

## Phase A — producer discovery

Audited every current Voice Agent, Chat, and Call Centre integration contract and code path for an actual, discrete, event-time authentication occurrence, before designing anything.

### Voice — no event-time signal exists

- **Trigger Call** (`POST /api/v1/call`): request/response contract carries no authentication field at all (confirmed against `src/types/api/calls.ts`'s `TriggerCallRequestDto`/`TriggerCallResponseDto`).
- **Session Transcript** (`GET /api/v1/sessions/{id}`): `SessionInteractionEntryDto` = `{number, user_message, bot_response, timestamp}` — per-turn, but purely conversational; no authentication-specific field of any kind.
- **Call Data** (`GET /api/v1/call-data`): `CallDataEntryDto.was_authenticated: boolean | null` — a single **call-level summary field**, present once per completed call, not tied to any specific moment or turn within the call. Live-verified in R4.1: `null` for all 686 real records observed. This is exactly the class of field the session's hard boundary names explicitly ("an end-of-call summary field such as `was_authenticated`") — it does not qualify as a producer regardless of its value.

**Conclusion: Voice has no event-time authentication producer.**

### Chat — a plausible candidate found, then empirically ruled out

`prompts/Chat API Spec.txt` documents `POST /api/v1/chat`'s per-turn response including both `authenticated: boolean` and `data_source: "tool"|"rag"|"auth"|"direct"|"guidance"|"llm"|"cancelled"`. The literal `"auth"` enum value on `data_source` is a genuinely promising signal — if a real turn's `data_source` were `"auth"`, that would mark **that specific turn** as the one where an authentication step occurred (an event, not a status), with `authenticated` on that same turn as its factual success/failure outcome. Traced the real code path (`api/chat/index.ts`'s `handleSend`): every turn's `dto.authenticated`/`dto.data_source` is captured and persisted with a real, receipt-time `now = new Date().toISOString()` — if this turned out to be a genuine per-turn event marker, it would have a real interaction ID (`chatSessionId`), a real event-time (not derived from anything), and no transcript parsing required.

**Checked directly against real production data** (`call_center.chat_messages`, all 15 AI-role messages ever recorded, every session):

```
authenticated: false   — for ALL 15 messages, no exception
data_source:            tool (4), llm (8), direct (2), rag (1)  — 'auth' never observed, 0/15
```

**This rules Chat out as a producer, for two independent reasons, not one:**
1. `data_source = 'auth'` — the one value that would make this a genuine discrete event — has **never occurred** in any real chat interaction this product has ever recorded. The theoretical mechanism the spec documents has no observed real-world instance to build against.
2. `authenticated` is `false` on every single real message, with no corresponding `'auth'`-tagged turn ever present. This is structurally indistinguishable from Voice's `was_authenticated`: a field that has only ever been observed in one constant state. Treating any of these 15 `authenticated: false` values as "an authentication attempt occurred and failed" would require inferring that an attempt happened at all — which the session's hard boundary explicitly prohibits by name ("do not infer an auth attempt because an authenticated flag is false"). There is no way, from this data, to distinguish "authentication was attempted and failed" from "authentication was never attempted on this turn."

**Conclusion: Chat has no genuine event-time authentication producer either** — not because the field doesn't exist, but because the one signal that would make it an event (`data_source: 'auth'`) has never fired in real production traffic, and the remaining field (`authenticated`) is exactly the end-of-turn-summary shape the hard boundary excludes.

## Distinguishing what would qualify vs. what exists today

| | Genuine event producer (qualifies) | What actually exists |
|---|---|---|
| Voice | A dedicated authentication-occurrence signal, tied to the specific moment auth happens, independent of the call's final summary | Only `was_authenticated` — a call-level, end-of-call summary field. Does not qualify. |
| Chat | A turn genuinely tagged `data_source: 'auth'` when authentication is the operation that turn performed | `data_source` never takes this value in practice; `authenticated` is a per-turn field but has never varied from `false`, with no way to tell attempt-and-failed from never-attempted. Does not qualify. |

No transcript was parsed to search for authentication mentions (explicitly out of bounds regardless of the above), and no event timestamp was considered from call start/end times.

## Missing producer contract — what would need to exist

For Authentication Success Rate to have a genuine `authentication` `InteractionEvent` producer, the Voice Agent/Chat backend would need to emit **one of**:
1. A distinct authentication-occurrence signal, at the moment it happens — either a dedicated webhook/event callback, or (for Chat) the already-documented `data_source: 'auth'` value **actually populated** on the specific turn where an authentication step runs, with `authenticated` on that same turn as its real outcome (true/false, never inferred).
2. For Voice specifically, since there is currently no per-turn structure at all (only call-level summary and free-text transcript), an equivalent per-event marker would need to be introduced to the Session Transcript or a new dedicated stream — nothing in the current contract offers this.

This is unchanged in spirit from R5's own "R6 handoff" open question, now confirmed empirically rather than left as a documentation gap: the producer contract is defined (Session R5.1 §6), but no real system currently emits data matching it for authentication specifically.

## Scope discipline

Per the explicit hard boundary and the "stop if not found" instruction: no `authentication` event was created from `was_authenticated`, no transcript was parsed, no attempt was inferred from a `false` flag, no timestamp was fabricated from call start/end. `call_center.interaction_events` remains exactly as R5.1 left it — schema live, zero real rows. Tool Success Rate, Fallback Rate, Intent Accuracy, and Avoidable Escalation Rate were not touched (out of scope for this session regardless of the Phase A outcome). Campaign automation, `runBatch`, reconciliation, and Phase E's campaign/target state were not touched.

## Recorded, not fixed

Carrying forward R5.1's finding unchanged: 3 pre-existing tables (`customer_external_identities`, `customer_merge_log`, `customer_activities`) have RLS disabled. Still a separate security-hardening backlog item, still not mixed into this session's scope.

---

## R6.1 PRODUCER DISCOVERY: NOT FOUND
## SOURCE OF FACT: None qualifying — Voice's `was_authenticated` is a call-level summary field (excluded by the hard boundary); Chat's `data_source: 'auth'` (the field that would make this a genuine event) has never been observed in real production data, and `authenticated` is `false` on 100% of the 15 real messages ever recorded with no way to distinguish attempt-and-failed from never-attempted
## EVENT-TIME AUTH FACT AVAILABLE: NO
## IMPLEMENTATION: NOT STARTED
## REAL AUTH EVENTS PERSISTED: 0
## IDEMPOTENCY: NOT TESTED
## AUTH SUCCESS RATIO: NOT INSTRUMENTED
## HISTORICAL BACKFILL: NONE
## CAMPAIGN PHASE E UNTOUCHED: YES
## NEXT ACTION: Request the Voice Agent/Chat backend team confirm whether `data_source: 'auth'` is genuinely ever emitted (and if so, obtain a real example), or whether a dedicated authentication-occurrence signal can be added to either contract. Until then, Authentication Success Rate has no defensible producer and should not be attempted again without new evidence. Tool Success Rate (R5.1 §5's other "Yes, sufficient alone" candidate) was not audited this session and remains the more promising next R6 candidate to investigate, since `tool_call`-shaped signals were not examined here.
