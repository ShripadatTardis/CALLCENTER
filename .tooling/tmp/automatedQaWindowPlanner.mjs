// src/lib/automatedQaWindowPlanner.ts
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
function turnTokenCost(turn) {
  return estimateTokens(`[${turn.turnId}] ${turn.speakerLabel}: ${turn.text}`) + 2;
}
function planQaTurnWindows(turns, transcriptTokenBudget) {
  if (turns.length === 0) return [];
  const windows = [];
  let current = [];
  let currentCost = 0;
  for (const turn of turns) {
    const cost = turnTokenCost(turn);
    if (current.length > 0 && currentCost + cost > transcriptTokenBudget) {
      windows.push({ index: windows.length, turns: current });
      current = [];
      currentCost = 0;
    }
    current.push(turn);
    currentCost += cost;
  }
  if (current.length > 0) {
    windows.push({ index: windows.length, turns: current });
  }
  return windows;
}
export {
  estimateTokens,
  planQaTurnWindows
};
