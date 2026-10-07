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
export {
  computeVoiceTurnId
};
