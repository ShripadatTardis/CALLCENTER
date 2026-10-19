// src/server/cma/cmaEvidencePathSelector.ts
function selectCmaEvidencePath(input) {
  if (input.apiFindingPresent && input.apiFindingConsistentWithOtherFacts !== false) {
    return { kind: "fast_path" };
  }
  if (input.apiFindingPresent && input.apiFindingConsistentWithOtherFacts === false) {
    return input.verificationContextAvailable ? { kind: "verification_required", reason: "api_finding_contradicts_other_structured_facts" } : { kind: "unsupported_inference", reason: "contradictory_evidence_with_no_verification_context" };
  }
  if (!input.apiFindingPresent && input.deterministicallyDerivable && !input.requiresConversationalInterpretation) {
    return { kind: "derivation_deterministic" };
  }
  if (!input.apiFindingPresent && input.requiresConversationalInterpretation) {
    return input.verificationContextAvailable ? { kind: "verification_required", reason: "no_structured_finding_requires_conversational_interpretation" } : { kind: "unsupported_inference", reason: "no_structured_finding_and_no_verification_context" };
  }
  return { kind: "unsupported_inference", reason: "no_evidence_path_available" };
}

// src/lib/qaTurnIdentity.ts
function computeVoiceTurnId(interactionId, entries) {
  const seen = /* @__PURE__ */ new Map();
  return entries.map((entry) => {
    const key = `${entry.timestamp}:${entry.speaker}`;
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    return occurrence === 0 ? `${interactionId}:${entry.timestamp}:${entry.speaker}` : `${interactionId}:${entry.timestamp}:${entry.speaker}:${occurrence}`;
  });
}

