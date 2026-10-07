# Manual QA Measurement Contract

Session 16.1 — the canonical, binding vocabulary for Human QA. Code (`src/lib/qaParameters.ts`), persistence, and UI all use these exact codes/values. This document must stay internally consistent with the implementation — if one changes, the other does too, in the same commit.

Read [`MANUAL_QA_QUALITY_FRAMEWORK.md`](./MANUAL_QA_QUALITY_FRAMEWORK.md) first for the concept/philosophy this formalizes.

## 0. Parameter code reuse — not a new vocabulary

Session R6.2 (`docs/SESSION_R6_2_CONVERSATION_QUALITY_ARCHITECTURE.md`) already defined 10 "Conversation Quality" ratios in the Ratio Explorer registry (`src/server/analytics/ratioRegistry.ts`), each `awaiting_telemetry`/`backend_gap` — defined, but with no evidence source. Nine of those ten map exactly to this session's nine canonical QA parameters. **This contract reuses those exact ratio ids as the QA parameter codes** — never a synonym — so a Human QA finding and a future-automated/Ratio-Explorer reading of the same concept are the same concept, not two different things that happen to sound similar.

| QA parameter code (= Ratio Explorer ratio id) | Prior registry availability |
|---|---|
| `context_continuity_rate` | awaiting_telemetry |
| `followup_understanding_rate` | awaiting_telemetry |
| `reference_resolution_accuracy` | backend_gap |
| `task_progression_rate` | awaiting_telemetry |
| `unnecessary_clarification_rate` | awaiting_telemetry |
| `repetition_loop_rate` | backend_gap |
| `customer_correction_rate` | backend_gap |
| `conversation_recovery_rate` | awaiting_telemetry |
| `response_grounding_rate` | backend_gap |

