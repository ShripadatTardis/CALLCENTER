-- Session 9 — backfill fcr on the CMA_POC_500_V1 synthetic voice population.
-- The fixture's customer_id is deliberately null on every row (Session 7.1's
-- own design, confirmed unchanged in Session 8.1's "Deferred" section), so a
-- repeat-contact-aware rule cannot be computed. This mirrors the real/NORMAL
-- population's own observed fcr semantics instead (verified live: in the 761
-- real voice rows, fcr=true iff outcome='resolved', fcr=false for every other
-- outcome, zero exceptions) — a synthetic API-style classification, not an
-- independently verified longitudinal first-contact outcome. Idempotent,
-- deterministic, touches only dataset_id='CMA_POC_500_V1' channel='voice'
-- rows; NORMAL (dataset_id is null) rows are structurally excluded by the
-- where clause and were never touched.
update call_center.customer_interactions
set fcr = case
  when outcome = 'resolved' then true
  when outcome = 'escalated' then false
  else null
end
where dataset_id = 'CMA_POC_500_V1' and channel = 'voice';

-- Reconciliation note (added when this file was written to match the
-- already-applied production migration — the file did not exist locally
-- when the migration was first applied; this is a record-keeping fix, not
-- a re-application): verified live against production on reconciliation —
-- 84 rows outcome='escalated'/fcr=false, 164 rows outcome='resolved'/
-- fcr=true, 102 rows outcome is null/fcr is null, total 350. The real/
-- NORMAL population (dataset_id is null, 761 voice rows) was independently
-- confirmed unchanged by this migration.
