-- Extend call_center_list_customers' search predicate to also match
-- source_customer_ref (CIF) and phone contact points, in addition to the
-- existing display_name match. Authorization/visibility logic (p_all /
-- p_agent_ids -> v_visible) is untouched -- only the search predicate is
-- widened. source_customer_ref remains a display/search field only, never
-- used as an identity join key.
create or replace function public.call_center_list_customers(
  p_search text, p_agent_ids text[], p_all boolean, p_page integer, p_page_size integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'call_center', 'pg_temp'
as $function$
declare
  v_total int;
  v_rows jsonb;
  v_visible uuid[];
  v_search_digits text := nullif(regexp_replace(coalesce(p_search, ''), '[^0-9]', '', 'g'), '');
begin
  if not p_all then
    select coalesce(array_agg(distinct customer_id), '{}') into v_visible
      from call_center.customer_interactions where agent_id = any(p_agent_ids);
    if v_visible is null or array_length(v_visible, 1) is null then
      return jsonb_build_object('rows', '[]'::jsonb, 'totalCount', 0);
    end if;
  end if;

  select count(*) into v_total from call_center.customers c
    where (p_all or c.id = any(v_visible))
      and (
        p_search is null
        or c.display_name ilike '%' || p_search || '%'
        or c.source_customer_ref ilike '%' || p_search || '%'
        or (v_search_digits is not null and exists (
              select 1 from call_center.customer_contact_points cp
              where cp.customer_id = c.id and cp.type = 'phone'
                and cp.normalized_value ilike '%' || v_search_digits || '%'
            ))
      );

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_rows from (
    select
      c.id, c.display_name, c.source_customer_ref,
      agg.first_seen, agg.last_seen, agg.total_interactions, agg.inbound_count, agg.outbound_count,
      agg.latest_intent, agg.latest_outcome, null::text as latest_sentiment_label, agg.latest_sentiment_score,
      agg.escalation_count, agg.channels, agg.latest_agent_id, agg.latest_agent_display_name,
      jsonb_build_object('everAuthenticated', coalesce(agg.ever_authenticated, false), 'lastAuthenticatedAt', agg.last_authenticated_at) as auth_summary,
      c.aggregation_version, c.aggregated_at,
      phone.primary_phone_masked
    from call_center.customers c
    cross join lateral (
      select
        min(ci.started_at) as first_seen,
        max(ci.started_at) as last_seen,
        count(*) as total_interactions,
        count(*) filter (where ci.direction = 'inbound') as inbound_count,
        count(*) filter (where ci.direction = 'outbound') as outbound_count,
        count(*) filter (where ci.escalation_trigger is not null) as escalation_count,
        coalesce(array_agg(distinct ci.channel), '{}') as channels,
        (array_agg(ci.intent order by ci.started_at desc))[1] as latest_intent,
        (array_agg(ci.outcome order by ci.started_at desc))[1] as latest_outcome,
        (array_agg(ci.sentiment_score order by ci.started_at desc))[1] as latest_sentiment_score,
        (array_agg(ci.agent_id order by ci.started_at desc))[1] as latest_agent_id,
        (array_agg(ci.agent_display_name order by ci.started_at desc))[1] as latest_agent_display_name,
        bool_or(ci.was_authenticated is true) as ever_authenticated,
        max(ci.started_at) filter (where ci.was_authenticated is true) as last_authenticated_at
      from call_center.customer_interactions ci
      where ci.customer_id = c.id and (p_all or ci.agent_id = any(p_agent_ids))
    ) agg
    cross join lateral (
      select case
        when length(regexp_replace(cp.normalized_value, '[^0-9]', '', 'g')) >= 4
          then '••••' || right(regexp_replace(cp.normalized_value, '[^0-9]', '', 'g'), 4)
        else null
      end as primary_phone_masked
      from call_center.customer_contact_points cp
      where cp.customer_id = c.id and cp.type = 'phone'
      order by cp.is_primary desc, cp.last_seen desc
      limit 1
    ) phone
    where (p_all or c.id = any(v_visible))
      and (
        p_search is null
        or c.display_name ilike '%' || p_search || '%'
        or c.source_customer_ref ilike '%' || p_search || '%'
        or (v_search_digits is not null and exists (
              select 1 from call_center.customer_contact_points cp2
              where cp2.customer_id = c.id and cp2.type = 'phone'
                and cp2.normalized_value ilike '%' || v_search_digits || '%'
            ))
      )
    order by agg.last_seen desc nulls last
    limit p_page_size offset (p_page - 1) * p_page_size
  ) t;

  return jsonb_build_object('rows', v_rows, 'totalCount', v_total);
end;
$function$;
