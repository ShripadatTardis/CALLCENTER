# Session R6.2 — Interaction Trace Telemetry Contract & Conversation Quality Architecture

**Evidence, architecture, and contract-definition session. No production code was implemented.** No parser tied to the current human-readable `.log` format was built. No telemetry not demonstrated by the two supplied traces was invented. No historical event was backfilled. Implemented (i.e., written) directly, no subagents.

**Compatibility confirmed (§F)**: nothing in this session touched the 5 existing Direct ratios, R4.1/R4.2/R4.3 behavior, R5/R5.1 `interaction_events` persistence, Campaign automation, or Campaign Session 12.3 Phase E. This was a pure-documentation session — zero source files were read-write touched, zero database writes occurred. The Supabase RLS backlog item (R5.1) is untouched and not addressed here.

**Primary evidence**: the two real trace files supplied by the project owner, read in full and cited by exact `INTERACTION N` number throughout this document:
- `docs/1f599d20-c84a-4167-9c74-fb48780c78ef.log` — outbound EMI Reminder call, 5 interactions ("the EMI trace").
- `docs/3eb378e9-6daf-4429-ae9a-88f257871efd.log` — inbound customer-service chat, 26 interactions ("the Chat trace").

---

## A. Trace audit — capability matrix

Every element below is classified **Existing** (structurally present and reliable, cited), **Ambiguous** (present but its full shape/semantics can't be confirmed from these two traces alone), **Missing** (never demonstrated in either trace), or **Not Required** (not needed for the R6.2 objective). Per the explicit instruction, no event is inferred from bot natural-language text — where a fact is only ever expressed in the `BOT:` line and not backed by a structured field, it is marked **Missing**, not credited as evidence, even when a human reader could infer it.

### A.1 Turn/interaction structure

| Element | Status | Evidence |
|---|---|---|
| Session/call identity | **Existing** | File header `Session: <id>` — matches the Call Data `call_id` used throughout this product (confirmed identical UUID shape to `1f599d20-c84a-4167-9c74-fb48780c78ef`, the same interaction already proven in Session 12.2B/12.3 to satisfy `call_sid == call_data.call_id`). |
| Turn/interaction boundary | **Existing** | `INTERACTION N` header, 1-based, monotonically increasing, one per turn. Reliable turn separator. |
| Stable, idempotency-safe turn ID | **Missing** | `INTERACTION N`'s `N` is a within-session ordinal, not a globally unique, producer-generated ID. Two different sessions both have an "INTERACTION 1" — cannot serve as an `event_id`. |
| Per-turn wall-clock timestamp | **Missing** | **Zero timestamps anywhere in either trace**, at any level (turn, tool call, RAG call). This is the single largest gap for building `InteractionEvent`s from this evidence — `event_time` cannot be sourced from the trace format as it exists today. |
| Customer utterance | **Existing** | `USER:` block, raw text, every turn. |
| Bot utterance | **Existing** | `BOT:` block, raw text, every turn. |

### A.2 Prompt/source type

| Element | Status | Evidence |
|---|---|---|
| Prompt type classification | **Existing** | `PROMPT: System \| Tool \| Tool (tool_name) \| RAG`, every turn, both traces. Four observed values: `System`, `Tool`, `Tool (<name>)`, `RAG`. |
| Tool identity, when invoked | **Existing** | `PROMPT: Tool (get_account_details)`, `Tool (get_transaction_history)`, `Tool (resend_payment_link)` — Chat trace Interactions 2–4, 7, 10, 16; EMI trace Interaction 4. |
| Whether a bare `PROMPT: Tool` (no name) reflects a fresh tool invocation or reused cached facts | **Ambiguous** | EMI trace Interactions 2, 3, 5: `PROMPT: Tool` with **no parenthetical tool name**, carrying only a static `## SESSION FACTS` block, byte-identical across all three turns — no `## LOOKUP RESULT` section as Interaction 4 has. This looks like cached session-level facts being re-injected into the prompt, not a new tool call each turn, but the trace format gives no explicit "was a tool actually invoked this turn: yes/no" flag to confirm either reading. **Requires VoiceForce confirmation.** |

### A.3 Tool invocation

| Element | Status | Evidence |
|---|---|---|
| Tool result payload (structured JSON) | **Existing** | Chat trace Interactions 2, 3, 4, 5, 7, 10, 16 all carry real structured JSON (`account_type`, `balance`, `transactions[]`, `total_matched`, `showing`, `applied_filters[]`, full account-detail object with `routing_number`/`joint_owners`/etc.). |
| Tool call parameters (what was actually sent to the tool) | **Existing** | `FRAME CONTEXT`'s `final_plan: tool_exec tool=<name> params={...}` — present on every Tool-sourced turn in the Chat trace (Interactions 2, 3, 4, 5, 7, 10, 16). Not present in the EMI trace at all (EMI trace never emits `FRAME CONTEXT` — see A.6). |
| Stable tool-call/request ID | **Ambiguous / mostly Missing** | Exactly **one** example exists: EMI trace Interaction 4's `## LOOKUP RESULT (resend_payment_link)` carries `request_ref: PL-86559` — a real, structured, stable-looking reference. No other tool result in either trace (Chat trace's `get_account_details`/`get_transaction_history` results) carries any ID field at all. Cannot confirm this is a universal convention from one example. |
| Explicit success/failure status | **Missing** | No tool result in either trace carries an explicit boolean/enum success field. Success is only inferable from a result payload being present at all — every tool call in both traces happens to succeed; **failure is entirely undemonstrated**, so its shape (error code, error message, partial result) cannot be confirmed from evidence. |
| Latency | **Missing** | No latency figure for any tool call, in either trace. |
| Tool-call timestamp | **Missing** | Same as A.1 — no timestamp at any granularity. |

### A.4 RAG invocation

