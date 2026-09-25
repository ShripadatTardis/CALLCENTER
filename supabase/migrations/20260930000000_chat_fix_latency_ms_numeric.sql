-- Fix: chat latency_ms columns/RPC param were typed int, but the live
-- Chat API returns decimal latencies (e.g. 36.5ms) — every AI-role
-- appendMessage call was silently failing (caught client-side, surfaced
-- as persisted:false), so no assistant message text was ever being
-- locally persisted. Widen to numeric to match the real payload shape.
-- Discovered during post-outage live verification (Session 5.1 was
-- implemented while the backend was down, so this never got a live
-- decimal latency value to fail against until now).

alter table call_center.chat_messages
  alter column latency_ms type numeric using latency_ms::numeric;

alter table call_center.chat_sessions
  alter column latest_latency_ms type numeric using latest_latency_ms::numeric;

drop function if exists public.call_center_chat_append_message(uuid, text, text, timestamptz, text, numeric, boolean, text, text, int);

create or replace function public.call_center_chat_append_message(
  p_session_id uuid, p_role text, p_raw_text text, p_now timestamptz,
  p_intent text, p_confidence numeric, p_authenticated boolean,
  p_data_source text, p_detection_method text, p_latency_ms numeric
)
returns call_center.chat_messages
language plpgsql
security definer
set search_path = call_center, public
as $$
declare
  v_seq int;
  v_row call_center.chat_messages;
begin
  select coalesce(max(sequence), 0) + 1 into v_seq
  from call_center.chat_messages where chat_session_id = p_session_id;

  insert into call_center.chat_messages (
    chat_session_id, sequence, role, raw_text, created_at,
    intent, confidence, authenticated, data_source, detection_method, latency_ms
  ) values (
    p_session_id, v_seq, p_role, p_raw_text, p_now,
    p_intent, p_confidence, p_authenticated, p_data_source, p_detection_method, p_latency_ms
  )
  returning * into v_row;

  update call_center.chat_sessions set
    message_count = message_count + 1,
    last_activity_at = p_now,
    updated_at = p_now,
    latest_intent = case when p_role = 'ai' then p_intent else latest_intent end,
    latest_confidence = case when p_role = 'ai' then p_confidence else latest_confidence end,
    latest_authenticated = case when p_role = 'ai' then p_authenticated else latest_authenticated end,
    latest_data_source = case when p_role = 'ai' then p_data_source else latest_data_source end,
    latest_detection_method = case when p_role = 'ai' then p_detection_method else latest_detection_method end,
    latest_latency_ms = case when p_role = 'ai' then p_latency_ms else latest_latency_ms end
  where id = p_session_id;

  return v_row;
end;
$$;

revoke all on function public.call_center_chat_append_message(uuid, text, text, timestamptz, text, numeric, boolean, text, text, numeric) from public, anon, authenticated;
grant execute on function public.call_center_chat_append_message(uuid, text, text, timestamptz, text, numeric, boolean, text, text, numeric) to service_role;
