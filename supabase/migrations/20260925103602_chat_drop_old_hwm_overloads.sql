-- Historical reconstruction (Session 11.9E) — repository migration
-- history repair, not a new change. This migration was already applied
-- to production (schema_migrations version 20260925103602, name
-- "chat_enhancement_5_1_drop_old_hwm_overloads") but had no
-- corresponding file in this repository, discovered during the Session
-- 11.9D migration-readiness audit.
--
-- chat_enhancement_5_1.sql (20260927000000 in this repo) replaced
-- call_center_get_high_water_mark/call_center_set_high_water_mark with
-- new p_source-parameterized signatures via `create or replace
-- function` — but since the original signatures from
-- customer360_foundation.sql (20260924150000) were different
-- (zero-arg / single-timestamptz-arg, no p_source), Postgres created a
-- SECOND overload rather than replacing the first. This migration
-- drops the original, now-obsolete overloads, matching what
-- Session 11.9D verified is the current live state (exactly one
-- overload of each function, confirmed via pg_get_function_arguments).
--
-- Verified against production before writing this file — production
-- has ONLY the p_source-parameterized overloads. `drop function if
-- exists` is intentionally used so this is a safe no-op if applied
-- again, or if the original overloads are somehow already gone.

drop function if exists public.call_center_get_high_water_mark();
drop function if exists public.call_center_set_high_water_mark(timestamptz);
