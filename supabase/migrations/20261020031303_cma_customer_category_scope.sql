-- Session 8 — CMA Measurement Ownership Expansion, Part D.
--
-- Adds the 'customer' source family's RPC: call_center_cma_evaluate_customer_measure.
-- Backs CANON-CUSTOMER-360-TOTALINBOUNDOUTBOUND-INTERA, CANON-CUSTOMER-360-ESC-COUNT,
-- CANON-CUSTOMER-360-AUTH-SUMMARY — all 3 already registered 'decided' in
-- cma_canonical_measures (CUST360-01/02/03), unchanged by this migration.
--
-- This RPC owns a NEW capability, not a re-derivation of an existing one: the existing
-- per-customer Customer Detail calculation (src/server/customer360/aggregateMath.ts,
-- FORMULA VERIFIED, unchanged) already correctly computes one customer's own totals.
-- This RPC instead aggregates ACROSS every customer the caller's Customer Category Scope
-- authorizes — a population-level number nothing in this codebase computes today.
--
-- Scoped EXCLUSIVELY by Customer Category Scope (p_all_categories / p_authorized_category_agent_ids
-- — the same category->agent_id resolution call_center_users_resolve_identity already performs
-- for `dataScope.customerAllAgents`/`customerAgentIds`, surfaced to this RPC via api/_auth.ts's
-- existing toCustomerAccess()). Deliberately has NO p_all_agents/p_authorized_agent_ids
-- parameter at all — Agent Scope does not apply to this family, matching every existing
-- Customer 360 route (api/customers/*), none of which apply Agent Scope either. This keeps the
-- two scope dimensions structurally incapable of broadening each other for this family: there
-- is no agent-scope parameter here to leak into, by construction, not by a runtime check alone.
--
-- Not windowed — CUST360-01/02/03's own approved definition is "lifetime, not windowed" — so
-- this RPC takes no p_started_from/p_started_to parameters, unlike every other CMA evaluate RPC.
--
-- Fails closed on an empty authorized-category-agent-id set: p_all_categories = false and
-- p_authorized_category_agent_ids = '{}' yields population = 0 for every measure (no customer
-- can match `latest_agent_id = any('{}')`), never a fabricated 0%/0-count misread as "verified
-- zero" vs. "nothing authorized" — the caller-side CmaMeasureValue shape already distinguishes
-- a real zero_denominator from a genuine 0 count for the 'count'-unit measures, same convention
-- as every existing count-unit algorithm (CANON-CAMPAIGN-TARGET-COUNT, CANON-ACTION-REQUIRED-
-- QUEUE-ITEMS).
--
-- customers.latest_agent_id null (no interaction has ever been attributed to an agent for that
-- customer) is excluded from every restricted-scope query, consistent with the existing
-- isAgentIdInScope()/isAgentIdInEvaluationScope() convention elsewhere in this codebase
-- ("!!agentId && ..." — a null agentId is never in scope unless the caller has unrestricted
-- access). An unrestricted (p_all_categories = true) caller sees every customer, null
-- latest_agent_id included.

create or replace function public.call_center_cma_evaluate_customer_measure(
  p_canonical_measure_id text,
  p_all_categories boolean,
  p_authorized_category_agent_ids text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_population integer;
  v_sum_total integer;
  v_sum_escalation integer;
  v_ever_auth_count integer;
begin
  if p_canonical_measure_id not in (
    'CANON-CUSTOMER-360-TOTALINBOUNDOUTBOUND-INTERA',
    'CANON-CUSTOMER-360-ESC-COUNT',
    'CANON-CUSTOMER-360-AUTH-SUMMARY'
  ) then
    return jsonb_build_object('status', 'unsupported');
  end if;

  select
    count(*),
    coalesce(sum(total_interactions), 0),
    coalesce(sum(escalation_count), 0),
    coalesce(sum((auth_summary ->> 'everAuthenticated')::boolean::int), 0)
  into v_population, v_sum_total, v_sum_escalation, v_ever_auth_count
  from call_center.customers
  where (p_all_categories or (latest_agent_id is not null and latest_agent_id = any(p_authorized_category_agent_ids)));

  if p_canonical_measure_id = 'CANON-CUSTOMER-360-TOTALINBOUNDOUTBOUND-INTERA' then
    return jsonb_build_object('status', 'ok', 'population', v_population, 'numerator', v_sum_total, 'denominator', v_population);
  elsif p_canonical_measure_id = 'CANON-CUSTOMER-360-ESC-COUNT' then
    return jsonb_build_object('status', 'ok', 'population', v_population, 'numerator', v_sum_escalation, 'denominator', v_population);
  else
    return jsonb_build_object('status', 'ok', 'population', v_population, 'numerator', v_ever_auth_count, 'denominator', v_population);
  end if;
end;
$$;

-- Session 8.1 fix: revoking "from public" alone does not remove the EXECUTE grants this
-- project's default privileges on schema public auto-apply to anon/authenticated for every
-- newly created function (anon/authenticated are specific roles, not the PUBLIC pseudo-role).
-- Matches the established convention in cma_evaluation_engine.sql ("from public, anon, authenticated").
revoke all on function public.call_center_cma_evaluate_customer_measure(text, boolean, text[]) from public, anon, authenticated;
grant execute on function public.call_center_cma_evaluate_customer_measure(text, boolean, text[]) to service_role;
