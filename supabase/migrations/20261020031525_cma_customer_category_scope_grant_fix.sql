-- Session 8.1 — corrective fix applied immediately after 20261114000000.
--
-- That migration's `revoke all on function ... from public` alone was insufficient: this
-- project's default privileges on schema public auto-grant EXECUTE on every newly created
-- function to anon/authenticated, which a bare "from public" revoke does not remove
-- (anon/authenticated are specific roles, not the PUBLIC pseudo-role). Verified live against
-- the deployed project immediately after applying 20261114000000 — the new function had
-- picked up EXECUTE grants for anon and authenticated that no other CMA evaluate RPC carries.
-- Matches the established convention in cma_evaluation_engine.sql, which explicitly revokes
-- "from public, anon, authenticated" for every CMA evaluate RPC it creates.
--
-- This migration is idempotent and safe to apply standalone (e.g. against a fresh database
-- that already has 20261114000000 applied via the corrected file).

revoke all on function public.call_center_cma_evaluate_customer_measure(text, boolean, text[]) from public, anon, authenticated;
grant execute on function public.call_center_cma_evaluate_customer_measure(text, boolean, text[]) to service_role;
