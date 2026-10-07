# Manual QA Quality Framework

Session 16.1 — Call Centre (VoiceForce). Audience: QA Head, Operations Head, Product, CTO/Engineering, API/AI team.

## 1. What this document is

This is the concept and measurement philosophy behind the Call Centre's quality assurance system. It explains *what* quality means here and *why* it is measured the way it is, before any technical implementation detail. The companion document, [`MANUAL_QA_MEASUREMENT_CONTRACT.md`](./MANUAL_QA_MEASUREMENT_CONTRACT.md), is the precise, parameter-by-parameter specification that code is built against.

## 2. What "quality" means here

Interaction quality is **not** "did the AI sound good." It is:

> How well the interaction understood the customer, maintained the conversation, gave reliable responses, progressed and completed the customer's objective, and did so without unnecessary customer effort or avoidable failure.

Quality must be measurable, explainable, evidence-backed, reviewable by a human, comparable across Human QA and future automated analysis, traceable to specific conversation turns, and capable of producing corrective action. There is no unexplained overall "AI Quality Score" — every quality statement in this system traces back to a specific, named, evidenced observation.

### 2.1 The five quality dimensions

| Dimension | Question it answers |
|---|---|
| **Understanding** | Did the agent correctly understand what the customer wanted, and what subsequent customer statements referred to? |
| **Conversation** | Did the interaction preserve context and conduct a coherent multi-turn conversation? |
| **Answer Quality** | Were responses relevant and, where evidence exists, supported by the available information/tool/knowledge source? |
| **Resolution** | Did the interaction actually accomplish the customer's objective? |
| **Efficiency** | Was the objective pursued without unnecessary clarification, repetition, looping, or customer effort? |

### 2.2 Technical Performance is related but separate

Latency (STT, LLM, TTS, tool, RAG, orchestrator — see Session 15.4's Call Metrics integration) affects the customer's *experience* of an interaction, but it is not a qualitative conversational-correctness measure. A call can be fast and wrong, or slow and right. The two are tracked independently and never blended into a single number.

## 3. The measurement model — three kinds of measure

### 3.1 Direct measures

Explicitly supplied by an authoritative source — never inferred. Examples: FCR, authentication, business outcome, request completion, human assistance, escalation. Where an authoritative structured value already exists (e.g. the Voice/Chat API's own `fcr`, `outcome`, or an agent's declared business-outcome vocabulary), the Call Centre uses it directly. It does not re-derive or second-guess it with an LLM.

### 3.2 Derived measures

Calculated deterministically from direct observations, e.g. `Request Completion Rate = completed eligible requests / eligible requests`. No judgment is involved — only arithmetic over already-recorded facts.

### 3.3 Evaluated qualitative measures

Require examining the conversation and its evidence: Context Continuity, Follow-up Understanding, Reference Resolution, Task Progression, Unnecessary Clarification, Repetition/Loop, Customer Correction, Conversation Recovery, Response Grounding. In this session, these are evaluated **manually by a Human QA reviewer**. A future automated/API analysis may evaluate the same nine parameters independently, against the same definitions — never a different vocabulary.

## 4. Human QA is the independent reference

**Human QA = the reference assessment.** **Automated/API analysis = the scalable assessment.** **Comparing the two = how the automated assessment gets validated**, not the other way around.

A reviewer doing a Human QA pass must never see a future automated finding before submitting their own review. This prevents anchoring — a human who sees "the AI flagged this as a context-continuity failure" is no longer giving an independent judgment.

```text
                 COMMON QUALITY CONTRACT
                           |
               +-----------+-----------+
               |                       |
               v                       v
          HUMAN QA                AUTOMATED QA
               |                       |
               +-----------+-----------+
                           |
                           v
                        COMPARE
                           |
              +------------+------------+
              |                         |
           AGREEMENT                DISAGREEMENT
                                         |
                                         v
                                   ADJUDICATION
                                         |
                                         v
                                CORRECTIVE ACTION
```

**Only the Human QA side of this diagram is implemented in Session 16.1.** The automated side, the comparison, and adjudication are deliberately deferred (§9 below) — the contract is built so they can be added later without reworking the Human QA data model.

## 5. Why exception-based review

A reviewer who has to answer nine explicit questions for every single turn will not review many conversations, and will rush the ones they do. The normal interaction is mostly fine. The system is built around that reality:

**Normal workflow: Read → Good + Next.**
**Not: Read → answer nine questions → Save → Next.**

But **"unreviewed" must never be confused with "passed."** The system always knows, per turn, whether a human actually looked at it (`NOT_REVIEWED` vs `GOOD` vs `FLAGGED` vs `N/A`) — see the Measurement Contract's Applicability Model for exactly which parameters get a clean result on a fast "Good," and why the rest require the reviewer to explicitly engage with them.

## 6. The conversation is the workspace

The review screen is not a questionnaire with a transcript attached as reference material. The transcript **is** the primary surface; the review controls are a compact side panel that follows the reviewer's position in the conversation. See the Measurement Contract's workflow section for the exact interaction model (fast path, exception path, keyboard shortcuts).

## 7. Evidence and findings

Every quality judgment that isn't a clean "Good" is a **Finding**: one parameter, one result, a primary turn, zero or more supporting evidence turns (which may include customer turns — a customer correction is evidence for an agent's earlier misunderstanding), a reason code from a fixed, documented vocabulary, and an optional note. This shape is deliberately the same shape a future automated analyzer would need to produce, so the two can be compared turn-for-turn and parameter-for-parameter later.

