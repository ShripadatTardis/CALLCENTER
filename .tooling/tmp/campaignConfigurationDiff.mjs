// src/lib/campaignConfigurationDiff.ts
function selectCurrentVersionMappings(allMappings, currentVersionId) {
  return allMappings.filter((m) => m.configurationVersionId === currentVersionId);
}
function buildConfigurationVersionViews(versions, allMappings, current) {
  if (versions.length === 0) {
    return [
      {
        id: "current",
        versionNumber: 1,
        status: "active",
        agentId: current.agentId,
        agentName: current.agentName,
        agentContractSnapshot: current.agentContractSnapshot,
        outcomePolicySnapshot: current.outcomePolicySnapshot,
        mappings: selectCurrentVersionMappings(allMappings, null),
        createdAt: current.createdAt,
        createdBy: current.createdBy,
        changeReason: null,
        isSynthetic: true
      }
    ];
  }
  return [...versions].sort((a, b) => b.versionNumber - a.versionNumber).map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    status: v.status,
    agentId: v.agentId,
    agentName: v.agentName,
    agentContractSnapshot: v.agentContractSnapshot,
    outcomePolicySnapshot: v.outcomePolicySnapshot,
    mappings: selectCurrentVersionMappings(allMappings, v.id),
    createdAt: v.createdAt,
    createdBy: v.createdBy,
    changeReason: v.changeReason,
    isSynthetic: false
  }));
}
function contractSignature(contract) {
  if (!contract) return "none";
  const inputs = contract.expectedInputFields.map((f) => `${f.fieldCode}:${f.dataType ?? ""}:${f.required}`).sort();
  const outcomes = contract.expectedOutcomes.map((o) => o.outcomeCode).sort();
  const outputs = contract.outputFields.map((f) => `${f.fieldCode}:${f.dataType ?? ""}`).sort();
  return JSON.stringify({ inputs, outcomes, outputs });
}
function mappingKey(m) {
  return `${m.sourceType}:${m.sourceField}`;
}
function diffConfigurationVersions(prev, curr) {
  if (!prev) return [];
  const entries = [];
  if (prev.agentId !== curr.agentId) {
    entries.push({
      area: "agent",
      description: `Agent changed: ${prev.agentName ?? prev.agentId} \u2192 ${curr.agentName ?? curr.agentId}`
    });
  }
  if (contractSignature(prev.agentContractSnapshot) !== contractSignature(curr.agentContractSnapshot)) {
    const p = prev.agentContractSnapshot;
    const c = curr.agentContractSnapshot;
    entries.push({
      area: "contract",
      description: `Agent Contract changed (inputs ${p?.expectedInputFields.length ?? 0}\u2192${c?.expectedInputFields.length ?? 0}, outcomes ${p?.expectedOutcomes.length ?? 0}\u2192${c?.expectedOutcomes.length ?? 0}, outputs ${p?.outputFields.length ?? 0}\u2192${c?.outputFields.length ?? 0})`
    });
  }
  const prevByField = new Map(prev.mappings.map((m) => [m.agentInputFieldCode, m]));
  const currByField = new Map(curr.mappings.map((m) => [m.agentInputFieldCode, m]));
  for (const fieldCode of Array.from(/* @__PURE__ */ new Set([...prevByField.keys(), ...currByField.keys()])).sort()) {
    const p = prevByField.get(fieldCode);
    const c = currByField.get(fieldCode);
    if (p && !c) {
      entries.push({ area: "inputMapping", description: `Input Mapping removed: ${fieldCode}` });
    } else if (!p && c) {
      entries.push({ area: "inputMapping", description: `Input Mapping added: ${fieldCode} (${mappingKey(c)})` });
    } else if (p && c && mappingKey(p) !== mappingKey(c)) {
      entries.push({ area: "inputMapping", description: `Input Mapping changed: ${fieldCode} (${mappingKey(p)} \u2192 ${mappingKey(c)})` });
    }
  }
  const prevByOutcome = new Map((prev.outcomePolicySnapshot?.mappings ?? []).map((m) => [m.agentOutcomeCode, m]));
  const currByOutcome = new Map((curr.outcomePolicySnapshot?.mappings ?? []).map((m) => [m.agentOutcomeCode, m]));
  for (const outcomeCode of Array.from(/* @__PURE__ */ new Set([...prevByOutcome.keys(), ...currByOutcome.keys()])).sort()) {
    const p = prevByOutcome.get(outcomeCode);
    const c = currByOutcome.get(outcomeCode);
    if (p && !c) {
      entries.push({ area: "outcomeMapping", description: `Outcome Mapping removed: ${outcomeCode}` });
    } else if (!p && c) {
      entries.push({ area: "outcomeMapping", description: `Outcome Mapping added: ${outcomeCode} \u2192 ${c.campaignClassificationCode}` });
    } else if (p && c && p.campaignClassificationCode !== c.campaignClassificationCode) {
      entries.push({
        area: "outcomeMapping",
        description: `Outcome Mapping changed: ${outcomeCode} (${p.campaignClassificationCode} \u2192 ${c.campaignClassificationCode})`
      });
    }
  }
  return entries;
}
export {
  buildConfigurationVersionViews,
  diffConfigurationVersions,
  selectCurrentVersionMappings
};
