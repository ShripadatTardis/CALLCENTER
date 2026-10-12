-- Session 16.2 follow-up: 20261018000000_manual_qa_analysis.sql used `create or replace function
-- call_center_qa_findings_list(...)` with a different (extended) parameter list than the original
-- 16.1 3-arg signature. Postgres treats a different parameter list as a NEW overload, not a
-- replacement, so the stale 3-arg version kept coexisting alongside the new 7-arg version and
-- made every 3-arg call ambiguous ("function is not unique"). This was fixed live against the
-- database at the time via a direct `drop function`; this migration captures that same drop so
-- migration history matches the live schema.
drop function if exists public.call_center_qa_findings_list(text[], boolean, integer);
