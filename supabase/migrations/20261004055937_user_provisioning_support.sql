-- Session 14.2 — User Provisioning & Permission Enforcement E2E.
--
-- Adds the two SQL-side pieces provisioning needs: a reliable "does a
-- Call Centre profile already exist for this email" lookup (used before
-- ever calling the Supabase Auth Admin API, so we never send a
-- misleading "invited" response for someone who's already a member),
-- and one atomic provision function that upserts the profile AND
-- assigns the role in a single transaction — the Node/BFF layer still
-- calls the Auth Admin API first (that part can't be done in SQL), but
-- everything on the call_center side happens atomically here, and the
-- upsert is naturally idempotent so a retried provisioning request
-- after a partial failure never creates a duplicate profile or a
-- duplicate role assignment.
--
-- Applied to the live AuditAI project (dtbaczafdzgctkbqviod) via the
-- Supabase MCP; this file mirrors that applied migration for repo history.

create or replace function public.call_center_users_find_by_email(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = call_center, pg_temp
as $$
declare v_profile call_center.user_profiles;
begin
  select * into v_profile from call_center.user_profiles where lower(email) = lower(p_email) limit 1;
  if v_profile is null then
    return null;
  end if;
  return public.call_center_users_get_detail(v_profile.id);
end;
$$;

create or replace function public.call_center_users_provision(
  p_identity_provider text,
  p_identity_subject text,
  p_email text,
  p_display_name text,
  p_role_code text,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = call_center, pg_temp
as $$
declare v_profile_id uuid;
begin
  if not exists (select 1 from call_center.roles where code = p_role_code) then
    raise exception 'unknown_role_code: %', p_role_code;
  end if;

  insert into call_center.user_profiles (identity_provider, identity_subject, email, display_name, status)
  values (p_identity_provider, p_identity_subject, p_email, p_display_name, 'active')
  on conflict (identity_provider, identity_subject)
  do update set email = excluded.email, display_name = coalesce(excluded.display_name, call_center.user_profiles.display_name)
  returning id into v_profile_id;

  insert into call_center.user_roles (user_id, role_code, assigned_by)
  values (v_profile_id, p_role_code, p_actor_user_id)
  on conflict (user_id, role_code) do nothing;

  perform call_center.audit_events_insert_helper(
    'user', p_actor_user_id, 'user.provisioned', 'user', v_profile_id::text, 'success',
    jsonb_build_object('email', p_email, 'role_code', p_role_code)
  );

  return public.call_center_users_get_detail(v_profile_id);
end;
$$;

revoke all on function public.call_center_users_find_by_email(text) from public, anon, authenticated;
revoke all on function public.call_center_users_provision(text, text, text, text, text, uuid) from public, anon, authenticated;

grant execute on function public.call_center_users_find_by_email(text) to service_role;
grant execute on function public.call_center_users_provision(text, text, text, text, text, uuid) to service_role;
