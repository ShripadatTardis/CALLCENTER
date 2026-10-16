-- Session 16.4.4.1 — Automated QA Diagnostics UI, access control (brief §2).
-- Additive only: one new permission row + one grant. No table changes, no
-- RPC changes — the diagnostic read path reuses the existing
-- `call_center_automated_qa_attempts_list` RPC from Session 16.4.4
-- unchanged (still service_role-only; no grant to anon/authenticated is
-- added here or anywhere in this migration).
--
-- NOT applied automatically per this session's brief (§11 "Do not apply
-- migrations automatically") — prepared for review and manual
-- application, same convention the 16.4.4 migration itself used.
--
-- Initial grant is Administrator only (brief §2). Any future role needing
-- this permission is granted through the existing Role Management UI
-- (role_permissions is editable there) — no code change required for
-- that, which is exactly what "allow future explicit grants through the
-- existing permission-management architecture" means.

insert into call_center.permissions (key, label, description, pillar) values
  ('automated_qa.diagnostics.view', 'View Automated QA Diagnostics', 'View raw LLM attempt diagnostics (request/response text, structured validation detail, retry relationships) for Automated QA evaluations, within Business Data Scope. A distinct, narrower permission from qa.automated.view — holding it does not itself grant the diagnostic read path without also being authorized to view the underlying evaluation.', 'Improve')
on conflict (key) do nothing;

insert into call_center.role_permissions (role_code, permission_key) values
  ('administrator', 'automated_qa.diagnostics.view')
on conflict do nothing;
