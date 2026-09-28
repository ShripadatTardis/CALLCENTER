-- Session 11.9B — Fix Integrated Chat Persistence.
--
-- Supersedes the never-applied 20261006000000 migration (removed by
-- this same session), which put Chat into the Voice-only
-- campaign_executions/reconciliation lifecycle. A self-audit found
-- that call_center_campaign_list_pending_reconciliations filters only
-- on reconciliation_status/status — NOT channel or call_sid — and
-- findDiagnosticCandidate() searches Call Centre /call-data by phone
-- number with no channel gate either, so a Chat execution would enter
-- Voice reconciliation, collect a spurious "matching voice call"
-- diagnostic candidate, and deterministically flip its
-- campaign_target to follow_up_due after the 30-minute unresolved
-- timeout — regardless of whether the chat succeeded. That risks a
-- real outbound Voice call via a normal operator Retry on a target
-- that only ever had a chat interaction. See
-- docs/SESSION_11_9B_INTEGRATED_CHAT_PERSISTENCE.md for the full
-- review. campaign_executions/campaign_results/reconciliation are
-- untouched by this migration — Chat never enters that table at all.
--
-- Smallest clean alternative instead: extend Chat's OWN persistence
-- (chat_sessions) with a direct, real link to the campaign_target that
-- initiated it, and a local-only Trial/Test marker — never a parallel
-- execution engine.

alter table call_center.chat_sessions
  add column if not exists campaign_id uuid references call_center.campaigns(id) on delete set null,
  add column if not exists campaign_target_id uuid references call_center.campaign_targets(id) on delete set null,
  add column if not exists is_trial boolean not null default false;

-- Backward-compatible: appends three defaulted params to the existing
-- 13-arg function (customer360_customer_id already added by the prior
-- chat_customer360_selection_retention migration) — every existing
-- caller with 13 named args is unaffected.
create or replace function public.call_center_chat_create_session(
  p_upstream_session_id text,
  p_now timestamptz,
  p_created_by text,
  p_agent_id text default null,
  p_agent_name text default null,
  p_backend_customer_id text default null,
  p_backend_contact_id text default null,
  p_caller_name text default null,
  p_phone_number text default null,
  p_is_bank_customer boolean default null,
  p_upstream_status text default null,
  p_history_doc_id text default null,
  p_customer360_customer_id uuid default null,
  p_campaign_id uuid default null,
  p_campaign_target_id uuid default null,
  p_is_trial boolean default false
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_session call_center.chat_sessions;
begin
  insert into call_center.chat_sessions (
    upstream_session_id, started_at, last_activity_at, status, created_by,
    agent_id, agent_name, backend_customer_id, backend_contact_id,
    caller_name, phone_number, is_bank_customer, upstream_status, history_doc_id,
    customer_id, campaign_id, campaign_target_id, is_trial
  ) values (
    p_upstream_session_id, p_now, p_now, 'active', p_created_by,
    p_agent_id, p_agent_name, p_backend_customer_id, p_backend_contact_id,
    p_caller_name, p_phone_number, p_is_bank_customer, p_upstream_status, p_history_doc_id,
    p_customer360_customer_id, p_campaign_id, p_campaign_target_id, coalesce(p_is_trial, false)
  )
  on conflict (upstream_session_id) do update set
    last_activity_at = excluded.last_activity_at,
    agent_id = coalesce(call_center.chat_sessions.agent_id, excluded.agent_id),
    agent_name = coalesce(call_center.chat_sessions.agent_name, excluded.agent_name),
    backend_customer_id = coalesce(excluded.backend_customer_id, call_center.chat_sessions.backend_customer_id),
    backend_contact_id = coalesce(excluded.backend_contact_id, call_center.chat_sessions.backend_contact_id),
    caller_name = coalesce(excluded.caller_name, call_center.chat_sessions.caller_name),
    phone_number = coalesce(excluded.phone_number, call_center.chat_sessions.phone_number),
    is_bank_customer = coalesce(excluded.is_bank_customer, call_center.chat_sessions.is_bank_customer),
    upstream_status = coalesce(excluded.upstream_status, call_center.chat_sessions.upstream_status),
    history_doc_id = coalesce(excluded.history_doc_id, call_center.chat_sessions.history_doc_id),
    -- Never null out a previously-recorded Customer 360 selection just
    -- because this touch call didn't carry one; never overwrite a
    -- stronger, already-resolved link with a weaker one either.
    customer_id = coalesce(call_center.chat_sessions.customer_id, excluded.customer_id),
    -- Campaign/target context is only ever meaningful on the FIRST
    -- message (mirrors agent_id's own "binds on first message" rule) —
    -- preserved across later touches, never overwritten.
    campaign_id = coalesce(call_center.chat_sessions.campaign_id, excluded.campaign_id),
    campaign_target_id = coalesce(call_center.chat_sessions.campaign_target_id, excluded.campaign_target_id)
    -- is_trial is deliberately NOT in this SET list — set once at
    -- creation, permanently fixed for the life of the session. A later
    -- touch call can neither set nor clear it.
  returning * into v_session;

  return to_jsonb(v_session);
end;
$$;

-- Trial/Test isolation — the read side genuine Customer 360 exclusion
-- needs. Deliberately a separate function from
-- call_center_chat_customer_links (which INNER JOINs customers and is
-- already relied on by Chat Logs display) rather than modifying that
-- proven function's join semantics. Returns a flag for every requested
-- session that exists locally, regardless of whether it has a customer
-- link at all — a Trial chat with a manually-typed real phone/CIF but
-- no local Customer 360 selection must still be excludable.
create or replace function public.call_center_chat_session_trial_flags(p_upstream_session_ids text[])
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
    select upstream_session_id, is_trial
      from call_center.chat_sessions
      where upstream_session_id = any(p_upstream_session_ids)
  ) t;
$$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'call_center_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
