-- Session 14.2 — call_center_users_list now also returns identity_subject
-- (server-side use only, to derive a genuine pending/confirmed status via
-- the Supabase Auth Admin API — never exposed raw to the client; the BFF
-- strips it before responding).
--
-- Applied to the live AuditAI project (dtbaczafdzgctkbqviod) via the
-- Supabase MCP; this file mirrors that applied migration for repo history.

create or replace function public.call_center_users_list()
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_rows jsonb;
begin
  select coalesce(jsonb_agg(row_data order by (row_data->>'createdAt')), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'id', p.id, 'email', p.email, 'displayName', p.display_name, 'status', p.status,
      'createdAt', p.created_at, 'identitySubject', p.identity_subject,
      'roles', (select coalesce(jsonb_agg(ur.role_code), '[]'::jsonb) from call_center.user_roles ur where ur.user_id = p.id)
    ) as row_data
    from call_center.user_profiles p
  ) t;
  return v_rows;
end;
$$;
