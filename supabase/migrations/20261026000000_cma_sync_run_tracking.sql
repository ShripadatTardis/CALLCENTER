-- CMA Synchronization — Manual UI Control.
--
-- Replaces the originally-planned 5-minute Vercel Cron polling (CMA-1B.3
-- Step 5), which turned out to be unsupported on this Vercel team's
-- confirmed Hobby plan (cron is daily-only there). Instead of a coarser
-- cron, this adds an admin-UI-triggered manual "Sync Now" control, backed
-- by a real, persisted run log so status/history survive page reloads
-- and are visible from any browser session -- not held in server memory.
--
-- This is an OPERATIONAL RUN LOG only -- never a CMA governance/
-- calculation table. It does not implement cma_base_facts/cma_dimensions/
-- cma_canonical_measures or any part of the CMA v0.3.1 calculation-engine
-- design; those remain explicitly out of scope.
--
-- All writes continue to flow ONLY through the already-proven,
-- already-applied call_center_sync_interaction RPC (CMA-1A/1A.1/1A.3),
-- invoked via the already-committed syncCallWindow/syncChatWindow /
-- runCmaPollingTick (CMA-1B/1B.1). This migration adds no new write path
-- to customer_interactions -- only a log of when/how those existing
-- functions were invoked from the UI.
--
-- Concurrency: a manual sync must never run twice at once. A partial
-- unique index on (status) where status = 'running' is the simplest
-- genuinely race-safe mechanism -- Postgres enforces the single-row
-- invariant at the index level inside the INSERT itself, so there is no
-- separate check-then-insert window (a two-statement
-- "select ... then insert" would have a real TOCTOU gap under concurrent
-- requests; a single INSERT that can violate a unique index does not).
-- call_center_cma_sync_runs_start catches the resulting unique_violation
-- and reports "already running" with the existing run's id, rather than
-- silently queuing or overwriting it.
--
-- NOT applied to the live database by this session -- left as a
-- proposal for the coordinator to review and apply separately, per
-- explicit instruction.

create table if not exists call_center.cma_sync_runs (
  id uuid primary key default gen_random_uuid(),
  triggered_by uuid references call_center.user_profiles(id) on delete set null,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  window_started_from timestamptz not null,
  window_started_to timestamptz not null,
  lookback_mode text not null check (lookback_mode in ('since_last_success', 'explicit')),
  calls_processed int not null default 0,
  calls_inserted int not null default 0,
  calls_updated int not null default 0,
  calls_failed int not null default 0,
  chats_processed int not null default 0,
  chats_inserted int not null default 0,
  chats_updated int not null default 0,
  chats_failed int not null default 0,
  error_detail text
);

create index if not exists cma_sync_runs_started_at_idx on call_center.cma_sync_runs (started_at desc);

-- At most one `running` row can ever exist -- the concurrency lock.
create unique index if not exists cma_sync_runs_one_running_idx
  on call_center.cma_sync_runs (status)
  where status = 'running';

alter table call_center.cma_sync_runs enable row level security;

-- ===== Permission vocabulary (additive) =====
insert into call_center.permissions (key, label, description, pillar) values
  ('cma.sync.manage', 'Manage CMA Synchronization', 'Trigger a manual CMA Base Facts synchronization run and view its status/history.', 'Operationalize')
on conflict (key) do nothing;

insert into call_center.role_permissions (role_code, permission_key)
select 'administrator', key from call_center.permissions where key = 'cma.sync.manage'
on conflict do nothing;

-- ===== RPCs (public.call_center_cma_sync_runs_*, mirroring the 14.x/15 convention) =====

