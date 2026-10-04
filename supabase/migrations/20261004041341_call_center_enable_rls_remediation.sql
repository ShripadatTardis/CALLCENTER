-- Session 14.1 — pre-existing RLS gap remediation, discovered via Supabase's
-- own security advisor while preparing the User Management/RBAC/Audit
-- foundation migration. Unrelated to RBAC itself; a standalone fix.
--
-- These 7 call_center tables were created across Sessions 5.2/11.5A/12.6/12.7
-- without "enable row level security", leaving them exposed to the anon/
-- authenticated Supabase roles. Verified safe to fix with deny-all (no
-- permissive policy), matching the exact convention already used on all 18
-- other call_center tables, because:
--   - The browser's only Supabase client (src/integrations/supabase/client.ts)
--     points at a completely different, unrelated project (the legacy
--     WhatsApp/SMS project) — it has never had network access to this
--     project's call_center schema at all.
--   - Every real call_center read/write goes through this app's own
--     Vercel API routes using a server-only service-role key
--     (CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY, used only under src/server/**),
--     which bypasses RLS by Supabase design regardless of policies.
--   - No other application on this shared Supabase project reads or writes
--     the call_center schema (confirmed) — this change touches nothing
--     outside call_center.
--
-- Applied to the live AuditAI project (dtbaczafdzgctkbqviod) via the
-- Supabase MCP; this file mirrors that applied migration for repo history.

alter table call_center.customer_external_identities enable row level security;
alter table call_center.customer_merge_log enable row level security;
alter table call_center.customer_activities enable row level security;
alter table call_center.campaign_classifications enable row level security;
alter table call_center.campaign_configuration_versions enable row level security;
alter table call_center.campaign_audit_events enable row level security;
alter table call_center.campaign_skip_reasons enable row level security;
