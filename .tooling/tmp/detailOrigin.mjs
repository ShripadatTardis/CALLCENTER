// src/lib/detailOrigin.ts
var ORIGIN_DESTINATIONS = {
  dashboard: { path: "/dashboard", label: "Dashboard" },
  "ai-agents": { path: "/ai-agents", label: "AI Agents" },
  "live-view": { path: "/live-view", label: "Live View" },
  customers: { path: "/customers", label: "Customers" },
  "outbound-campaigns": { path: "/outbound-campaigns", label: "Campaigns" },
  "chat-logs": { path: "/chat-logs", label: "Chat Logs" }
};
var AGENT_DETAIL_FALLBACK_ORIGIN = "ai-agents";
function resolveDetailOrigin(origin, fallback = AGENT_DETAIL_FALLBACK_ORIGIN) {
  if (typeof origin === "string" && Object.prototype.hasOwnProperty.call(ORIGIN_DESTINATIONS, origin)) {
    return ORIGIN_DESTINATIONS[origin];
  }
  return ORIGIN_DESTINATIONS[fallback];
}
export {
  AGENT_DETAIL_FALLBACK_ORIGIN,
  resolveDetailOrigin
};
