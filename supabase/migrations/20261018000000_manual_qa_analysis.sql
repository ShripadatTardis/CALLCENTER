-- Session 16.2 — Human QA Quality Explorer, backend support.
--
-- Audit findings that shape this migration (see
-- docs/HUMAN_QA_QUALITY_EXPLORER.md for the full write-up):
--
-- 1. Multiple submitted/in-progress reviews CAN exist for the same
--    (interaction_id, channel) — confirmed live on this project
--    (one interaction already has 2 rows: 1 submitted + 1 in_progress,
--    same reviewer, from Session 16.1.1's own live verification).
--    Policy (documented, not silently chosen): "reviewed interactions"/
--    coverage counts DISTINCT interaction_id among submitted reviews;
--    parameter ratios do NOT deduplicate — each submitted review is an
--    independent, complete Human QA assessment (the calibration use
--    case this schema was explicitly built to allow in 16.1), so its
--    findings contribute independently.
--
-- 2. call_center_qa_review_get's caller-ownership check
--    (reviewer_user_id = caller) is correct for the Flag/Good/N-A
--    mutation workflow, but it also blocks an authorized analyst (not
--    the original reviewer) from drilling into someone ELSE'S
--    *submitted* review from the new Explorer — submitted data is
--    immutable and meant to be the shared reference record, not a
--    private draft. A new permission (qa.analytics.view) is added; the
--    API layer (not this migration) relaxes the GET-only read path for
--    submitted reviews to "owner OR qa.analytics.view + in Agent
--    Scope", while every MUTATION path remains strictly owner-only,
--    completely unchanged.

-- =====================================================================
-- 1. New permission — aggregate/trend/reason analysis is a materially
--    broader capability than conducting one review, so it is its own
--    permission rather than silently riding on qa.review. Granted by
--    default to administrator/supervisor (the QA-oversight roles) —
--    NOT automatically to qa_reviewer, per the brief's explicit caution
--    against granting broad analytical access merely because a user can
--    submit a review. Adjustable later via the existing Role Management
--    permission matrix, same as every other permission in this schema.
-- =====================================================================
insert into call_center.permissions (key, label, description, pillar) values
  ('qa.analytics.view', 'View Human QA Quality Explorer', 'View aggregate Human QA measurements, trends, failure reasons, agent comparisons, and drill into any submitted review''s evidence within Business Data Scope — distinct from qa.review, which only covers conducting a review.', 'Improve')
on conflict (key) do nothing;

insert into call_center.role_permissions (role_code, permission_key)
select role_code, 'qa.analytics.view' from (values ('administrator'), ('supervisor')) as r(role_code)
on conflict do nothing;

-- =====================================================================
-- 2. call_center_qa_findings_list — extended with the filters the
--    Explorer needs (channel, submitted_at date range, reviewer) and
--    enriched with the review-level fields (channel, submittedAt,
--    reviewerUserId, interactionId) every finding needs for client-side
--    filtering/grouping/trend-bucketing, without a second round trip.
--    Still submitted-reviews-only (§10) and still Agent-Scope-filtered
--    (§21) — both already correct from Session 16.1, unchanged here.
-- =====================================================================
create or replace function public.call_center_qa_findings_list(
  p_authorized_agent_ids text[], p_all_agents boolean, p_limit int default 5000,
  p_channel text default null, p_date_from timestamptz default null, p_date_to timestamptz default null,
  p_reviewer_user_id uuid default null
)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(
    to_jsonb(f) || jsonb_build_object(
      'channel', r.channel,
      'agentId', r.agent_id,
      'interactionId', r.interaction_id,
      'reviewerUserId', r.reviewer_user_id,
      'submittedAt', r.submitted_at
    )
  ), '[]'::jsonb)
  from call_center.qa_findings f
  join call_center.qa_reviews r on r.id = f.review_id
  where r.status = 'submitted'
    and (p_all_agents or r.agent_id = any(p_authorized_agent_ids))
    and (p_channel is null or r.channel = p_channel)
    and (p_date_from is null or r.submitted_at >= p_date_from)
    and (p_date_to is null or r.submitted_at <= p_date_to)
    and (p_reviewer_user_id is null or r.reviewer_user_id = p_reviewer_user_id)
  limit p_limit;
$$;

-- =====================================================================
-- 3. call_center_qa_reviews_population — every review (any status)
--    matching scope+filters, the source for: submitted vs. in-progress
--    counts, distinct reviewed-interaction count, coverage, and
--    interaction-level outcome aggregation (Request Completion, FCR,
--    Human Assistance Required, Business Outcome — §19). Unlike
--    call_center_qa_findings_list, this intentionally includes
--    in_progress rows too, so the Explorer can show "N reviews in
--    progress" (§11) without a second query.
-- =====================================================================
create or replace function public.call_center_qa_reviews_population(
  p_authorized_agent_ids text[], p_all_agents boolean,
  p_channel text default null, p_date_from timestamptz default null, p_date_to timestamptz default null,
  p_reviewer_user_id uuid default null, p_limit int default 5000
)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
  from call_center.qa_reviews r
  where (p_all_agents or r.agent_id = any(p_authorized_agent_ids))
    and (p_channel is null or r.channel = p_channel)
    -- Filtered on started_at, not submitted_at, here, so an in_progress
    -- review (submitted_at is null) can still be counted as "in
    -- progress within this period" — submittedAt-only filtering is
    -- applied downstream by the TS layer for submitted-only views.
    and (p_date_from is null or r.started_at >= p_date_from)
    and (p_date_to is null or r.started_at <= p_date_to)
    and (p_reviewer_user_id is null or r.reviewer_user_id = p_reviewer_user_id)
  limit p_limit;
$$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'call_center_qa_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