| Element | Status | Evidence |
|---|---|---|
| RAG invocation marker | **Existing** | `PROMPT: RAG` + `final_plan: rag_query`. Chat trace Interactions 6, 8, 9, 11, 12, 14, 19, 20. |
| Retrieved reference content | **Existing, but inconsistent** | Interactions 9, 12, 14, 19, 20 carry `[Reference N] (<source_tag>): <text>` blocks (1–3 references each). Interactions 6, 8, 11 are `PROMPT: RAG` with **`(no additional context)`** — i.e. RAG was invoked per `final_plan` but zero references were surfaced in the prompt for that turn. |
| Whether "no additional context" means retrieval genuinely returned nothing, vs. references existing but not being logged for that turn | **Ambiguous** | Cannot be distinguished from the trace alone. **Requires VoiceForce confirmation** — this materially affects whether a `knowledge_retrieval` event's `success` should be `false`/`true`/`null` for those three turns. |
| Reference source category tag | **Existing** | `fees_charges_rates`, `compliance_rules`, `products_services`, `faqs`, `troubleshooting`, `policies_procedures` — six distinct real category tags observed. |
| Reference/chunk/document ID | **Missing** | No ID field anywhere on any reference — only the category tag and free text. Cannot uniquely cite which document/chunk was retrieved. |
| Retrieval confidence/relevance score | **Missing** | Never present. |

### A.5 Intent, routing, and continuity (the richest evidence category)

| Element | Status | Evidence |
|---|---|---|
| Active frame list | **Existing** | `active_frames (N):` with per-frame `<name>:<origin_turn>:<hash> intent=<intent> tool=<tool_or_None> selected=<params_or_none> returned=<count> turns=<start>→<last>`. Present on every Chat-trace turn that isn't `PROMPT: System` with no additional context (see A.6). |
| Frame identifier | **Existing** | E.g. `balance_check:0:b8ada5`, `transaction_history:2:fb8660`, `rag:faq_forex` — a real, structured, session-scoped conversational-thread identifier. Reused correctly across turns (Interactions 3→5→7→16 all reference the same `transaction_history:2:fb8660` frame at different points). |
| Router decision type | **Existing** | `new` or `continue → <frame_id>` — every emitted `FRAME CONTEXT`. |
| Router decision source | **Existing** | Four distinct real values observed: `gate` (Interaction 2), `llm` (Interactions 3, 5, 7, 8, 13, 16, 23), `classifier_meta` (Interactions 4, 6, 10, 14, 15, 18, 20), `coref` (Interaction 9). |
| Router decision confidence | **Existing** | Real floats, e.g. `conf=1.00`, `conf=0.90`, `conf=0.75`, `conf=0.95`, `conf=0.80`, `conf=0.98`. |
| Router decision reason (free text) | **Existing** | E.g. `"specific entity requested"`, `"classifier intent mini_statement (0.89) does not align with any active frame"`. Human-readable, machine-emitted (not a bot utterance) — a genuine structured fact about *why* the router chose as it did, distinct from an inferred narrative. |
| Slot-fill state | **Ambiguous** | `slot_fill: status: no_pending` on every single emitted `FRAME CONTEXT` in both traces — **never once shows a `pending` state**. The field exists and has a defined shape for the one value observed, but a slot-filling-in-progress case is entirely undemonstrated. |
| Cross-tool reroute | **Missing (shape undemonstrated)** | `cross_tool_reroute: - (none)` on every turn, both traces. The field exists structurally but its populated shape has never been observed. |
| Soft continuation | **Missing (shape undemonstrated)** | Same as cross-tool reroute — always `(none)`. |
| Coreference resolution marker | **Existing (one example)** | Interaction 9: `router_decision: continue → rag:faq_forex source=coref conf=0.95 reason="coref → most-recent frame"` — the one real, structured coreference-driven continuation in either trace. |
| Final plan / action taken | **Existing** | One of `tool_exec tool=<name> params={...}`, `rag_query`, `guidance`, `direct_response` — present on every emitted `FRAME CONTEXT`. This is the single most valuable field for reconstructing "what the system actually decided to do this turn," structurally distinct from the bot's prose. |

### A.6 Turns with no `FRAME CONTEXT` at all

Both traces show `FRAME CONTEXT: (not emitted for this turn)` for every `PROMPT: System` turn — the **entire EMI trace** (all 5 interactions are `PROMPT: System` or `PROMPT: Tool`, and none ever emits a populated `FRAME CONTEXT`) and several Chat-trace turns (Interactions 1, 13\*, 17, 21, 22, 23\*, 24, 25, 26 — \*note Interactions 13 and 23 actually DO show a populated FRAME CONTEXT despite being `PROMPT: System`, so this is not a strict rule, see below). **This is itself an important structural finding**: router/frame evidence is only available for a subset of turns, not universally — any Conversation Quality metric that depends on `FRAME CONTEXT` (Context Continuity, Intent Routing Accuracy) is **only evaluable for turns where it was emitted**, and turns without it (including the entire EMI trace) cannot be deterministically scored on those dimensions from this evidence.

Correction on re-inspection: Interactions 13 and 23 are `PROMPT: System` **and do** carry a populated `FRAME CONTEXT` (their `router_decision` shows `continue → rag:fund_transfer`/`continue → rag:faq_interest_rates`). So the rule is not "System turns never emit FRAME CONTEXT" — it's turn-specific and its exact governing condition **cannot be determined from these two traces alone; requires VoiceForce confirmation.**

### A.7 Authentication

