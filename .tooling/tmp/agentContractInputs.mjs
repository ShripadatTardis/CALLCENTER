// src/lib/agentContractInputs.ts
function isFieldSatisfied(field, value) {
  if (!field.required) return true;
  if (value === void 0 || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}
function validateAgentContractInputs(contract, values) {
  const fields = contract?.expectedInputFields ?? [];
  const missingRequiredFieldCodes = fields.filter((f) => !isFieldSatisfied(f, values[f.fieldCode])).map((f) => f.fieldCode);
  return { isValid: missingRequiredFieldCodes.length === 0, missingRequiredFieldCodes };
}
function buildDeclaredAgentInputs(contract, values) {
  const declaredFieldCodes = new Set((contract?.expectedInputFields ?? []).map((f) => f.fieldCode));
  if (declaredFieldCodes.size === 0) return void 0;
  const out = {};
  let hasAny = false;
  for (const [code, value] of Object.entries(values)) {
    if (!declaredFieldCodes.has(code)) continue;
    if (value === void 0 || value === null || value === "") continue;
    out[code] = value;
    hasAny = true;
  }
  return hasAny ? out : void 0;
}
function coerceInputValue(field, raw) {
  if (raw === "") return "";
  switch (field.dataType) {
    case "integer": {
      const n = Number(raw);
      return Number.isInteger(n) ? n : raw;
    }
    case "decimal": {
      const n = Number(raw);
      return Number.isFinite(n) ? n : raw;
    }
    case "boolean":
      return raw === "true";
    default:
      return raw;
  }
}
function resetInputsForNewContract() {
  return {};
}
export {
  buildDeclaredAgentInputs,
  coerceInputValue,
  isFieldSatisfied,
  resetInputsForNewContract,
  validateAgentContractInputs
};
