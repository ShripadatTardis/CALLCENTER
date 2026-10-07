-- Session 16.1 follow-up (live-verification bugfix) — call_center_qa_review_start
-- returned only to_jsonb(v_review) (no turnReviews/findings keys), unlike every
-- other QA mutator RPC, which ends with `return public.call_center_qa_review_get(p_review_id)`.
-- The frontend QaReviewDialog caches this partial object as the review query's
-- data immediately on start, then crashes on `review.findings.length`
-- (undefined) before the subsequent full fetch lands. Fix: return the same
-- full-state shape as every other mutator, for consistency.
create or replace function public.call_center_qa_review_start(
  p_interaction_id text, p_channel text, p_agent_id text, p_reviewer_user_id uuid, p_now timestamptz
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_review call_center.qa_reviews;
begin
  select * into v_review from call_center.qa_reviews
    where interaction_id = p_interaction_id and channel = p_channel
      and reviewer_user_id = p_reviewer_user_id and status = 'in_progress';

  if v_review.id is null then
    insert into call_center.qa_reviews (interaction_id, channel, agent_id, reviewer_user_id, started_at)
      values (p_interaction_id, p_channel, p_agent_id, p_reviewer_user_id, p_now)
      returning * into v_review;
  end if;

  return public.call_center_qa_review_get(v_review.id);
end;
$$;
