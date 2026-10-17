// src/server/cma/interactionReconciliation.ts
var CALL_DATA_SOURCE = "call-data";
function computeInclusiveDateWindowBounds(dateFrom, dateTo) {
  const startedFrom = `${dateFrom}T00:00:00.000Z`;
  const toExclusive = /* @__PURE__ */ new Date(`${dateTo}T00:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return { startedFrom, startedTo: toExclusive.toISOString() };
}
function computeReconciliationDrift(source, startedFrom, startedTo, localTotal, upstreamTotal) {
  const delta = upstreamTotal - localTotal;
  const deltaRatio = upstreamTotal === 0 ? null : delta / upstreamTotal;
  return {
    source,
    startedFrom,
    startedTo,
    localTotal,
    upstreamTotal,
    delta,
    deltaRatio,
    matches: delta === 0
  };
}
export {
  CALL_DATA_SOURCE,
  computeInclusiveDateWindowBounds,
  computeReconciliationDrift
};
