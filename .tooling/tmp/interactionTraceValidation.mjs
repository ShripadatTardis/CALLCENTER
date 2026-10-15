// src/lib/interactionTraceValidation.ts
var INTERACTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
function isValidInteractionId(id) {
  return INTERACTION_ID_PATTERN.test(id);
}
export {
  INTERACTION_ID_PATTERN,
  isValidInteractionId
};
