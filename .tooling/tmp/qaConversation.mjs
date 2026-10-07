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

// src/lib/qaConversation.ts
function voiceTurnsFromTranscript(interactionId, entries) {
  const ids = computeVoiceTurnId(interactionId, entries);
  return entries.map((entry, i) => ({
    turnId: ids[i],
    role: entry.speaker === "customer" ? "customer" : "agent",
    speakerLabel: entry.speaker === "customer" ? "Customer" : entry.speaker === "ai" ? "AI" : "Agent",
    timestamp: entry.timestamp,
    text: entry.text
  }));
}
function chatTurnsFromMessages(messages) {
  return messages.map((m) => ({
    turnId: m.id,
    role: m.role === "user" ? "customer" : "agent",
    speakerLabel: m.role === "user" ? "Customer" : "AI",
    timestamp: m.timestamp,
    text: m.text
  }));
}
var qaReviewableTurns = (turns) => turns.filter((t) => t.role === "agent");
export {
  chatTurnsFromMessages,
  qaReviewableTurns,
  voiceTurnsFromTranscript
};
