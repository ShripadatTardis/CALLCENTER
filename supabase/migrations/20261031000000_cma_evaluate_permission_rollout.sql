-- Session CMA-4A.1 — Resolve the cma.evaluate permission dependency
-- identified in docs/SESSION_CMA_4A_DASHBOARD_INTEGRATION.md.
--
-- CMA-3A granted `cma.evaluate` to `administrator` only. CMA-4A wired 3
-- Dashboard Performance Ratio cards (Resolution Rate, Successful
-- Resolution Time, Authentication Success Rate) to call the CMA
-- evaluation API, gated behind that same permission client-side — so
-- only administrators actually saw CMA-sourced values; every other role
-- kept seeing the (unauthenticated, legacy) ratio engine's numbers for
-- those same 3 cards.
--
-- Per the brief: "Identify which existing roles are authorized to view
-- Dashboard business measures... the smallest necessary permission
-- change... do not grant unrestricted data access." The existing role
-- model already answers "who is authorized to view business measures":
-- `ratios.view` is the permission that gates drilling into Ratio
-- Explorer from a Dashboard ratio card (see `buildDashboardRatioLink`'s
-- `guardedNavigate(..., 'ratios.view', ...)` call in src/pages/Dashboard.tsx)
-- — i.e. it is already the real, existing authorization boundary for
-- "this role may look at measure/ratio data," not merely "this role may
-- see the Dashboard shell" (`dashboard.view`, which all 6 roles hold).
--
-- Confirmed directly against production before writing this migration:
--   role_permissions WHERE permission_key = 'ratios.view' =
--     administrator, analyst, read_only, supervisor   (4 roles)
--   role_permissions WHERE permission_key = 'dashboard.view' =
--     administrator, analyst, operator, qa_reviewer, read_only, supervisor (6 roles)
--
-- So `operator` and `qa_reviewer` see the Dashboard shell but are NOT
-- among the roles the existing model already treats as authorized
-- ratio/measure viewers — granting them `cma.evaluate` here would be a
-- widening of real authorization, not "the measures already visible to
-- them" in the permission model's own terms (the fact that today's
-- unauthenticated legacy ratio engine happens to leak values to them
-- anyway is a separate, pre-existing, undocumented-here gap — not a
-- justification to also hand them a governed, scope-enforcing
-- permission they were never actually granted).
--
-- This migration therefore grants `cma.evaluate` to exactly the 3 roles
-- that hold `ratios.view` but not yet `cma.evaluate`: analyst,
-- read_only, supervisor. `administrator` already has it (CMA-3A, no
-- change). No new role is created. No Business Data Scope assignment
-- (role_agent_scope / role_customer_category_scope) is touched — every
-- one of these roles keeps exactly the Agent/Customer Scope it already
-- has; this migration only lets them evaluate CMA measures within
-- whatever scope they already carry, the same way `ratios.view` already
-- lets them view ratios within that same scope today.

insert into call_center.role_permissions (role_code, permission_key)
select r.role_code, 'cma.evaluate'
from (values ('analyst'), ('read_only'), ('supervisor')) as r(role_code)
where exists (select 1 from call_center.permissions where key = 'cma.evaluate')
on conflict do nothing;
