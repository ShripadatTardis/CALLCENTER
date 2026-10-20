-- Session 8.1 — Part D: minimal TEST-mode data adapters for Call Logs and Chat Logs.
--
-- Call Logs and Chat Logs' primary list/detail paths are 100% live-Voice-API-sourced
-- (api/calls/data.ts -> GET {VOICEBOT_BASE_URL}/api/v1/call-data, api/chat/logs.ts ->
-- GET {VOICEBOT_BASE_URL}/api/v1/chat/sessions) — synthetic interaction ids from the
-- CMA_POC_500_V1 fixture do not exist in that live backend and must never be sent to it.
-- These two RPCs let the two routes read the synthetic population directly from Supabase
-- instead, ONLY when the caller's dataset mode is TEST (api/calls/data.ts, api/chat/logs.ts).
--
-- `call_center` is not exposed via PostgREST in this project — every read goes through a
-- security definer function under `public`, same convention as every existing
-- `call_center_*` RPC (confirmed: src/server/chat/supabaseChatRepository.ts's own header
-- comment, and zero existing `.schema()`/`.from()` usage anywhere in this codebase).
--
-- Agent Scope is applied here (p_all_agents / p_authorized_agent_ids), mirroring every
-- existing CMA evaluate RPC's own agent-scope predicate (`!!agent_id && agent_id = any(...)`,
-- fail-closed on a null agent_id unless unrestricted) — these two routes already apply this
-- same check for their live-API branch; this keeps TEST mode under the identical rule rather
-- than inventing a second authorization shape.

create or replace function public.call_center_test_mode_voice_interactions_list(
  p_dataset_id text,
  p_all_agents boolean,
  p_authorized_agent_ids text[],
  p_direction text default null,
  p_outcome text default null,
  p_started_from timestamptz default null,
  p_started_to timestamptz default null
) returns setof call_center.customer_interactions
language sql
stable
security definer
set search_path = public
as $$
  select *
  from call_center.customer_interactions
  where dataset_id = p_dataset_id
    and channel = 'voice'
    and (p_all_agents or (agent_id is not null and agent_id = any(p_authorized_agent_ids)))
    and (p_direction is null or direction = p_direction)
    and (p_outcome is null or outcome = p_outcome)
    and (p_started_from is null or started_at >= p_started_from)
    and (p_started_to is null or started_at <= p_started_to)
  order by started_at desc;
$$;

revoke all on function public.call_center_test_mode_voice_interactions_list(text, boolean, text[], text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.call_center_test_mode_voice_interactions_list(text, boolean, text[], text, text, timestamptz, timestamptz) to service_role;

create or replace function public.call_center_test_mode_chat_sessions_list(
  p_dataset_id text,
  p_all_agents boolean,
  p_authorized_agent_ids text[]
) returns setof call_center.chat_sessions
language sql
stable
security definer
set search_path = public
as $$
  select *
  from call_center.chat_sessions
  where dataset_id = p_dataset_id
    and (p_all_agents or (agent_id is not null and agent_id = any(p_authorized_agent_ids)))
  order by started_at desc;
$$;

revoke all on function public.call_center_test_mode_chat_sessions_list(text, boolean, text[]) from public, anon, authenticated;
grant execute on function public.call_center_test_mode_chat_sessions_list(text, boolean, text[]) to service_role;

create or replace function public.call_center_test_mode_chat_session_get(
  p_dataset_id text,
  p_upstream_session_id text,
  p_all_agents boolean,
  p_authorized_agent_ids text[]
) returns call_center.chat_sessions
language sql
stable
security definer
set search_path = public
as $$
  select *
  from call_center.chat_sessions
  where dataset_id = p_dataset_id
    and upstream_session_id = p_upstream_session_id
    and (p_all_agents or (agent_id is not null and agent_id = any(p_authorized_agent_ids)))
  limit 1;
$$;

revoke all on function public.call_center_test_mode_chat_session_get(text, text, boolean, text[]) from public, anon, authenticated;
grant execute on function public.call_center_test_mode_chat_session_get(text, text, boolean, text[]) to service_role;