// src/server/cma/cmaEscalationEvidence.ts
var ESCALATION_REASON_FACT_ID = "escalation_reason";
var ESCALATION_REASON_EVALUATOR_VERSION_DETERMINISTIC = "deterministic-v1";
var KNOWN_REASON_CATEGORIES = /* @__PURE__ */ new Set([
  "customer_requested_human",
  "agent_unable_to_resolve",
  "policy_required_escalation",
  "technical_failure",
  "unresolved"
]);
function makeFinding(input, partial) {
  return {
    interactionId: input.interactionId,
    interactionType: "call",
    factId: ESCALATION_REASON_FACT_ID,
    evaluatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    supersedesEvaluationId: input.priorEvaluationId ?? null,
    ...partial
  };
}
async function evaluateEscalationReasonEvidence(input, verify) {
  const escalationExecuted = input.outcome === "escalated";
  const escalationRequested = Boolean(input.escalationTrigger && input.escalationTrigger.trim().length > 0);
  if (!escalationExecuted && !escalationRequested) {
    return makeFinding(input, {
      eligibility: "ineligible",
      value: null,
      sourceObservation: null,
      evidenceRefs: [],
      validationStatus: "validated",
      confidence: 1,
      evaluationMethod: "derivation_deterministic",
      evaluatorVersion: ESCALATION_REASON_EVALUATOR_VERSION_DETERMINISTIC,
      note: null
    });
  }
  const path = selectCmaEvidencePath({
    apiFindingPresent: escalationRequested,
    apiFindingOrigin: "voiceforce_api",
    apiFindingConsistentWithOtherFacts: escalationRequested ? escalationExecuted : void 0,
    deterministicallyDerivable: false,
    // escalation reason is never computable from outcome alone
    verificationContextAvailable: Boolean(input.transcript && input.transcript.length > 0),
    requiresConversationalInterpretation: true
  });
  if (path.kind === "fast_path") {
    return makeFinding(input, {
      eligibility: "eligible",
      value: input.escalationTrigger,
      sourceObservation: { origin: "voiceforce_api", raw: input.escalationTrigger },
      evidenceRefs: ["escalation_trigger"],
      validationStatus: "validated",
      confidence: 1,
      evaluationMethod: "fast_path",
      evaluatorVersion: ESCALATION_REASON_EVALUATOR_VERSION_DETERMINISTIC,
      note: null
    });
  }
  if (path.kind === "unsupported_inference") {
    const note = path.reason === "contradictory_evidence_with_no_verification_context" ? "escalation_trigger present but outcome != escalated (requested, not confirmed executed) \u2014 no transcript available to resolve which is correct" : "outcome=escalated with no escalation_trigger and no transcript available for verification";
    return makeFinding(input, {
      eligibility: escalationRequested && !escalationExecuted ? "indeterminate" : "eligible",
      value: null,
      sourceObservation: escalationRequested ? { origin: "voiceforce_api", raw: input.escalationTrigger } : null,
      evidenceRefs: [],
      validationStatus: "insufficient",
      confidence: null,
      evaluationMethod: "unresolved",
      evaluatorVersion: ESCALATION_REASON_EVALUATOR_VERSION_DETERMINISTIC,
      note
    });
  }
  const verification = await verify(input.interactionId, input.transcript);
  const turnIds = computeVoiceTurnId(input.interactionId, input.transcript);
  if (!verification || !KNOWN_REASON_CATEGORIES.has(verification.reasonCategory) || verification.reasonCategory === "unresolved") {
    return makeFinding(input, {
      eligibility: "indeterminate",
      value: null,
      sourceObservation: escalationRequested ? { origin: "voiceforce_api", raw: input.escalationTrigger } : null,
      evidenceRefs: [],
      validationStatus: "unresolved",
      confidence: verification?.confidence ?? null,
      evaluationMethod: "verification_llm",
      evaluatorVersion: "targeted-verification-v1",
      note: verification ? "verifier returned an unrecognized or unresolved category" : "verifier call failed or returned no result"
    });
  }
  const validIndices = verification.evidenceTurnIndices.filter((i) => i >= 0 && i < turnIds.length);
  if (validIndices.length === 0) {
    return makeFinding(input, {
      eligibility: "indeterminate",
      value: null,
      sourceObservation: escalationRequested ? { origin: "voiceforce_api", raw: input.escalationTrigger } : null,
      evidenceRefs: [],
      validationStatus: "unresolved",
      confidence: verification.confidence,
      evaluationMethod: "verification_llm",
      evaluatorVersion: "targeted-verification-v1",
      note: "verifier cited no valid transcript turns for its finding \u2014 rejected rather than trusted blindly"
    });
  }
  const contradicted = escalationRequested && !escalationExecuted;
  return makeFinding(input, {
    eligibility: "eligible",
    value: verification.reasonCategory,
    sourceObservation: { origin: "derived", raw: verification },
    evidenceRefs: validIndices.map((i) => turnIds[i]),
    validationStatus: contradicted ? "contradicted" : "validated",
    confidence: verification.confidence,
    evaluationMethod: "verification_llm",
    evaluatorVersion: "targeted-verification-v1",
    note: contradicted ? "resolved via transcript despite escalation_trigger/outcome disagreement \u2014 recorded as contradicted, not silently merged" : null
  });
}

