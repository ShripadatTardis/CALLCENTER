// src/server/campaigns/inputMapping.ts
function validateInputMapping(contract, mappings) {
  const mappedCodes = new Set(mappings.map((m) => m.agentInputFieldCode));
  const missingRequiredFieldCodes = contract.expectedInputFields.filter((f) => f.required && !mappedCodes.has(f.fieldCode)).map((f) => f.fieldCode);
  return { valid: missingRequiredFieldCodes.length === 0, missingRequiredFieldCodes };
}
function validateMappingSourceUniqueness(mappings) {
  const counts = /* @__PURE__ */ new Map();
  for (const m of mappings) {
    if (!m.sourceField) continue;
    const key = `${m.sourceType}:${m.sourceField}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicateSourceKeys = Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key);
  return { valid: duplicateSourceKeys.length === 0, duplicateSourceKeys };
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
export {
  resolveMappedInputValues,
  validateInputMapping,
  validateMappingSourceUniqueness
};