## 8. Interaction-level conclusions

Independent of the turn-by-turn findings, every review also records four interaction-level conclusions: Request Completion, FCR, Human Assistance Required, and Business Outcome (using the agent's own contract vocabulary where one is legitimately different from the default). These mirror the "direct measures" already recorded elsewhere in the Call Centre, captured here as the Human reviewer's own independent read — useful on its own, and essential later for validating that the *automated* interaction-level read agrees.

## 9. What is deferred (explicitly, by design)

This session builds only the Human QA review workflow, its persistence, and its ratios. The following are documented as the intended next stages but **not implemented**:

- Automated/LLM quality analysis integration.
- Human vs. Automated comparison (agreement/disagreement).
- Precision/recall-style comparison UI ("correctly detected 84% of Human QA findings").
- Disagreement adjudication.
- Corrective-action workflow (routing a confirmed finding to Agent behaviour / Intent classification / Context handling / Knowledge-RAG / Tool-backend / Business process / Speech recognition / Technical platform / Other — see §11).
- Automated root-cause inference.

## 10. Future comparison model (documented now, built later)

A simple "agreement percentage" is not enough for exception-oriented parameters, because most turns are clean and agreement-by-default would make any analyzer look artificially good. The intended future model instead uses:

- **Detection / Recall** — of the problems Human QA found, how many did automated analysis also detect?
- **Precision** — of the problems automated analysis flagged, how many did Human QA confirm?

Expressed in plain business language, e.g. *"Correctly detected 84% of Human QA findings,"* or *"9% of automated findings were rejected by Human QA."* This requires both sides to produce findings in the same shape described in §7 — which is exactly why the Finding model is built that way now, even though only the Human side exists today.

## 11. Corrective feedback model (documented now, built later)

A confirmed finding is not automatically a root cause. A `RESPONSE_GROUNDING` failure reasoned `CONTRADICTS_AVAILABLE_EVIDENCE` might trace to Knowledge/RAG in one case and to a tool/backend defect in another — the system does not assume; a human confirms the corrective area. The intended (future) corrective-area vocabulary: Agent behaviour/prompt, Intent classification, Context handling, Knowledge/RAG, Tool/backend, Business process/policy, Speech recognition, Technical platform, Other.

## 12. The quality improvement lifecycle

```text
REVIEW → MEASURE → FIND QUALITY EXCEPTIONS → UNDERSTAND CAUSE → CORRECT → MEASURE SUBSEQUENT INTERACTIONS → DID QUALITY IMPROVE?
```

The purpose of QA is not to score agents. It is to **find measurable interaction failures, understand their evidence and causes, correct the responsible system or process, and verify that subsequent interactions actually improve.** Session 16.1 builds the "REVIEW" and "MEASURE" stages, on a foundation that supports the rest without redesign.
