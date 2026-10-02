// src/server/campaigns/resultRules.ts
function deriveCampaignResult(callData, rules) {
  const fieldValue = {
    status: callData.status,
    outcome: callData.outcome,
    escalation_trigger: callData.escalation_trigger,
    intent: callData.intent,
    // Session 12.5 §9 — made available as a matchField so an operator
    // CAN configure a campaign_result_rule against the agent-specific
    // actual_outcome_code if they choose to (e.g. treat a specific
    // business outcome as the success signal for that campaign's
    // outcome policy), without this function — or defaultResultRules()
    // below — ever doing so automatically. A campaign with no rule
    // referencing this field behaves byte-for-byte as before.
    actual_outcome_code: callData.actual_outcome_code
  };
  const actualOutcomeCode = callData.actual_outcome_code ?? null;
  const actualOutcomeName = callData.actual_outcome_name ?? null;
  const structuredOutputs = callData.structured_outputs ?? null;
  const active = rules.filter((r) => r.active).sort((a, b) => a.priority - b.priority);
  const match = active.find((rule) => fieldValue[rule.matchField] === rule.matchValue);
  if (!match) {
    return {
      callStatus: callData.status ?? null,
      callOutcome: callData.outcome ?? null,
      intent: callData.intent ?? null,
      resultCode: "unclassified",
      resultLabel: "Unclassified",
      isSuccess: null,
      resultDetail: null,
      resultSource: "rule_match",
      nextAction: null,
      nextActionType: null,
      // Session 9.1 Phase 7 — filled in by the caller (reconcileExecutions.ts)
      // from the campaign's own agent snapshot; this pure function never
      // has campaign context, so it always defaults these to null.
      agentId: null,
      agentName: null,
      structuredOutputs,
      actualOutcomeCode,
      actualOutcomeName
    };
  }
  const nextAction = match.nextActionType && match.nextActionDelayDays != null ? `${match.nextActionType} in ${match.nextActionDelayDays}d` : match.nextActionType ?? null;
  return {
    callStatus: callData.status ?? null,
    callOutcome: callData.outcome ?? null,
    intent: callData.intent ?? null,
    resultCode: match.resultCode,
    resultLabel: match.resultLabel,
    isSuccess: match.isSuccess,
    resultDetail: null,
    resultSource: "rule_match",
    nextAction,
    nextActionType: match.nextActionType,
    agentId: null,
    agentName: null,
    structuredOutputs,
    actualOutcomeCode,
    actualOutcomeName
  };
}

// src/server/campaigns/outcomePolicy.ts
function deriveCampaignClassification(actualOutcomeCode, policy, unresolvedFallbackCode) {
  if (!actualOutcomeCode) {
    return { campaignClassificationCode: null, classificationContractDrift: false, classificationNextActionType: null };
  }
  if (!policy) {
    return { campaignClassificationCode: null, classificationContractDrift: false, classificationNextActionType: null };
  }
  const mapping = policy.mappings.find((m) => m.agentOutcomeCode === actualOutcomeCode);
  if (mapping) {
    return {
      campaignClassificationCode: mapping.campaignClassificationCode,
      classificationContractDrift: false,
      classificationNextActionType: mapping.nextActionType
    };
  }
  return {
    campaignClassificationCode: unresolvedFallbackCode,
    classificationContractDrift: true,
    classificationNextActionType: null
  };
}