// src/server/cma/cmaTranscriptEvidenceCache.ts
var CMA_TRANSCRIPT_CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
function computeTranscriptContentHash(turns) {
  const normalized = JSON.stringify(turns.map((t) => [t.timestamp, t.speaker, t.text]));
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function isCacheFresh(fetchedAt, now, ttlMs = CMA_TRANSCRIPT_CACHE_TTL_MS) {
  return now.getTime() - new Date(fetchedAt).getTime() < ttlMs;
}
async function getOrFetchTranscriptEvidence(interactionId, interactionType, deps, now = /* @__PURE__ */ new Date(), ttlMs = CMA_TRANSCRIPT_CACHE_TTL_MS) {
  const cached = await deps.readCache(interactionId, interactionType);
  if (cached && isCacheFresh(cached.fetchedAt, now, ttlMs)) {
    return { turns: cached.turns, fetchStatus: cached.fetchStatus, fromCache: true, contentHash: cached.contentHash };
  }
  let turns = [];
  let fetchStatus;
  try {
    turns = await deps.fetchLive(interactionId, interactionType);
    fetchStatus = turns.length === 0 ? "incomplete" : "available";
  } catch {
    turns = [];
    fetchStatus = "unavailable";
  }
  const contentHash = computeTranscriptContentHash(turns);
  await deps.writeCache({ interactionId, interactionType, source: "voiceforce_api", contentHash, turns, turnCount: turns.length, fetchStatus });
  return { turns, fetchStatus, fromCache: false, contentHash };
}

// src/server/cma/cmaEvidenceOrchestrator.ts
function escalationReasonNeedsTranscript(row) {
  const escalationExecuted = row.outcome === "escalated";
  const escalationRequested = Boolean(row.escalationTrigger && row.escalationTrigger.trim().length > 0);
  const eligible = escalationExecuted || escalationRequested;
  const isCleanFastPath = escalationRequested && escalationExecuted;
  return eligible && !isCleanFastPath;
}
async function evaluateAndPersistEscalationReason(row, deps) {
  const needsTranscript = escalationReasonNeedsTranscript(row);
  let transcript;
  let fullTurns = [];
  let transcriptFetchAttempted = false;
  if (needsTranscript) {
    transcriptFetchAttempted = true;
    const evidence = await getOrFetchTranscriptEvidence(row.interactionId, "call", deps.transcriptDeps);
    if (evidence.fetchStatus === "available" && evidence.turns.length > 0) {
      fullTurns = evidence.turns;
      transcript = evidence.turns.map((t) => ({ timestamp: t.timestamp, speaker: t.speaker }));
    }
  }
  const verify = async (interactionId) => deps.askLlm(interactionId, row.outcome, row.escalationTrigger, fullTurns);
  const priorActive = await deps.getActiveEvidence(row.interactionId, "call", ESCALATION_REASON_FACT_ID);
  const finding = await evaluateEscalationReasonEvidence(
    {
      interactionId: row.interactionId,
      outcome: row.outcome,
      escalationTrigger: row.escalationTrigger,
      transcript,
      priorEvaluationId: priorActive?.id
    },
    verify
  );
  const { id, supersededId } = await deps.persist(finding);
  return { finding, persistedId: id, supersededId, transcriptFetchAttempted };
}
function makeSupabaseEvidencePersister(supabase) {
  return async (finding) => {
    const { data, error } = await supabase.rpc("call_center_cma_evidence_upsert", {
      p_interaction_id: finding.interactionId,
      p_interaction_type: finding.interactionType,
      p_fact_id: finding.factId,
      p_eligibility: finding.eligibility,
      p_value: finding.value,
      p_source_origin: finding.sourceObservation?.origin ?? null,
      p_source_raw: finding.sourceObservation?.raw ?? null,
      p_evidence_refs: finding.evidenceRefs,
      p_validation_status: finding.validationStatus,
      p_confidence: finding.confidence,
      p_evaluation_method: finding.evaluationMethod,
      p_evaluator_version: finding.evaluatorVersion,
      p_note: finding.note
    });
    if (error) throw new Error(`call_center_cma_evidence_upsert failed: ${error.message}`);
    const row = data?.[0];
    if (!row) throw new Error("call_center_cma_evidence_upsert returned no row");
    return { id: row.id, supersededId: row.superseded_id };
  };
}
function makeSupabaseActiveEvidenceFetcher(supabase) {
  return async (interactionId, interactionType, factId) => {
    const { data, error } = await supabase.rpc("call_center_cma_evidence_get_active", {
      p_interaction_id: interactionId,
      p_interaction_type: interactionType,
      p_fact_id: factId
    });
    if (error) throw new Error(`call_center_cma_evidence_get_active failed: ${error.message}`);
    const rows = data ?? [];
    return rows.length > 0 ? { id: rows[0].id } : null;
  };
}
export {
  escalationReasonNeedsTranscript,
  evaluateAndPersistEscalationReason,
  makeSupabaseActiveEvidenceFetcher,
  makeSupabaseEvidencePersister
};
