// src/server/campaigns/inputMapping.ts
function validateInputMapping(contract, mappings) {
  const mappedCodes = new Set(mappings.map((m) => m.agentInputFieldCode));
  const missingRequiredFieldCodes = contract.expectedInputFields.filter((f) => f.required && !mappedCodes.has(f.fieldCode)).map((f) => f.fieldCode);
  return { valid: missingRequiredFieldCodes.length === 0, missingRequiredFieldCodes };
}
function resolveMappedInputValues(mappings, sources) {
  const values = {};
  const unresolvedRequiredFieldCodes = [];
  for (const mapping of mappings) {
    const sourceBag = mapping.sourceType === "customer360" ? sources.customer360Fields : mapping.sourceType === "csv" ? sources.csvFields : sources.campaignFields;
    const value = sourceBag[mapping.sourceField];
    if (value === void 0 || value === null || value === "") {
      if (mapping.required) unresolvedRequiredFieldCodes.push(mapping.agentInputFieldCode);
      continue;
    }
    values[mapping.agentInputFieldCode] = value;
  }
  return { values, unresolvedRequiredFieldCodes };
}

// src/server/campaigns/triggerCallPayload.ts
function buildTriggerCallPayload(target, contract, mappings) {
  const { values, unresolvedRequiredFieldCodes: unresolvedMapped } = resolveMappedInputValues(mappings, {
    customer360Fields: { phone_number: target.contactRawValue, customer_id: target.sourceCustomerRef ?? void 0 },
    csvFields: target.sourceAttributes ?? {},
    campaignFields: {}
  });
  const missingMapping = contract ? validateInputMapping(contract, mappings).missingRequiredFieldCodes : [];
  const unresolvedRequiredFieldCodes = Array.from(/* @__PURE__ */ new Set([...missingMapping, ...unresolvedMapped]));
  const request = {
    to_phone_number: target.contactRawValue,
    agent_id: target.campaignAgentId,
    // Never fabricated — only populated when Customer 360 already has a
    // sourceCustomerRef for this customer (unchanged from the original
    // Session 5 behavior).
    customer_id: target.sourceCustomerRef ?? void 0
  };
  const declaredFieldCodes = new Set((contract?.expectedInputFields ?? []).map((f) => f.fieldCode));
  if (declaredFieldCodes.size > 0) {
    const agentInputs = {};
    let hasAny = false;
    for (const [code, value] of Object.entries(values)) {
      if (!declaredFieldCodes.has(code)) continue;
      agentInputs[code] = value;
      hasAny = true;
    }
    if (hasAny) request.agent_inputs = agentInputs;
  }
  return { request, resolvedInputValues: values, unresolvedRequiredFieldCodes };
}

// src/server/campaigns/campaignRunner.ts
function classifyTriggerCallFailure(status, body, text) {
  const bodyStr = typeof body === "object" ? JSON.stringify(body) : text;
  if (status === 409) {
    const code = typeof body === "object" && body !== null ? body.error : void 0;
    if (code === "idempotency_key_conflict") {
      return `Trigger Call idempotency conflict: the same Idempotency-Key was reused with a different request body \u2014 no call was placed. ${bodyStr}`;
    }
    if (code === "request_in_progress") {
      return `Trigger Call idempotency conflict: a request with this Idempotency-Key is already in progress \u2014 no additional call was placed. ${bodyStr}`;
    }
    return `Trigger Call idempotency conflict (409): ${bodyStr}`;
  }
  if (status === 503) {
    return `Trigger Call failed: 503 (Voice Gateway unavailable \u2014 nothing was dialled, safe to retry via retryTarget) ${bodyStr}`;
  }
  return `Trigger Call failed: ${status} ${bodyStr}`;
}
var voiceAgentCallBackend = {
  async triggerCall(payload, idempotencyKey) {
    const baseUrl = process.env.VOICEBOT_BASE_URL;
    const apiKey = process.env.VOICEBOT_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new Error("VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server");
    }
    const res = await fetch(`${baseUrl}/api/v1/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey, "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : void 0;
    if (!res.ok) {
      throw new Error(classifyTriggerCallFailure(res.status, body, text));
    }
    if (body && typeof body === "object" && "error" in body) {
      throw new Error(`Trigger Call gateway error: ${JSON.stringify(body)}`);
    }
    return body;
  }
};
async function runCampaignBatch(repo, backend, batchSize) {
  const targets = await repo.selectRunnableTargets(batchSize);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const campaignCache = /* @__PURE__ */ new Map();
  async function getCampaignContract(campaignId) {
    const cached = campaignCache.get(campaignId);
    if (cached) return cached;
    const campaign = await repo.getCampaign(campaignId);
    const entry = { contract: campaign?.agentContractSnapshot ?? null, mappings: campaign?.mappings ?? [] };
    campaignCache.set(campaignId, entry);
    return entry;
  }
  let triggered = 0;
  let failed = 0;
  for (const target of targets) {
    const { contract, mappings } = await getCampaignContract(target.campaignId);
    const built = buildTriggerCallPayload(target, contract, mappings);
    const execution = await repo.createExecution(target.id, now, built.request);
    if (built.unresolvedRequiredFieldCodes.length > 0) {
      await repo.markExecutionFailed(
        execution.id,
        `Not dialled \u2014 missing required agent input value(s): ${built.unresolvedRequiredFieldCodes.join(", ")}`
      );
      failed++;
      continue;
    }
    try {
      const result = await backend.triggerCall(built.request, execution.id);
      await repo.markExecutionTriggered(execution.id, result.call_sid, (/* @__PURE__ */ new Date()).toISOString());
      triggered++;
    } catch (err) {
      await repo.markExecutionFailed(execution.id, err instanceof Error ? err.message : "Trigger Call failed");
      failed++;
    }
  }
  return { processed: targets.length, triggered, failed };
}
export {
  runCampaignBatch,
  voiceAgentCallBackend
};