// src/server/campaigns/reconcileExecutions.ts
var MIN_AGE_MS = 2 * 60 * 1e3;
var UNRESOLVED_AFTER_MS = 30 * 60 * 1e3;
var CANDIDATE_WINDOW_MS = 10 * 60 * 1e3;
function getCorrelationMode() {
  const raw = process.env.CAMPAIGN_RECONCILIATION_CORRELATION_MODE;
  if (raw === "client_reference" || raw === "call_sid_equals_call_id") return raw;
  return null;
}
async function fetchCallData(query) {
  const baseUrl = process.env.VOICEBOT_BASE_URL;
  const apiKey = process.env.VOICEBOT_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server");
  }
  const search = new URLSearchParams(query).toString();
  const res = await fetch(`${baseUrl}/api/v1/call-data${search ? `?${search}` : ""}`, { headers: { "X-API-Key": apiKey } });
  const text = await res.text();
  const body = text ? JSON.parse(text) : void 0;
  if (!res.ok) {
    throw new Error(`call-data request failed: ${res.status} ${typeof body === "object" ? JSON.stringify(body) : text}`);
  }
  return body;
}
async function tryAuthoritativeMatch(execution, mode) {
  if (!mode || !execution.callSid) return null;
  if (mode === "call_sid_equals_call_id") {
    if (!execution.triggeredAt) return null;
    const triggeredAt = new Date(execution.triggeredAt).getTime();
    const dateFrom = new Date(triggeredAt - CANDIDATE_WINDOW_MS).toISOString().slice(0, 10);
    const dateTo = new Date(triggeredAt + CANDIDATE_WINDOW_MS).toISOString().slice(0, 10);
    const dto = await fetchCallData({ date_from: dateFrom, date_to: dateTo, page_size: "25" });
    return dto.data.calls.find((c) => c.call_id === execution.callSid) ?? null;
  }
  return null;
}
async function findDiagnosticCandidate(execution) {
  const phoneNumber = execution.contactRawValue;
  if (!execution.triggeredAt) return null;
  const triggeredAt = new Date(execution.triggeredAt).getTime();
  const dateFrom = new Date(triggeredAt - CANDIDATE_WINDOW_MS).toISOString().slice(0, 10);
  const dateTo = new Date(triggeredAt + CANDIDATE_WINDOW_MS).toISOString().slice(0, 10);
  try {
    const dto = await fetchCallData({ search: phoneNumber, date_from: dateFrom, date_to: dateTo, page_size: "5" });
    return dto.data.calls[0] ?? null;
  } catch {
    return null;
  }
}
async function getUnresolvedFallbackCode(repo) {
  const classifications = await repo.listClassifications();
  return classifications.find((c) => c.isFallbackUnresolved)?.code ?? null;
}
function makeGoverningConfigResolver(repo) {
  const campaignByCampaign = /* @__PURE__ */ new Map();
  const configByVersion = /* @__PURE__ */ new Map();
  async function getCampaignInfo(campaignId) {
    const cached = campaignByCampaign.get(campaignId);
    if (cached) return cached;
    const campaign = await repo.getCampaign(campaignId);
    const entry = {
      rules: campaign?.rules ?? [],
      agentId: campaign?.agentId ?? null,
      agentName: campaign?.agentName ?? null,
      outcomePolicySnapshot: campaign?.outcomePolicySnapshot ?? null
    };
    campaignByCampaign.set(campaignId, entry);
    return entry;
  }
  return async function resolve(campaignId, configurationVersionId) {
    const liveCampaign = await getCampaignInfo(campaignId);
    if (!configurationVersionId) return liveCampaign;
    const cached = configByVersion.get(configurationVersionId);
    if (cached) return cached;
    const version = await repo.getConfigurationVersion(configurationVersionId);
    const entry = version ? {
      rules: liveCampaign.rules,
      agentId: version.agentId,
      agentName: version.agentName,
      outcomePolicySnapshot: version.outcomePolicySnapshot
    } : liveCampaign;
    configByVersion.set(configurationVersionId, entry);
    return entry;
  };
}
async function reconcilePendingExecutions(repo, limit = 25) {
  const mode = getCorrelationMode();
  const pending = await repo.listPendingReconciliations(limit);
  const now = Date.now();
  const unresolvedFallbackCode = await getUnresolvedFallbackCode(repo);
  const resolveGoverningConfig = makeGoverningConfigResolver(repo);
  let reconciled = 0;
  let unresolved = 0;
  let stillPending = 0;
  let errors = 0;
  for (const execution of pending) {
    const triggeredAt = execution.triggeredAt ? new Date(execution.triggeredAt).getTime() : now;
    if (now - triggeredAt < MIN_AGE_MS) {
      stillPending++;
      continue;
    }
    try {
      const match = await tryAuthoritativeMatch(execution, mode);
      const candidateEntry = await findDiagnosticCandidate(execution);
      const candidate = candidateEntry ? { callId: candidateEntry.call_id, startTime: candidateEntry.start_time, phone: candidateEntry.caller_number } : null;
      if (match) {
        const { rules, agentId, agentName, outcomePolicySnapshot } = await resolveGoverningConfig(
          execution.campaignId,
          execution.configurationVersionId
        );
        const derivedBase = deriveCampaignResult(match, rules);
        const classification = deriveCampaignClassification(match.actual_outcome_code ?? null, outcomePolicySnapshot, unresolvedFallbackCode);
        const derived = { ...derivedBase, agentId, agentName, ...classification };
        await repo.updateReconciliationStatus(execution.id, "reconciled", match.call_id, candidate, (/* @__PURE__ */ new Date()).toISOString(), derived);
        reconciled++;
        continue;
      }
      if (now - triggeredAt >= UNRESOLVED_AFTER_MS) {
        await repo.updateReconciliationStatus(execution.id, "unresolved", null, candidate, (/* @__PURE__ */ new Date()).toISOString(), null);
        unresolved++;
      } else {
        if (candidate) {
          await repo.updateReconciliationStatus(execution.id, "pending", null, candidate, (/* @__PURE__ */ new Date()).toISOString(), null);
        }
        stillPending++;
      }
    } catch (err) {
      await repo.updateReconciliationStatus(
        execution.id,
        "error",
        null,
        null,
        (/* @__PURE__ */ new Date()).toISOString(),
        null
      ).catch(() => void 0);
      errors++;
    }
  }
  return { processed: pending.length, reconciled, unresolved, stillPending, errors };
}
async function enrichReconciledExecutionsWithActualOutcome(repo, limit = 25) {
  const mode = getCorrelationMode();
  const candidates = await repo.listReconciledMissingActualOutcome(limit);
  const unresolvedFallbackCode = await getUnresolvedFallbackCode(repo);
  const resolveGoverningConfig = makeGoverningConfigResolver(repo);
  let enriched = 0;
  let noActualOutcomeYet = 0;
  let skipped = 0;
  let errors = 0;
  for (const execution of candidates) {
    try {
      const match = await tryAuthoritativeMatch(execution, mode);
      if (!match || !match.actual_outcome_code) {
        noActualOutcomeYet++;
        continue;
      }
      const { outcomePolicySnapshot } = await resolveGoverningConfig(execution.campaignId, execution.configurationVersionId);
      const classification = deriveCampaignClassification(match.actual_outcome_code, outcomePolicySnapshot, unresolvedFallbackCode);
      const outcome = await repo.enrichActualOutcome(
        execution.id,
        match.actual_outcome_code,
        match.actual_outcome_name ?? null,
        match.structured_outputs ?? null,
        (/* @__PURE__ */ new Date()).toISOString(),
        classification
      );
      if (outcome.enriched) {
        enriched++;
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
    }
  }
  return { processed: candidates.length, enriched, noActualOutcomeYet, skipped, errors };
}
export {
  enrichReconciledExecutionsWithActualOutcome,
  makeGoverningConfigResolver,
  reconcilePendingExecutions
};
