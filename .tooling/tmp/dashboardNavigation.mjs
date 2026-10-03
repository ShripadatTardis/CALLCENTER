// src/lib/dashboardNavigation.ts
var DASHBOARD_ORIGIN_STATE = { origin: "dashboard" };
function buildDashboardRatioLink(ratioId) {
  return { path: `/ratios/${ratioId}`, state: DASHBOARD_ORIGIN_STATE };
}
function buildDashboardAgentDetailLink(agentId) {
  return { path: `/ai-agents/${agentId}`, state: DASHBOARD_ORIGIN_STATE };
}
function buildDashboardLiveViewLink() {
  return { path: "/live-view", state: DASHBOARD_ORIGIN_STATE };
}
var DASHBOARD_PERFORMANCE_RATIO_IDS = [
  "fcr",
  "escalation_rate",
  "resolution_rate",
  "successful_resolution_time",
  "authentication_success_rate"
];
var DASHBOARD_AHT_RATIO_ID = "aht";
export {
  DASHBOARD_AHT_RATIO_ID,
  DASHBOARD_ORIGIN_STATE,
  DASHBOARD_PERFORMANCE_RATIO_IDS,
  buildDashboardAgentDetailLink,
  buildDashboardLiveViewLink,
  buildDashboardRatioLink
};
