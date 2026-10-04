-- Session 14.3 — User Detail should show effective data scope, not just
-- effective permissions, so an Administrator can understand WHICH data a
-- user can see, not just WHAT they can do.
--
-- Applied to the live AuditAI project (dtbaczafdzgctkbqviod) via the
-- Supabase MCP; this file mirrors that applied migration for repo history.
create or replace function public.call_center_users_get_detail(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_profile call_center.user_profiles; v_roles jsonb; v_permissions jsonb; v_audit jsonb;
  v_all_agents boolean; v_agent_ids jsonb; v_all_categories boolean; v_category_ids jsonb;
begin
  select * into v_profile from call_center.user_profiles where id = p_user_id;
  if v_profile is null then
    return null;
  end if;

  select coalesce(jsonb_agg(ur.role_code), '[]'::jsonb) into v_roles
    from call_center.user_roles ur where ur.user_id = p_user_id;

  select coalesce(jsonb_agg(distinct rp.permission_key), '[]'::jsonb) into v_permissions
    from call_center.user_roles ur
    join call_center.role_permissions rp on rp.role_code = ur.role_code
    where ur.user_id = p_user_id;

  select coalesce(bool_or(ras.all_agents), false) into v_all_agents
    from call_center.user_roles ur join call_center.role_agent_scope ras on ras.role_code = ur.role_code
    where ur.user_id = p_user_id;
  select coalesce(jsonb_agg(distinct rasi.agent_id), '[]'::jsonb) into v_agent_ids
    from call_center.user_roles ur join call_center.role_agent_scope_items rasi on rasi.role_code = ur.role_code
    where ur.user_id = p_user_id;

  select coalesce(bool_or(rccs.all_categories), false) into v_all_categories
    from call_center.user_roles ur join call_center.role_customer_category_scope rccs on rccs.role_code = ur.role_code
    where ur.user_id = p_user_id;
  select coalesce(jsonb_agg(distinct rccsi.category_id), '[]'::jsonb) into v_category_ids
    from call_center.user_roles ur join call_center.role_customer_category_scope_items rccsi on rccsi.role_code = ur.role_code
    where ur.user_id = p_user_id;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.occurred_at desc), '[]'::jsonb) into v_audit
  from (
    select id, occurred_at, actor_type, actor_user_id, action, resource_type, resource_id, result
    from call_center.audit_events
    where actor_user_id = p_user_id or (resource_type = 'user' and resource_id = p_user_id::text)
    order by occurred_at desc
    limit 20
  ) a;

  return jsonb_build_object(
    'id', v_profile.id, 'email', v_profile.email, 'displayName', v_profile.display_name,
    'status', v_profile.status, 'createdAt', v_profile.created_at,
    'roles', v_roles, 'permissions', v_permissions, 'recentAuditEvents', v_audit,
    'dataScope', jsonb_build_object('allAgents', v_all_agents, 'agentIds', v_agent_ids, 'allCategories', v_all_categories, 'categoryIds', v_category_ids)
  );
end;
$$;
