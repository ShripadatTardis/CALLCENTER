-- Session 13.2 (DEC-CHAT-01) — Chat Logs/Chat Detail currently drop
-- chat_sessions.campaign_id/campaign_target_id entirely: neither
-- api/chat/logs.ts nor chatInteractionSource.ts's materialization path
-- ever reads them, even though call_center_chat_create_session has
-- stored them correctly since the 20261007000000 migration.
--
-- Deliberately a NEW, separate function rather than modifying
-- call_center_chat_customer_links (INNER JOINs customers — would
-- silently exclude a campaign-linked session with no resolved customer)
-- or call_center_chat_session_trial_flags (a distinct, already-proven,
-- fail-closed lookup relied on by chatInteractionSource.ts for Trial
-- exclusion — left completely untouched by this migration). Same
-- "any local session, regardless of other links" shape as the trial
-- lookup, plus a LEFT JOIN to campaigns for a genuine, non-fabricated
-- display name resolved through the one existing authoritative source
-- (call_center.campaigns) — zero N+1, one batched call per Chat Logs
-- page/materialization batch, same pattern already established by
-- call_center_chat_customer_links/call_center_chat_session_trial_flags.

create or replace function public.call_center_chat_session_campaign_context(p_upstream_session_ids text[])
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
    select
      s.upstream_session_id,
      s.campaign_id,
      s.campaign_target_id,
      c.name as campaign_name
    from call_center.chat_sessions s
    left join call_center.campaigns c on c.id = s.campaign_id
    where s.upstream_session_id = any(p_upstream_session_ids)
  ) t;
$$;

revoke all on function public.call_center_chat_session_campaign_context(text[]) from public, anon, authenticated;
grant execute on function public.call_center_chat_session_campaign_context(text[]) to service_role;