`intent_routing_accuracy` (the registry's 10th Conversation Quality ratio) has **no** Human QA counterpart in this session's nine parameters — it is not a reviewer-observable conversational-correctness concept in the same sense (it concerns which agent/flow the system routed to, not how that agent conducted the conversation). Left untouched; a candidate for a possible future 10th parameter, not added speculatively here.

Human QA measurement and Ratio Explorer *automated* availability remain **different things** (§9 of the Framework doc). This session does not flip any of these nine ratios to `direct` in the registry — it only gives Human QA its own, separately-sourced reading of the same named concept. The registry's `availability` stays exactly as it was; a later session wires the Human QA reading in as its own explicit source, never silently reinterpreted as "the ratio is now available."

## 1. Turn identity (both channels)

A Finding/Turn-Review must reference a **stable** turn, never array position.

- **Chat**: the frontend-facing `ChatMessage.id` (`src/types/chat.ts`) is already a stable, deterministic id — `api/chat/logs.ts` builds it as `${sessionId}-${number}` (the Chat Transcript API's own 1-indexed `number`) on the live path, or the real persisted row id on the local-fallback path. Reused as-is; no separate computation needed in the UI, unlike voice.
- **Voice**: the Voice Partner transcript (`DetailedTranscriptEntryDto` / `TranscriptEntry`) has no `id` field at all — only `{timestamp, speaker, text, sentiment?, confidence?}`, fetched live, never persisted by Call Centre. A deterministic Call Centre turn id is synthesized:

  ```
  turnId = `${interactionId}:${entry.timestamp}:${entry.speaker}:${indexWithinSameTimestampSpeaker}`
  ```

  `timestamp` is microsecond-precision ISO-8601 from the upstream transcript, so `(timestamp, speaker)` is unique in every real sample observed. The trailing index is a **collision-breaker only** (handles the theoretical case of two turns from the same speaker at the identical microsecond) — it is never the primary identity, and never shifts an existing turn's id when the transcript is re-fetched, because it's derived from the stable `(timestamp, speaker)` grouping, not raw array position. See `src/lib/qaTurnIdentity.ts`.

## 2. Allowed result values (uniform across parameters, parameter-specific meaning)

Rather than nine bespoke enumerations, every parameter uses one of three small, already-distinct result vocabularies, chosen per parameter below:

- **PASS / FAIL / N_A** — "was this handled correctly," used for parameters with a clear correct/incorrect reading.
- **NO_ISSUE / ISSUE / N_A** — "did this exception occur," used for parameters framed as a problem to detect (lower is better).
- **GROUNDED / NOT_GROUNDED / CANNOT_VERIFY / N_A** — Response Grounding only (§6.9 of the brief); `CANNOT_VERIFY` exists specifically so missing evidence is never silently recorded as a pass.
- **SUCCESSFUL / UNSUCCESSFUL / N_A** — Conversation Recovery only.

`N_A` is always a legitimate, storable value — never the *absence* of a row. A turn with no Finding row for a parameter at all means "not assessed" (excluded from that parameter's ratio denominator entirely); a turn with a Finding row whose value is `N_A` means "a reviewer actively determined this parameter doesn't apply here" (also excluded from the denominator, but as a positive statement, not a gap).

## 3. Applicability model — exactly how "Good + Next" decides what to record

Two tiers, decided per agent turn by a **structural, deterministic rule** — never NLP/heuristic text inference, and always reviewer-overridable.

### Tier 1 — auto-recorded PASS on "Good + Next" (unless the reviewer has overridden it to N_A for that turn)

| Parameter | Structural eligibility rule |
|---|---|
| `context_continuity_rate` | Applicable on any Agent turn that is **not** that agent's first turn in the interaction (nothing could have been "carried forward" before a first turn). |
| `followup_understanding_rate` | Applicable on any Agent turn responding to a Customer turn that is **not** the first Customer turn in the interaction (the very first customer utterance establishes intent; it has no "follow-up" relationship to resolve yet). |
| `task_progression_rate` | Applicable on every substantive Agent turn. |

These three are the only parameters where "I read it, it looked fine" (`GOOD`) is treated as sufficient evidence of a PASS, because their applicability is a structural fact about the turn's position, not a judgment call about its content.

### Tier 2 — never auto-recorded; requires explicit reviewer engagement

| Parameter | Why it's Tier 2 (applicability is a judgment call) |
|---|---|
| `reference_resolution_accuracy` | Only applicable where the turn actually contains a contextual reference ("it," "that one," "this EMI") — requires reading the text. |
| `unnecessary_clarification_rate` | Only applicable where the Agent turn asks/seeks clarification at all. |
| `repetition_loop_rate` | Requires recognizing a repeat/loop across turns, not a property of one turn alone. |
| `customer_correction_rate` | Assessed on **Customer** turns (§5), not Agent turns — never auto-recorded from an Agent-turn "Good." |
| `conversation_recovery_rate` | Only applicable when a genuine prior recovery opportunity exists (a preceding correction or error) — conditional on other findings, not a default state. |
| `response_grounding_rate` | Requires the reviewer to have actually checked the claim against evidence; defaulting to `GROUNDED` on a plain "Good" would be exactly the "missing evidence silently becomes PASS" failure mode the brief explicitly forbids. |

A turn marked `GOOD` with no Tier-2 findings simply has **no Finding rows** for those six parameters — correctly excluded from their ratio denominators, never counted as a pass. A reviewer who does want to positively assert "I checked and there's no issue" for a Tier-2 parameter uses the same exception editor (§5) and selects `NO_ISSUE`/`PASS`/`GROUNDED` explicitly — a real, intentional record, not an inferred one.

Overriding Tier 1 to `N_A` (e.g., a purely social/closing Agent turn where Task Progression isn't a meaningful question) uses the same exception editor.

## 4. Canonical parameter dictionary

Each entry follows the brief's required 20-field shape. Fields 1–6 and 16 are summarized in the table below for scanability; the rest follow per-parameter.

| # | Code | Display name | Dimension | Values | Directionality |
|---|---|---|---|---|---|
| 1 | `context_continuity_rate` | Context Continuity | Conversation | PASS/FAIL/N_A | Higher better |
| 2 | `followup_understanding_rate` | Follow-up Understanding | Understanding | PASS/FAIL/N_A | Higher better |
| 3 | `reference_resolution_accuracy` | Reference Resolution | Understanding | PASS/FAIL/N_A | Higher better |
| 4 | `task_progression_rate` | Task Progression | Resolution | PASS/FAIL/N_A | Higher better |
| 5 | `unnecessary_clarification_rate` | Unnecessary Clarification | Efficiency | NO_ISSUE/ISSUE/N_A | Lower better |
| 6 | `repetition_loop_rate` | Repetition / Loop | Efficiency | NO_ISSUE/ISSUE/N_A | Lower better |
| 7 | `customer_correction_rate` | Customer Correction | Understanding | NO_ISSUE/ISSUE/N_A | Lower better |
| 8 | `conversation_recovery_rate` | Conversation Recovery | Conversation | SUCCESSFUL/UNSUCCESSFUL/N_A | Higher better |
| 9 | `response_grounding_rate` | Response Grounding | Answer Quality | GROUNDED/NOT_GROUNDED/CANNOT_VERIFY/N_A | Higher better |

### 4.1 `context_continuity_rate` — Context Continuity

- **Definition**: did the agent correctly retain and use relevant information already established earlier in the interaction?
- **Why measured**: a conversational agent that forgets or contradicts what the customer already said forces the customer to repeat themselves and erodes trust.
- **Unit of assessment**: one Agent turn.
- **Applicable**: any Agent turn that isn't that agent's first turn (Tier 1, auto-eligible).
- **N/A**: the agent's first turn in the interaction; reviewer override for a turn with nothing to carry forward.
- **Evidence required**: the turn(s) where the relevant information was originally established, plus the turn where it was lost/contradicted.
- **Numerator**: Agent turns marked PASS. **Denominator**: Agent turns with a `context_continuity_rate` Finding row (PASS or FAIL; N_A excluded). **Exclusions**: N_A.
- **PASS example**: customer gives account last-4 digits in turn 2; agent correctly references "the account ending 4455" in turn 8 without re-asking.
- **FAIL example**: customer already said "I already paid this EMI" in turn 4; agent asks "would you like to pay your EMI now?" in turn 9 as if it were never mentioned. Reason: `PREVIOUS_INFORMATION_IGNORED`.
- **Boundary example**: agent partially restates prior info but with a stale value (customer updated the amount mid-call) — reason `WRONG_CONTEXT_CARRIED_FORWARD`, not `PREVIOUS_INFORMATION_IGNORED`.
- **Future automated mapping**: an LLM judge given the same transcript window and the same PASS/FAIL/N_A contract.

### 4.2 `followup_understanding_rate` — Follow-up Understanding

- **Definition**: did the agent correctly understand a customer's follow-up statement/question in relation to the preceding conversation? (Distinct from *initial* intent recognition.)
- **Why measured**: the first turn's intent-matching is already covered by existing intent-accuracy telemetry; this measures whether the agent sustains that understanding across the conversation.
- **Unit of assessment**: one Agent turn, responding to a non-first Customer turn.
- **Applicable**: Tier 1, auto-eligible per §3.
- **N/A**: the agent's response to the very first customer utterance.
- **Evidence required**: the follow-up Customer turn and the Agent turn responding to it.
- **Numerator**: PASS Agent turns. **Denominator**: Agent turns with a Finding row. **Exclusions**: N_A.
- **PASS example**: customer establishes a home-loan enquiry, later asks "when is the next payment?" — agent correctly answers about the home loan, not an unrelated product.
- **FAIL example**: same follow-up, agent answers about a different loan on file. Reason: `RELATION_TO_PRIOR_TURN_MISSED`.
- **Future automated mapping**: an LLM judge scoring whether the response is coherent with the referenced prior turn.

### 4.3 `reference_resolution_accuracy` — Reference Resolution

- **Definition**: did the agent correctly resolve contextual references ("it," "that one," "second account," "this EMI," "the earlier payment," "that transaction")?
- **Why measured**: unresolved/misresolved references produce answers about the wrong entity — a correctness failure, not a style issue.
- **Unit of assessment**: one Agent turn.
- **Applicable**: only where the Agent turn is responding to a Customer turn that contains a genuine contextual reference (Tier 2 — reviewer judgment).
- **N/A**: no reference present; default state until a reviewer positively engages.
- **Evidence required**: the turn containing the reference, the turn(s) establishing the referent, the agent's resolving turn.
- **Numerator**: PASS. **Denominator**: Finding rows (PASS/FAIL). **Exclusions**: N_A.
- **PASS example**: customer has two loans, asks "what's the balance on the second one?" — agent correctly answers about the second loan listed earlier.
- **FAIL example**: same, agent answers about the first loan. Reason: `WRONG_ENTITY`.
- **Future automated mapping**: coreference-resolution-aware LLM judge.

### 4.4 `task_progression_rate` — Task Progression

- **Definition**: did the agent's response materially move the customer's stated objective toward completion? (A response can be polite and linguistically correct while still failing this.)
- **Why measured**: directly reflects whether the interaction is actually going somewhere, independent of tone.
- **Unit of assessment**: one Agent turn.
- **Applicable**: every substantive Agent turn (Tier 1, auto-eligible).
- **N/A**: a purely social/closing turn ("you're welcome," "goodbye") where "progression" isn't a meaningful question — reviewer override.
- **Evidence required**: the turn itself, and the customer's stated objective (usually an earlier turn).
- **Numerator**: PASS. **Denominator**: Finding rows. **Exclusions**: N_A.
- **PASS example**: customer asks to pay an EMI; agent provides the payment link and next step.
- **FAIL example**: customer asks to pay an EMI; agent repeats "I understand you want to pay your EMI" without providing a next step. Reason: `RESPONSE_DID_NOT_ADVANCE_TASK`.
- **Future automated mapping**: an LLM judge comparing pre/post task-state.

### 4.5 `unnecessary_clarification_rate` — Unnecessary Clarification (lower is better)

- **Definition**: did the agent ask for information or clarification that was already available or not actually required?
- **Why measured**: every unnecessary clarification costs the customer a turn and signals the agent isn't using available context.
- **Unit of assessment**: one Agent turn that asks a question.
- **Applicable**: only Agent turns that ask/seek clarification (Tier 2 — reviewer judgment; most turns don't ask anything, so most turns are simply never assessed for this parameter).
- **N/A**: the turn asks nothing; default/unassessed state.
- **Evidence required**: the clarifying question turn, and the earlier turn(s) that already supplied the information.
- **Numerator (of the "issue" direction)**: `ISSUE` Finding rows. **Denominator**: Finding rows (`ISSUE`+`NO_ISSUE`). **Exclusions**: N_A.
- **ISSUE example**: customer: "I want to check whether my EMI due on 15 October has been paid." Agent: "What would you like to know about your EMI?" Reason: `INFORMATION_ALREADY_AVAILABLE`.
- **NO_ISSUE example**: agent asks for a detail genuinely not yet provided (e.g., which of two accounts).
- **Future automated mapping**: an LLM judge checking the clarifying question's target information against prior turns.

### 4.6 `repetition_loop_rate` — Repetition / Loop (lower is better)

- **Definition**: did the conversation unnecessarily repeat information, questions, or responses, or enter a non-progressing loop?
- **Why measured**: repetition is a direct, countable efficiency failure and a strong customer-frustration signal.
- **Unit of assessment**: **interaction-level**, deliberately — a loop is a property of a span of turns (agent repeats question A, then again at turn N), not cleanly attributable to one turn in isolation; forcing a single-turn unit would either miss multi-turn loops or double-count every turn in the loop. The Finding's `primary_turn` is the turn where the repetition became evident (e.g., the second occurrence), with the original turn(s) linked as evidence — but the ratio itself rolls up to one determination per reviewed interaction.
- **Applicable**: Tier 2, reviewer judgment, assessed once per interaction during review (not per turn).
- **N/A**: not applicable to a single-turn or otherwise too-short interaction to exhibit a loop; reviewer override.
- **Evidence required**: every turn that is part of the repeated exchange.
- **Numerator**: reviewed interactions with `ISSUE`. **Denominator**: reviewed interactions with a Finding row (`ISSUE`+`NO_ISSUE`). **Exclusions**: N_A.
- **ISSUE example**: agent asks "can I get your date of birth?" at turn 5 and again at turn 11 with no intervening reason (e.g., a dropped/garbled response) to re-ask. Reason: `AGENT_REPEATED_QUESTION`.
- **Future automated mapping**: an LLM judge scanning the full transcript for repeated question/answer pairs.

### 4.7 `customer_correction_rate` — Customer Correction (lower is better)

- **Definition**: did the customer need to correct the agent? ("No, that's not what I said." / "I already told you." / "No, I mean my home loan." / "That's incorrect.")
- **Why measured**: a direct, unambiguous signal straight from the customer that something the agent said or assumed was wrong — not an inference, the customer said so.
- **Unit of assessment**: one **Customer** turn (not an Agent turn — see Framework §2, customer turns aren't scored as customer performance, but are evidence).
- **Applicable**: any Customer turn (Tier 2 — reviewer reads it and decides whether it's a correction).
- **N/A**: turn is not a correction; default/unassessed state.
- **Evidence required**: the Customer correction turn itself, and (where identifiable) the Agent turn that caused it — linked as the `primary_turn` on the Agent side or as an evidence turn, per reviewer's linking.
- **Numerator**: reviewed interactions containing a `customer_correction_rate = ISSUE` Finding. **Denominator**: eligible reviewed interactions. **Exclusions**: N_A.
- **ISSUE example**: customer: "No, I mean my home loan, not my car loan." Reason: `ENTITY_CORRECTION`.
- **Future automated mapping**: an LLM judge classifying customer turns as corrective or not.

### 4.8 `conversation_recovery_rate` — Conversation Recovery

- **Definition**: where a recoverable misunderstanding/error occurred, did the agent correctly recover (acknowledge the correction, adopt the corrected information, continue from the corrected state, not repeat the same error)?
- **Why measured**: errors happen; what matters for customer experience is whether the agent recovers cleanly.
- **Unit of assessment**: one Agent turn — specifically the turn immediately following a genuine recovery opportunity (typically a preceding `customer_correction_rate = ISSUE` finding, or an agent self-correction trigger).
- **Applicable**: only when a genuine recovery opportunity exists (Tier 2, conditional on another finding — never a default state on an ordinary turn).
- **N/A**: no recovery opportunity occurred in the interaction; the default for every turn until a qualifying opportunity is identified.
- **Evidence required**: the turn containing the original problem (often a linked Customer Correction), and the agent's recovering turn.
- **Numerator**: SUCCESSFUL. **Denominator**: Finding rows (SUCCESSFUL+UNSUCCESSFUL). **Exclusions**: N_A.
- **SUCCESSFUL example**: customer corrects "no, my home loan" → agent: "Apologies, let's go with your home loan — here's the balance." Reason n/a (positive case).
- **UNSUCCESSFUL example**: same correction, agent continues discussing the car loan. Reason: `CORRECTION_NOT_ACCEPTED`.
- **Future automated mapping**: an LLM judge checking the turn immediately after a flagged problem for acknowledgement + adoption + non-repetition.

### 4.9 `response_grounding_rate` — Response Grounding

- **Definition**: where a factual response requires supporting evidence (tool result, RAG retrieval, knowledge source, customer/account data, or an established conversation fact), is the response consistent with that evidence?
- **Why measured**: an agent can be fluent and still be factually wrong; this is the one parameter that checks the response against ground truth rather than conversational coherence alone.
- **Unit of assessment**: one Agent turn making a factual/evidence-backed claim.
- **Applicable**: only Agent turns making such a claim (Tier 2, reviewer judgment).
- **N/A**: the turn makes no factual claim requiring evidence.
- **`CANNOT_VERIFY`**: the claim *should* have evidence but the reviewer cannot currently see it (e.g. tool/RAG result not surfaced in the available transcript/evidence) — **never silently converted to GROUNDED**. This is a first-class, intentionally common state until tool/RAG evidence surfacing is improved.
- **Evidence required**: the claim turn and, where available, the underlying tool/RAG/knowledge evidence.
- **Numerator**: GROUNDED. **Denominator**: GROUNDED + NOT_GROUNDED (CANNOT_VERIFY and N_A both excluded). **Exclusions**: CANNOT_VERIFY, N_A.
- **GROUNDED example**: agent states an EMI amount that matches the account data visible to the reviewer.
- **NOT_GROUNDED example**: agent states a due date that contradicts the visible account record. Reason: `CONTRADICTS_AVAILABLE_EVIDENCE`.
- **CANNOT_VERIFY example**: agent cites a policy the reviewer has no way to check from the available evidence. Reason: `CANNOT_VERIFY_SOURCE`.
- **Future automated mapping**: an LLM judge with direct tool/RAG trace access (this is exactly the parameter most likely to improve once an Interaction Trace API exists — see the `awaiting_telemetry` ratios' own stated dependency).

## 5. Reason-code vocabulary (fixed, extensible only by a documented change)

| Parameter | Reason codes |
|---|---|
| `context_continuity_rate` | `PREVIOUS_INFORMATION_IGNORED`, `PREVIOUS_INFORMATION_CONTRADICTED`, `WRONG_CONTEXT_CARRIED_FORWARD`, `CONTEXT_LOST_AFTER_TRANSITION`, `OTHER` |
| `followup_understanding_rate` | `FOLLOW_UP_MISUNDERSTOOD`, `WRONG_INTERPRETATION`, `RELATION_TO_PRIOR_TURN_MISSED`, `OTHER` |
| `reference_resolution_accuracy` | `WRONG_ENTITY`, `REFERENCE_NOT_RESOLVED`, `AMBIGUITY_HANDLED_INCORRECTLY`, `OTHER` |
| `task_progression_rate` | `RESPONSE_DID_NOT_ADVANCE_TASK`, `IRRELEVANT_RESPONSE`, `CONVERSATION_STALLED`, `WRONG_NEXT_STEP`, `OTHER` |
| `unnecessary_clarification_rate` | `INFORMATION_ALREADY_AVAILABLE`, `DUPLICATE_QUESTION`, `QUESTION_NOT_REQUIRED`, `OTHER` |
| `repetition_loop_rate` | `AGENT_REPEATED_QUESTION`, `AGENT_REPEATED_ANSWER`, `CUSTOMER_FORCED_TO_REPEAT`, `CONVERSATION_LOOP`, `OTHER` |
| `customer_correction_rate` | `INTENT_CORRECTION`, `FACTUAL_CORRECTION`, `CONTEXT_CORRECTION`, `ENTITY_CORRECTION`, `OTHER` |
| `conversation_recovery_rate` | `CORRECTION_NOT_ACCEPTED`, `ERROR_REPEATED`, `WRONG_RECOVERY`, `RECOVERY_STALLED`, `OTHER` |
| `response_grounding_rate` | `UNSUPPORTED_RESPONSE`, `CONTRADICTS_AVAILABLE_EVIDENCE`, `WRONG_SOURCE_OR_CONTEXT`, `CANNOT_VERIFY_SOURCE`, `OTHER` |

A reason code is required whenever a Finding's value is the "problem" direction (FAIL / ISSUE / NOT_GROUNDED / UNSUCCESSFUL / CANNOT_VERIFY). Not required for PASS / NO_ISSUE / SUCCESSFUL / GROUNDED / N_A.

## 6. Interaction-level conclusions

| Field | Allowed values |
|---|---|
| Request Completion | `YES`, `PARTIAL`, `NO`, `CANNOT_DETERMINE` |
| FCR | `YES`, `NO`, `CANNOT_DETERMINE` |
| Human Assistance Required | `YES`, `NO`, `CANNOT_DETERMINE` |
| Business Outcome | `RESOLVED`, `PARTIALLY_RESOLVED`, `HUMAN_ASSISTANCE_REQUIRED`, `NOT_RESOLVED`, `CUSTOMER_ABANDONED` — or the reviewed agent's own declared business-outcome vocabulary where one legitimately differs (never forced to the default list) |

These are captured once per review, independent of per-turn findings.

## 7. Review/turn/finding statuses

- **Review status**: `IN_PROGRESS`, `SUBMITTED`.
- **Turn review status**: `NOT_REVIEWED` (default — never implies PASS), `GOOD`, `FLAGGED`, `N_A`.

## 8. Workflow (summary — see the Framework doc §5–§6 for rationale)

1. Reviewer opens/resumes a review for one interaction (Call or Chat).
2. For each reviewable turn, in order: **Good + Next** (fast path, §3 Tier 1 auto-PASS) or **Flag Issue** (exception editor: select parameter(s), result, reason code, evidence turns, optional note) or **N/A** (same editor, override Tier 1 applicability).
3. Progress is persisted continuously (resumable).
4. After the last turn, the reviewer records interaction-level conclusions (§6) and an optional overall note.
5. Summary screen: completeness, findings by parameter, jump-to-evidence.
6. Submit — review becomes immutable (any later correction is an explicit, audited, versioned edit, never a silent overwrite).

## 9. Keyboard shortcuts

`G` Good + Next · `F` Flag · `N` N/A · `↑`/`↓` previous/next reviewable turn · `Enter` confirm/save where unambiguous · `Esc` close the exception editor without saving. Suppressed entirely while focus is inside any input/textarea/select/combobox.