-- Insert-or-reject: the unique index above is the real concurrency gate.
-- A unique_violation here means a run is already in progress; report it
-- rather than erroring the caller out.
create or replace function public.call_center_cma_sync_runs_start(
  p_triggered_by uuid,
  p_window_started_from timestamptz,
  p_window_started_to timestamptz,
  p_lookback_mode text
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_id uuid;
  v_existing uuid;
begin
  begin
    insert into call_center.cma_sync_runs (triggered_by, window_started_from, window_started_to, lookback_mode)
    values (p_triggered_by, p_window_started_from, p_window_started_to, p_lookback_mode)
    returning id into v_id;
  exception when unique_violation then
    select id into v_existing from call_center.cma_sync_runs where status = 'running' limit 1;
    return jsonb_build_object('alreadyRunning', true, 'runId', v_existing);
  end;

  perform call_center.audit_events_insert_helper(
    'user', p_triggered_by, 'cma_sync.run_started', 'cma_sync_run', v_id::text, 'success', null
  );

  return jsonb_build_object('alreadyRunning', false, 'runId', v_id);
end;
$$;

create or replace function public.call_center_cma_sync_runs_complete(
  p_run_id uuid,
  p_status text,
  p_calls_processed int, p_calls_inserted int, p_calls_updated int, p_calls_failed int,
  p_chats_processed int, p_chats_inserted int, p_chats_updated int, p_chats_failed int,
  p_error_detail text
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_actor uuid;
begin
  update call_center.cma_sync_runs set
    status = p_status,
    finished_at = now(),
    calls_processed = p_calls_processed, calls_inserted = p_calls_inserted, calls_updated = p_calls_updated, calls_failed = p_calls_failed,
    chats_processed = p_chats_processed, chats_inserted = p_chats_inserted, chats_updated = p_chats_updated, chats_failed = p_chats_failed,
    error_detail = p_error_detail
  where id = p_run_id
  returning triggered_by into v_actor;

  perform call_center.audit_events_insert_helper(
    'user', v_actor, 'cma_sync.run_completed', 'cma_sync_run', p_run_id::text, 'success',
    jsonb_build_object('status', p_status, 'callsProcessed', p_calls_processed, 'chatsProcessed', p_chats_processed)
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.call_center_cma_sync_runs_to_json(p_row call_center.cma_sync_runs)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select jsonb_build_object(
    'id', p_row.id,
    'triggeredBy', p_row.triggered_by,
    'triggeredByEmail', (select email from call_center.user_profiles where id = p_row.triggered_by),
    'status', p_row.status,
    'startedAt', p_row.started_at,
    'finishedAt', p_row.finished_at,
    'windowStartedFrom', p_row.window_started_from,
    'windowStartedTo', p_row.window_started_to,
    'lookbackMode', p_row.lookback_mode,
    'calls', jsonb_build_object(
      'processed', p_row.calls_processed, 'inserted', p_row.calls_inserted,
      'updated', p_row.calls_updated, 'failed', p_row.calls_failed
    ),
    'chats', jsonb_build_object(
      'processed', p_row.chats_processed, 'inserted', p_row.chats_inserted,
      'updated', p_row.chats_updated, 'failed', p_row.chats_failed
    ),
    'errorDetail', p_row.error_detail
  );
$$;

-- Last N runs, most recent first. The latest run (status/history's own
-- first element) IS "current status" -- no separate "latest" RPC needed.
create or replace function public.call_center_cma_sync_runs_list(p_limit int default 10)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(public.call_center_cma_sync_runs_to_json(r) order by r.started_at desc), '[]'::jsonb)
  from (select * from call_center.cma_sync_runs order by started_at desc limit p_limit) r;
$$;

revoke all on function public.call_center_cma_sync_runs_start(uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.call_center_cma_sync_runs_complete(uuid, text, int, int, int, int, int, int, int, int, text) from public, anon, authenticated;
revoke all on function public.call_center_cma_sync_runs_to_json(call_center.cma_sync_runs) from public, anon, authenticated;
revoke all on function public.call_center_cma_sync_runs_list(int) from public, anon, authenticated;

grant execute on function public.call_center_cma_sync_runs_start(uuid, timestamptz, timestamptz, text) to service_role;
grant execute on function public.call_center_cma_sync_runs_complete(uuid, text, int, int, int, int, int, int, int, int, text) to service_role;
grant execute on function public.call_center_cma_sync_runs_to_json(call_center.cma_sync_runs) to service_role;
grant execute on function public.call_center_cma_sync_runs_list(int) to service_role;