| Element | Status | Evidence |
|---|---|---|
| Natural-language authentication mention | **Existing, but explicitly NOT usable as a fact** | Chat trace Interaction 1: `USER: Four, five, six, seven` / `BOT: Thank you, your identity has been verified. How can I help you today?` — `PROMPT: System`, `(no additional context)`, `FRAME CONTEXT: (not emitted for this turn)`. **Zero structured evidence accompanies this** — no auth method, no success field, no confidence, no timestamp, no frame. Per this session's explicit hard boundary ("do not infer events from natural-language bot responses"), this is catalogued as evidence that Voice Agent authentication *happens somewhere in the underlying system*, but it is **not** a usable `authentication` `InteractionEvent` source — this directly reaffirms Session R6.1's live-data finding (Chat's `authenticated`/`data_source='auth'` fields never fire in real data) from the trace-evidence side, independently. |
| Structured authentication event (method, attempt vs. result, confidence, timestamp) | **Missing** | Not present anywhere in either trace. |

### A.8 Escalation / human transfer

| Element | Status | Evidence |
|---|---|---|
| Escalation/transfer marker of any kind | **Missing** | Neither trace contains a turn where `final_plan` is anything resembling an escalation/transfer, nor any frame with an escalation-shaped intent, nor any explicit escalation field. **Entirely undemonstrated** — cannot confirm the shape this would take if it occurred. |

### A.9 Guardrail intervention

| Element | Status | Evidence |
|---|---|---|
| Guardrail intervention marker | **Missing** | Not present in either trace. |

### A.10 Customer feedback

| Element | Status | Evidence |
|---|---|---|
| Feedback solicitation | **Existing (as bot text only)** | Chat trace Interaction 22: `BOT: Before we end, would you like a summary of our conversation?`; Interaction 25's closing line: `On a scale of 1 to 5, how would you rate your experience today?` |
| Feedback value, structured | **Missing** | Interaction 26: `USER: Is three point five` → `BOT: Thank you for rating us 3 out of five.` — the bot's own restated value (**3**, rounded/truncated) **does not match** what the user actually said (**3.5**). No structured `csat_score`/`nps_score` field is emitted anywhere (`PROMPT: System`, no FRAME CONTEXT) — the true feedback value can only be read from natural-language text, and that text is internally inconsistent (user said 3.5, bot echoed 3). This is a genuine, real audit finding: **any CSAT-like ratio built from this trace format today would have no structured source, and the one real example shows the bot's own restatement is unreliable evidence even for a human reader** — reinforces why this must go through explicit backend instrumentation (§B), not text-scraping. |

### A.11 Summary of the biggest structural gaps

1. **No timestamps anywhere, at any level.** This alone blocks `event_time` for any `InteractionEvent` derived from trace evidence, and blocks any latency-based ratio.
2. **No stable, producer-issued IDs** for turns, tool calls, or RAG calls (frame IDs are session-scoped conversational threads, not per-call IDs; the one `request_ref` example is not confirmed universal).
3. **`FRAME CONTEXT` (the richest evidence source) is not emitted on every turn**, and the exact rule governing when it is/isn't emitted is not determinable from two examples.
4. **No explicit success/failure field** on any tool or RAG call — every example in both traces happens to succeed, so failure semantics are undemonstrated.
5. **Authentication and customer feedback are only ever expressed in bot prose**, never as structured facts — both explicitly excluded from event-sourcing by this session's hard boundary, consistent with R6.1's finding.
6. **Escalation, guardrail intervention, cross-tool reroute, and soft-continuation are all structurally defined but never populated** in either trace — their real shape is unconfirmed.

---

## B. Canonical Trace Telemetry Contract

### B.1 Two distinct layers — kept separate, not merged

```
VoiceForce runtime  →  Interaction Trace (the FACTUAL SOURCE — everything in §A)
                              │
                              │  Conversation Quality Analyzer (§D) reads the trace,
                              │  applies deterministic rules + versioned LLM judgment
                              ▼
                    Quality Observations (§D.3)  +  normalized InteractionEvents (R5)
                              │
                              ▼
                    Ratio Explorer — Conversation Quality family (§C)
```

- **The Interaction Trace** is the raw, complete, turn-by-turn record of what actually happened — router decisions, tool calls, RAG retrievals, frame state — exactly the shape catalogued in §A. It is the **evidence layer**, never itself a ratio input directly.
- **`InteractionEvent`** (R5, `src/types/interactionEvent.ts` — unchanged by this session) remains the **normalized, cross-domain telemetry fact** layer: one canonical event per real occurrence (a tool call, an authentication check, an escalation), domain-neutral, used by any future `AggregationProvider`. A trace turn does **not** automatically become an `InteractionEvent` — it becomes one only when the trace explicitly demonstrates a fact matching R5's existing taxonomy (`tool_call`, `knowledge_retrieval`, `authentication`, `escalation`, etc.), with a real `event_id`/`interactionId`/`event_time`. Per §A, most turns in these two traces **cannot** be losslessly converted to `InteractionEvent`s today, specifically because `event_time` is never present.
- **Quality Observations** (new, §D.3) are a **separate, additional** record type — not an `InteractionEvent` variant — because a quality judgment (e.g., "was this continuation correct?") is an *evaluation of* trace evidence, not itself a fact the Voice Agent runtime emitted. Conflating the two would violate R5's own locked principle ("FACTS = what happened, RATIOS = what it means") by smuggling a judgment into the facts table.

### B.2 Minimum additional VoiceForce instrumentation required

Ranked by how many downstream capabilities each unblocks, all **evidence-gap items from §A**, none speculative:

| # | Gap | Needed for | Priority |
|---|---|---|---|
| 1 | **`event_time` on every turn, tool call, and RAG call** (ISO 8601, occurrence time) | Everything — `InteractionEvent.eventTime`, any latency ratio, any trend/time-bucketed Conversation Quality view | **Critical** |
| 2 | **Stable, producer-issued ID per turn AND per tool/RAG invocation** (not the session-scoped frame ID, not the within-session ordinal) | Idempotent event ingestion (R5's `event_id` contract), precise evidence citation in quality observations | **Critical** |
| 3 | **Explicit `success: boolean` (or `null` where inapplicable) on every tool/RAG invocation**, with an error code/message when `false` | Tool Success Rate (R5 §16, still `backend_gap`), Response Grounding Rate, any failure-taxonomy quality metric | **Critical** |
| 4 | **Consistent `FRAME CONTEXT` emission on every turn** (or an explicit documented rule for when it's omitted) | Context Continuity Rate, Intent Routing Accuracy, Follow-up Understanding Rate — all of §C's first-six ratios | **Critical** |
| 5 | **Populated examples (or explicit "never applicable") for `cross_tool_reroute` and `soft_continuation`** | Confirms whether these are real event sources or vestigial fields | High |
| 6 | **A structured `authentication` event** (method, attempt, result, confidence, timestamp) distinct from the spoken confirmation | Authentication Success Rate (R6.1 — still blocked on exactly this) | High (carried over from R6.1, not new to R6.2) |
| 7 | **A structured `escalation`/`human_transfer` event** | Autonomous Resolution Rate, any escalation-avoidability work | High |
| 8 | **A structured customer-feedback event** (numeric score as submitted, not re-stated) | Any future CSAT/NPS ratio; also would have caught the 3.5-vs-3 discrepancy in §A.10 | Medium |
| 9 | **Latency per tool/RAG call** | Any performance-adjacent quality ratio (not in the first six, but useful) | Medium |
| 10 | **Reference/chunk ID + retrieval score on RAG results** | Response Grounding Rate's evidence precision | Medium |

Nothing above is invented — each row traces directly to a specific §A gap. **All ten require VoiceForce/backend confirmation and implementation; none can be simulated or inferred from the current trace format.**

---

## C. Conversation Quality — new Ratio Explorer family

New `RatioFamily` value: **`conversation_quality`** (alongside the existing `operations`/`intelligence`/`quality`/`business` — a naming note: the existing `quality` family is "Quality & Experience" i.e. QA/CSAT/NPS; `conversation_quality` is deliberately a distinct, new family for AI-conversation-mechanics correctness, not a subset of the existing one, to avoid conflating "did the agent behave well as software" with "was the customer satisfied").

All 10 ratios are defined below. **Trust boundary, stated once and applied throughout**: classifier/router `conf=` values (§A.5) are the *system's own confidence in its routing decision* — never treated as a correctness label. A `conf=0.90` "continue" decision can still be objectively wrong (§ Golden Fixture 2 below is exactly this: `conf=0.90` and wrong). Correctness is determined either deterministically from trace facts (e.g., did the selected frame's `intent` match the user's actual topic) or by the versioned LLM evaluator (§D) — never by re-reading the router's own confidence number as if it were a grade.

### C.1 The first six — implementation target

#### 1. Context Continuity Rate

- **Purpose**: when the router chooses to `continue` an existing frame rather than start a `new` one, was that the objectively correct choice?
- **Eligible population/denominator**: every turn with an emitted `FRAME CONTEXT` whose `router_decision` is `continue → <frame_id>`.
- **Numerator**: continuations judged correct (see evaluator below).
- **Exclusions**: turns with `router_decision: new` (not a continuity decision at all — wrong family of decision, not a continuity failure); turns with no emitted `FRAME CONTEXT` (§A.6 — undemonstrated, never silently counted either way).
- **Deterministic trace evidence**: the chosen frame's `intent`, `selected` params, and the turn's actual user utterance are all present in the trace and sufficient for a human/LLM evaluator to judge topical match — but whether the match is *correct* is a semantic judgment, not a deterministic rule, because "continue vs. new" correctness depends on understanding the user's utterance, not just comparing string labels.
- **Semantic LLM judgment required**: **Yes.** Determining whether "On 15th of March" (Golden Fixture 2, Interaction 7) should have continued the `rag:faq_forex` frame (correct, per the user's actual topic) rather than `transaction_history` (what the router picked) requires understanding that "on 15th of March" was answering the *remittance* question, not opening a new transaction-history lookup — a natural-language judgment, not a string match.
- **Evaluator output**: `pass | fail`, `failure_category: wrong_frame_selected | correct`.
- **Failure taxonomy**: `wrong_frame_selected` (router continued into a plausible-but-incorrect existing frame — Golden Fixtures 2 and 3 below are both this).
- **Drill-down evidence**: the full `FRAME CONTEXT` block (all active frames, the decision, source, confidence, reason) plus the immediately preceding 1–2 turns for context — reusing the existing trace, not fabricated.

#### 2. Follow-up Understanding Rate

- **Purpose**: when the bot asks a question or makes an offer, and the customer gives a short affirmative/negative/clarifying reply, does the system correctly understand and act on it?
- **Eligible population/denominator**: turns where the *preceding* bot turn ended in a question or offer, and the current turn's user utterance is a short affirmative/negative/clarifying response (e.g. "Yes", "Yes, please", "No, thank you", "Is three point five").
- **Numerator**: follow-ups where the bot's response correctly acts on the affirmative/negative in context.
- **Exclusions**: turns where the user's reply introduces a genuinely new topic rather than answering the preceding question (not a follow-up-understanding case at all).
- **Deterministic trace evidence**: the preceding `BOT:` text (was it a question/offer) and the current `USER:` text (is it short/affirmative-shaped) are both directly readable from the trace, giving a deterministic *candidate set* for this ratio's denominator. Whether the bot's *response* to that follow-up was correct is semantic.
- **Semantic LLM judgment required**: **Yes**, for the pass/fail determination; **No** (deterministic) for identifying candidate turns.
- **Evaluator output**: `pass | fail`, `failure_category: could_not_ground_affirmative | wrong_action_taken | correct`.
- **Failure taxonomy**: `could_not_ground_affirmative` — Golden Fixtures 4 and 5 below (`BOT: Sorry, I'm not sure what you'd like me to confirm.` in response to a plain "Yes, please"/"Yes, definitely").
- **Drill-down evidence**: the preceding bot turn, the user's follow-up, and the bot's actual response — three consecutive `USER:`/`BOT:` pairs from the trace, unmodified.

#### 3. Intent Routing Accuracy

- **Purpose**: independent of continuity, was the intent the router assigned (`new_intent=...` or the continued frame's `intent`) the objectively correct read of the user's utterance?
- **Eligible population/denominator**: every turn with an emitted `FRAME CONTEXT`.
- **Numerator**: turns where the assigned/continued intent matches the utterance's actual topic.
- **Exclusions**: none beyond "no `FRAME CONTEXT` emitted."
- **Deterministic trace evidence**: `router_decision`'s intent/frame assignment and `reason` string are directly readable; the user utterance is directly readable.
- **Semantic LLM judgment required**: **Yes** — matching an intent label to an utterance's true meaning is inherently semantic (this is the general case Context Continuity Rate is a specific slice of — continuity concerns *which existing frame*, routing accuracy concerns *whether the intent itself is right*, including for `new` decisions).
- **Evaluator output**: `pass | fail`, `failure_category: intent_misclassified | correct`.
- **Failure taxonomy**: `intent_misclassified`.
- **Drill-down evidence**: `router_decision` block + user utterance.

#### 4. Conversation Recovery Rate

- **Purpose**: after a turn is judged a failure by Follow-up Understanding, Context Continuity, or Intent Routing, does the system recover within the next 1–2 turns (correctly ground the user's restated or clarified intent), rather than repeating the same failure?
- **Eligible population/denominator**: every turn already judged a failure by one of ratios #1–#3.
- **Numerator**: failures followed within 1–2 turns by a correctly-grounded response to the same underlying request.
- **Exclusions**: failures at the very end of a trace with no subsequent turn to evaluate recovery against (right-censored — excluded, not counted as failed-to-recover).
- **Deterministic trace evidence**: turn sequence/adjacency is directly readable; whether the *following* turn(s) demonstrate recovery is semantic.
- **Semantic LLM judgment required**: **Yes.**
- **Evaluator output**: `recovered | not_recovered`, tied back to the originating failure's evidence ID.
- **Failure taxonomy**: `not_recovered` (the same misunderstanding repeats or compounds) — Golden Fixture 6 below (Interaction 22→23→24→25: the bot asks for a summary, fails to understand "Yes, definitely," the user has to fully restate "The summary of our conversation," and the bot *still* just repeats its own question rather than acting — genuine non-recovery across 3 turns before the user's 4th attempt finally lands).
- **Drill-down evidence**: the originating failure's evidence plus every subsequent turn up to (and including) the recovery attempt or trace end.

#### 5. Unnecessary Clarification Rate

- **Purpose**: how often does the bot ask a clarifying question when the trace evidence shows the information needed to proceed directly was already available (in `active_frames`, prior tool results, or the utterance itself)?
- **Eligible population/denominator**: turns whose `final_plan` is `direct_response` or a `guidance` turn that primarily asks a clarifying question, where `active_frames`/prior turns already contain the needed information.
- **Numerator**: clarifications judged unnecessary against that standard.
- **Exclusions**: the first clarifying question in a genuinely ambiguous request (no prior evidence exists) is not unnecessary by definition.
- **Deterministic trace evidence**: `active_frames`' `selected` params and prior tool-result payloads are directly readable and can be deterministically checked for whether they already contain the answer to what's being asked — this makes the *candidate detection* substantially deterministic, unlike ratios #1–#4.
- **Semantic LLM judgment required**: **Partial** — deterministic pre-filtering (does prior evidence exist covering the same slot?) narrows the candidate set; a final semantic check confirms the clarifying question genuinely duplicates that evidence rather than asking something subtly different.
- **Evaluator output**: `unnecessary | necessary`.
- **Failure taxonomy**: `duplicate_clarification`.
- **Drill-down evidence**: the clarifying turn plus the specific prior turn/tool-result that already contained the answer.

#### 6. Task Progression Rate

- **Purpose**: once a task-oriented tool action succeeds (e.g., a payment link is resent, a lookup completes), does the conversation move forward (confirm, close, or advance) rather than re-asking a question that action already answered or made moot?
- **Eligible population/denominator**: every turn immediately following a successful `tool_exec` in a task-oriented (non-informational-lookup) flow.
- **Numerator**: turns that correctly progress (acknowledge completion, move to next step, or close) rather than repeat.
- **Exclusions**: informational lookups where re-confirming is a legitimate next step (e.g., asking "anything else about your account?" after a balance check is progression, not repetition — the Chat trace's own `get_account_details`/`get_transaction_history` closing lines are examples of *correct* progression, useful as negative fixtures for this ratio).
- **Deterministic trace evidence**: the sequence of `final_plan: tool_exec` → next turn's `BOT:` text is directly readable; whether the next turn duplicates a prior question is partly a string-similarity check (deterministic-assistable) and partly semantic (is it *functionally* the same ask, even if worded differently).
- **Semantic LLM judgment required**: **Yes**, for the final determination; deterministic turn-adjacency and tool-success detection narrow the candidate set.
- **Evaluator output**: `progressed | repeated`.
- **Failure taxonomy**: `repeated_post_success_question`.
- **Drill-down evidence**: the tool-exec turn (with its result) plus the following turn(s) — Golden Fixture 6 (EMI trace) is the canonical example: Interaction 4's `resend_payment_link` succeeds (`action: payment_link_resent`), the user says "Thank you" (Interaction 5), and the bot re-asks the exact same "pay today or payment plan?" binary choice it had already asked twice before, rather than closing or confirming — no progression at all after a successful task action.

### C.2 The remaining four — visible, `Not yet instrumented`

Kept visible in the catalogue (per the existing Ratio Explorer convention, §7 of the R4.2/R4.3 UX work — `backend_gap`/`partial` ratios are never hidden), each with an honest reason:

7. **Reference Resolution Accuracy** — *Purpose*: did the system correctly resolve pronouns/implicit references ("that account," "the remittance") to the right entity? *Not instrumented because*: the trace's only explicit coreference marker (`source=coref`, §A.5) has exactly one real example (Interaction 9) — too little evidence to define a defensible eligible population or failure taxonomy yet; needs more real coref-sourced examples, not a speculative definition.
8. **Response Grounding Rate** — *Purpose*: is every factual claim in the bot's response traceable to a specific tool result or RAG reference, with no ungrounded/fabricated detail? *Not instrumented because*: requires reference/chunk IDs on RAG results (§B.2 item 10, currently missing) to cite *which* retrieved fact grounds *which* claim — without that, grounding checks would have to compare free text against free text with no structural anchor, which is exactly the kind of fabricated-inference risk this session's hard boundary exists to prevent.
9. **Repetition/Loop Rate** — *Purpose*: how often does the system ask the identical (or functionally identical) question 2+ times without the conversation state changing? *Not instrumented because*: closely related to, and would double-count with, Task Progression Rate (#6) and Conversation Recovery Rate (#4) without a precise, non-overlapping definition of "loop" distinct from "failed recovery" — worth a dedicated follow-up definition once #4/#6 have real production data to calibrate against, not defined speculatively here. (Note: both traces contain real loop-shaped evidence — EMI Interactions 2/3/5's repeated binary-choice question, and Chat Interactions 22/24's repeated summary offer — useful future fixtures once this ratio is formally defined.)
10. **Customer Correction Rate** — *Purpose*: how often does the customer have to explicitly correct or restate something the bot got wrong? *Not instrumented because*: requires reliably distinguishing "customer restates because the bot misunderstood" from "customer adds new information" — a real distinction visible in the traces (e.g., Chat Interaction 24's forced restatement is a correction; most turns are not) but not yet given a precise, evidence-backed operational definition; deferred rather than guessed at.

---

## D. Conversation Quality Analyzer — architecture

### D.1 Ownership and division of labor

**Call Centre owns the analyzer.** VoiceForce's only two obligations are (a) emit the Interaction Trace facts (§B.2) and (b) host the generic local LLM behind the API in §E Part B. VoiceForce never computes a Conversation Quality ratio, never runs the evaluation prompts, and never sees Call Centre's rubric — this mirrors the exact separation already proven for Campaigns (VoiceForce triggers/reports calls; Call Centre owns campaign result rules) and Ratios (VoiceForce reports call facts; Call Centre owns ratio math).

### D.2 Deterministic-first pipeline

```
Interaction Trace (per interaction, once complete)
        │
        ▼
Deterministic pre-filter (Call Centre, pure code, no LLM)
  — identifies the ELIGIBLE POPULATION for each ratio (§C.1's "Eligible population" rows)
  — e.g.: "turns with router_decision=continue", "turns following a successful tool_exec"
  — 100% reproducible, no model involved, exactly the same discipline ratioMath.ts already uses
        │
        ▼
For candidates needing semantic judgment only (not all — Unnecessary Clarification/Task
Progression narrow deterministically first, per §C.1):
        │
        ▼
Versioned evaluation prompt construction (Call Centre)
  — one prompt template per ratio, versioned (evaluation_version, §D.3)
  — includes ONLY the relevant trace excerpt (never the full session) as evidence
        │
        ▼
Generic Local LLM API (VoiceForce, §E Part B) — prompt in, structured judgment out
        │
        ▼
Call Centre validates the returned JSON against a strict schema
  (reject/retry on malformed output — never persist an unvalidated judgment)
        │
        ▼
Quality Observation persisted (§D.3) — Call Centre's own storage, alongside interaction_events
        │
        ▼
Ratio Explorer aggregation (deterministic COUNT/GROUP BY over Quality Observations —
  the LLM never computes a rate, mirroring "the LLM must not calculate aggregate ratios")
```

### D.3 Quality Observation schema

A new, distinct record type — **not** an `InteractionEvent` variant (§B.1) — capturing an evaluation *of* trace evidence:

```
QualityObservation {
  observationId       — stable, Call-Centre-generated (this record's own idempotency key)
  interactionId        — the same external interaction identity used throughout (matches
                          customer_interactions.interaction_id / InteractionEvent.interactionId)
  evidenceTurnIds       — the specific INTERACTION N (or future stable turn ID, §B.2 item 2)
                          references this judgment was made from — never the whole session
  metric                — one of the 6 implemented Conversation Quality ratio IDs (§C.1)
  eligible              — boolean — was this turn actually in the ratio's denominator
                          (the deterministic pre-filter's own decision, recorded for audit)
  passFail              — pass | fail | not_applicable
  failureCategory        — from that metric's own taxonomy (§C.1), null when passFail=pass
  evaluatorConfidence     — the LLM evaluator's own confidence in ITS judgment (never
                          conflated with the original router's confidence, per §C's stated
                          trust boundary)
  reasonEvidence          — concise, evaluator-generated explanation citing the specific
                          trace facts it relied on (auditable, not a black-box verdict)
  evaluatorModelId         — which model/version produced this judgment (§E Part B's
                          model identity field)
  evaluationVersion        — the prompt-template version used (enables re-evaluating
                          historical traces when the rubric or model changes, without
                          losing the prior judgment — old observations are never
                          overwritten, a new evaluationVersion creates a new observation)
  evaluationTimestamp       — when Call Centre ran this evaluation (NOT the original
                          interaction's time — mirrors InteractionEvent's ingestedAt
                          vs. eventTime distinction exactly)
}
```

This satisfies the session's explicit minimum field list verbatim: interaction ID, turn/evidence IDs, metric, eligibility, pass/fail, failure category, evaluator confidence, concise reason/evidence, evaluator/model identifier, evaluation version, evaluation timestamp.

### D.4 Storage note (design only, not applied this session)

Would follow the exact same pattern R5/R5.1 already established and proved live: a `call_center.quality_observations` table, `SECURITY DEFINER` functions locked to `service_role`, RLS enabled with no public policy — the identical convention, not a new one. **No migration was authored or applied in R6.2** — this is a design note for the next implementation session, consistent with "do not implement speculative production code during R6.2."

---

## E. Formal backend API requirements

Two independent interfaces, specified to the same precision as the existing `Trigger_Call_API.docx`/Campaign API contracts already used as the model for this product's real, implemented integrations.

### Part A — Interaction Trace API

**Objective**: expose the structured runtime facts VoiceForce *already generates* to produce the `.log` diagnostic files (§A proves these facts exist internally — the router, frame state, and tool/RAG results are all real, already-computed data; only their *external, structured exposure* is missing). Call Centre never asks VoiceForce to compute a ratio or quality judgment.

```
GET /api/v1/interaction-trace/{interaction_id}
```

| Header | Required | Description |
|---|---|---|
| `X-API-Key` | Yes | Same integration key already used for every other VoiceForce endpoint. |

**Response body** (structured equivalent of everything catalogued `Existing` in §A, nothing catalogued `Missing`/`Ambiguous` assumed present):

```json
{
  "success": true,
  "interaction_id": "1f599d20-c84a-4167-9c74-fb48780c78ef",
  "turns": [
    {
      "turn_id": "string — REQUIRED, stable, producer-issued (§B.2 item 2, currently missing)",
      "turn_sequence": 1,
      "turn_time": "ISO 8601 — REQUIRED (§B.2 item 1, currently missing)",
      "customer_utterance": "string",
      "bot_utterance": "string",
      "prompt_type": "system | tool | rag",
      "tool_calls": [
        {
          "tool_call_id": "string — REQUIRED, stable (§B.2 item 2)",
          "tool_name": "string",
          "parameters": { "...": "as already shown in final_plan.tool_exec.params" },
          "result": { "...": "the existing structured JSON result shape, unchanged" },
          "success": true,
          "error_code": "string | null — REQUIRED when success=false (§B.2 item 3)",
          "error_message": "string | null",
          "latency_ms": 0,
          "reference_id": "string | null — e.g. the existing request_ref pattern, made universal"
        }
      ],
      "rag_calls": [
        {
          "rag_call_id": "string — REQUIRED, stable",
          "success": true,
          "references": [
            {
              "reference_id": "string — REQUIRED (§B.2 item 10, currently missing)",
              "source_category": "string — the existing category tag, e.g. fees_charges_rates",
              "text": "string",
              "relevance_score": 0.0
            }
          ],
          "latency_ms": 0
        }
      ],
      "frame_context": {
        "emitted": true,
        "active_frames": [
          {
            "frame_id": "string — the existing balance_check:0:b8ada5-shaped ID",
            "intent": "string",
            "tool": "string | null",
            "selected": { "...": "as already shown" },
            "returned": 0,
            "turn_span": { "start": 0, "last_active": 0 }
          }
        ],
        "slot_fill_status": "no_pending | pending",
        "router_decision": {
          "type": "new | continue",
          "target_frame_id": "string | null",
          "source": "gate | llm | classifier_meta | coref",
          "confidence": 0.0,
          "reason": "string"
        },
        "cross_tool_reroute": [],
        "soft_continuation": [],
        "final_plan": {
          "action": "tool_exec | rag_query | guidance | direct_response",
          "tool_call_id": "string | null",
          "rag_call_id": "string | null"
        }
      },
      "authentication_event": {
        "occurred": false,
        "method": "string | null — REQUIRED when occurred=true (§B.2 item 6, currently missing)",
        "success": null,
        "confidence": null
      },
      "escalation_event": {
        "occurred": false,
        "reason": "string | null — REQUIRED when occurred=true (§B.2 item 7, currently missing)"
      },
      "customer_feedback_event": {
        "occurred": false,
        "raw_value": "string | null — the value AS SUBMITTED, not restated (§B.2 item 8)",
        "parsed_score": null
      }
    }
  ]
}
```

**Error responses**: same documented shape as every other VoiceForce endpoint already integrated (`401`/`403` — object `{success, error, message}`; `404` unknown `interaction_id` — plain string `detail`; `502`/`5xx` — plain string `detail`). No new error-shape convention introduced.

**Ordering/pagination**: `turns` is a single ordered array per interaction (both supplied traces are small — 5 and 26 turns). For interactions long enough to need pagination, standard `page`/`page_size` query params matching the existing Call Data convention — **not designed further here**, since neither supplied trace demonstrates a volume requiring it; flagged for confirmation if VoiceForce interactions can run substantially longer.

### Part B — Generic Local LLM API

**Objective**: a use-case-neutral prompt-in/response-out interface backed by VoiceForce's own locally installed LLM. Contains **zero** Conversation Quality business logic — Call Centre constructs the full prompt (including the rubric) and sends it as plain input; this endpoint does not know what a "Context Continuity Rate" is. **No external/cloud LLM dependency is introduced anywhere in this design** — this endpoint is the only LLM call surface, and it is explicitly local-only per the session's own boundary.

```
POST /api/v1/llm/generate
```

| Header | Required | Description |
|---|---|---|
| `X-API-Key` | Yes | Same integration key. |
| `Content-Type` | Yes | `application/json`. |

**Request body**:

```json
{
  "request_id": "string — Call-Centre-generated, echoed back for correlation/idempotency",
  "system_prompt": "string | null",
  "user_prompt": "string",
  "response_format": {
    "type": "text | json_schema",
    "json_schema": { "...": "a JSON Schema object, when type=json_schema — REQUIRED for structured Quality Observation output" }
  },
  "temperature": 0.0,
  "max_output_tokens": 1024
}
```

- `temperature: 0.0` (or the lowest value the local model supports) is the expected setting for every Conversation Quality evaluation call, for reproducibility across re-evaluation runs (§D.3's `evaluationVersion` re-run guarantee depends on this).
- `response_format.type: "json_schema"` is how Call Centre enforces the `QualityObservation` shape (§D.3) at the source, rather than parsing free text.

**Response body**:

```json
{
  "success": true,
  "request_id": "string — echoed",
  "output": "string, or a JSON object when response_format.type=json_schema",
  "model_id": "string — REQUIRED, e.g. name + version of the locally hosted model",
  "finish_reason": "stop | length | error",
  "latency_ms": 0,
  "usage": { "prompt_tokens": 0, "completion_tokens": 0 }
}
```

**Error responses**: same `{success, error, message}` / plain-`detail` convention as Part A and every existing endpoint. A malformed/unparseable `json_schema` response should be reported as a normal error (`finish_reason: "error"`), never silently coerced — Call Centre's own validation step (§D.2) is the second line of defense, not the only one.

**Determinism/versioning note**: `model_id` in every response is what makes `QualityObservation.evaluatorModelId` (§D.3) meaningful — without it, Call Centre cannot know whether a re-evaluation used the same model as a historical one, undermining the entire "re-evaluate when the rubric/model changes" requirement.

---

## F. Golden evaluation fixture set

Six fixtures, one per case named explicitly in the session prompt, each citing the exact trace and interaction number — no fixture invented beyond what's in the two supplied logs.

### Fixture 1 — Correct savings-account continuation
- **Source**: Chat trace, Interaction 3.
- **Setup**: Interaction 2 created frame `balance_check:0:b8ada5` (intent `balance_check`). Interaction 3's user utterance: *"I'd to know the balance in the savings account."*
- **Trace evidence**: `router_decision: continue → balance_check:0:b8ada5 source=llm conf=0.90 reason="specific entity requested"`.
- **Expected evaluator verdict**: `pass` — Context Continuity Rate. The continuation is objectively correct: the user is asking a follow-up about the same account context already established.
- **Ratio**: Context Continuity Rate (also a positive Intent Routing Accuracy example).

### Fixture 2 — Wrong outward-remittance/date continuation
- **Source**: Chat trace, Interaction 7.
- **Setup**: Interaction 6 opened `rag:faq_forex` (user asked about an outward remittance). Interaction 7's user utterance: *"On 15th of March"* — a date, clearly continuing the remittance-status question from Interaction 6.
- **Trace evidence**: `router_decision: continue → transaction_history:2:fb8660 source=llm conf=0.90 reason="specific date mentioned"` — the router picked the transaction-history frame instead of the remittance frame. Resulting `BOT:` answer is an ATM withdrawal record, not remittance information — visibly wrong given the conversational context, even though the tool call itself succeeded.
- **Expected evaluator verdict**: `fail`, `failure_category: wrong_frame_selected` — Context Continuity Rate. **Note the router's own `conf=0.90` here is high and still wrong** — the canonical example of why router confidence must never be read as a correctness label (§C's stated trust boundary).
- **Ratio**: Context Continuity Rate (primary); also a candidate for Conversation Recovery Rate evaluation on the following turns.

### Fixture 3 — Wrong February→March context reuse
- **Source**: Chat trace, Interaction 16.
- **Setup**: User utterance: *"Can I? Can you tell me about my February transaction?"* — explicitly names a different month (February) than the transaction-history frame's existing context (March).
- **Trace evidence**: `router_decision: continue → transaction_history:2:fb8660 source=llm conf=0.90 reason="refining transaction history topic"`. Tool call executed with `search_date: "2026-03-15"` — the **same March date as before**, not February. Resulting answer repeats the March 15th ATM withdrawal, never addressing February at all.
- **Expected evaluator verdict**: `fail`, `failure_category: wrong_frame_selected` (or a stricter sub-category "stale slot reused despite explicit new value" if the taxonomy is later split) — Context Continuity Rate. Again `conf=0.90` and wrong.
- **Ratio**: Context Continuity Rate; also relevant to a future Reference Resolution Accuracy definition (§C.2 item 7) once that ratio is formalized.

### Fixture 4 — Failed affirmative follow-up
- **Source**: Chat trace, Interaction 13.
- **Setup**: Interaction 12's bot turn ends with *"Would you like to know how to do it?"* (an offer). Interaction 13's user utterance: *"Yes, please."*
- **Trace evidence**: `router_decision: continue → rag:fund_transfer source=llm conf=0.90 reason="affirmative response to fund transfer discussion"` — routing itself looks plausible — but `BOT: Sorry, I'm not sure what you'd like me to confirm. What would you like help with?` — the system failed to ground the affirmative into the actual next step the prior turn had offered.
- **Expected evaluator verdict**: `fail`, `failure_category: could_not_ground_affirmative` — Follow-up Understanding Rate.
- **Ratio**: Follow-up Understanding Rate (primary); Interaction 14 (user has to fully restate "How to open a deposit?") is the paired Conversation Recovery Rate evidence — recovery succeeds within 1 turn here.

### Fixture 5 — Failed summary confirmation
- **Source**: Chat trace, Interactions 22–23 (with 24 as compounding evidence).
- **Setup**: Interaction 22: `BOT: Before we end, would you like a summary of our conversation?` (a system-initiated offer). Interaction 23's user utterance: *"Yes, definitely."*
- **Trace evidence**: `router_decision: continue → rag:faq_interest_rates source=llm conf=0.90 reason="affirmative response to ongoing FAQ discussion"` — routed to the wrong prior topic entirely (interest rates, not the summary offer) — `BOT: Sorry, I'm not sure what you'd like me to confirm.` Interaction 24, user restates *"The summary of our conversation"* explicitly, and the bot **repeats the identical Interaction-22 question** (`Before we end, would you like a summary of our conversation?`) rather than acting on the now-unambiguous restatement — a genuine non-recovery.
- **Expected evaluator verdict**: Interaction 23 — `fail`, `failure_category: could_not_ground_affirmative` (Follow-up Understanding Rate) **and** `wrong_frame_selected` (Context Continuity Rate — a single failure can legitimately fail more than one ratio's eligibility check, each scored independently). Interaction 24 → the loop back to Interaction 22's exact question is `not_recovered` — Conversation Recovery Rate — until Interaction 25 finally delivers the summary on the user's 3rd attempt.
- **Ratio**: Follow-up Understanding Rate, Context Continuity Rate, Conversation Recovery Rate (three-ratio compound fixture — deliberately kept as one fixture since it's one real continuous failure sequence, not three unrelated synthetic examples).

### Fixture 6 — Outbound EMI post-tool task-progression/repetition issue
- **Source**: EMI trace, Interactions 2–5.
- **Setup**: Interaction 2 poses a binary choice ("pay today via SMS link, or set up a payment plan?"). Interaction 3's "Oh" re-triggers the identical question (arguably correct — "Oh" is not an answer). Interaction 4: *"Send the link, please"* → `PROMPT: Tool (resend_payment_link)`, `## LOOKUP RESULT`: `action: payment_link_resent`, `request_ref: PL-86559` — **the tool succeeded**, bot confirms the link was resent. Interaction 5: user says *"Thank you"* (a natural closing acknowledgment) → bot **re-asks the exact same binary choice question a third time**, ignoring that the link was just successfully sent and the user had already signaled closure.
- **Expected evaluator verdict**: `fail`, `failure_category: repeated_post_success_question` — Task Progression Rate. Note the EMI trace never emits a `FRAME CONTEXT` at all (§A.6) — this fixture is evaluable purely from `PROMPT`/tool-result/utterance evidence, demonstrating Task Progression Rate does **not** strictly require `FRAME CONTEXT` the way Context Continuity/Intent Routing do (a useful scoping note for §B.2 item 4's priority: FRAME CONTEXT gaps block 3 of the first 6 ratios fully, not all 6).
- **Ratio**: Task Progression Rate (primary candidate for Repetition/Loop Rate, §C.2 item 9, once that ratio is formally defined).

---

## Implementation plan for the next Call Centre session

**Not started this session** — planning only, per "do not implement speculative production code during R6.2."

1. **Confirm §B.2's 10 instrumentation gaps with VoiceForce/backend**, prioritized as marked (items 1–4 are Critical and block all of §C.1's first six ratios; items 6–7 carry over unresolved from R6.1). Nothing in §C/§D can move from "designed" to "live" until at least items 1–4 exist.
2. **Once Part A (Interaction Trace API) is confirmed available**: build the trace-fetch adapter (mirrors `callPopulationFetcher.ts`'s existing pattern — a new, analogous fetcher, not a rewrite of it) and the `quality_observations` migration (§D.4), following R5/R5.1's exact proven pattern (author, review, apply only with explicit approval, verify with synthetic test data first).
3. **Once Part B (Generic Local LLM API) is confirmed available**: build the versioned evaluation-prompt templates for the first six ratios (§C.1), each keyed to a fixed `evaluationVersion`, validated against the six golden fixtures (§ above) as the acceptance test before ever running against real traffic — a fixture that doesn't reproduce its expected verdict blocks shipping that ratio's evaluator, exactly like `ratio-math-verify.mjs`'s role for the existing ratios.
4. **Add the `conversation_quality` `RatioFamily`** to `ratioFrontendRegistry.ts`/`ratioRegistry.ts` with all 10 ratios visible (6 `partial`→`direct` as evaluators are validated, 4 `backend_gap` per §C.2) — additive only, no existing ratio family/entry touched, matching every prior Ratio Explorer session's own regression discipline.
5. **Do not** attempt to backfill any historical trace into a Quality Observation — evaluation only ever runs on interactions whose trace was captured with the instrumentation from step 1 in place, exactly mirroring R5.1/R6.1's "facts only, no inference from what came before" discipline.

---

## Compatibility confirmation (§F)

This was a documentation-only session. `git status` shows no source file touched — only this new document. The 5 existing Direct ratios, R4.3 runtime-state behavior, R5/R5.1 `interaction_events` persistence, Campaign automation (cron config, `runBatch`, reconciliation), and Campaign Session 12.3 Phase E (`b0de9fae-...`, still `running`/`pending` per every prior session's confirmation) were not read-write touched by this session. The Supabase RLS backlog item is unaddressed, as instructed.
