// src/lib/campaignActualOutcome.ts
function classifyActualOutcome(contract, actualOutcomeCode, actualOutcomeName) {
  if (!actualOutcomeCode) {
    return { availability: "unavailable", code: null, displayName: null, definition: null };
  }
  const definition = contract?.expectedOutcomes.find((o) => o.outcomeCode === actualOutcomeCode) ?? null;
  if (!definition) {
    return { availability: "unrecognized", code: actualOutcomeCode, displayName: actualOutcomeName ?? null, definition: null };
  }
  return { availability: "known", code: actualOutcomeCode, displayName: actualOutcomeName ?? definition.displayName, definition };
}
function fallbackDisplayName(fieldCode) {
  const spaced = fieldCode.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
function classifyStructuredOutputs(contract, structuredOutputs) {
  if (!structuredOutputs) return [];
  const declared = contract?.outputFields ?? [];
  const remainingKeys = new Set(Object.keys(structuredOutputs));
  const result = [];
  for (const field of declared) {
    if (!remainingKeys.has(field.fieldCode)) continue;
    result.push({
      fieldCode: field.fieldCode,
      displayName: field.displayName,
      value: structuredOutputs[field.fieldCode],
      known: true,
      definition: field
    });
    remainingKeys.delete(field.fieldCode);
  }
  for (const fieldCode of remainingKeys) {
    result.push({
      fieldCode,
      displayName: fallbackDisplayName(fieldCode),
      value: structuredOutputs[fieldCode],
      known: false,
      definition: null
    });
  }
  return result;
}
function formatOutputValue(value) {
  if (value === null || value === void 0) return "\u2014";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}
export {
  classifyActualOutcome,
  classifyStructuredOutputs,
  formatOutputValue
};
