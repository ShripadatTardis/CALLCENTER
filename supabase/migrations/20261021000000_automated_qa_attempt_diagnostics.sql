-- Session 16.4.4 — Automated QA attempt diagnostics. Additive only: no
-- change to automated_qa_evaluations/automated_qa_observations, no
-- change to evaluation scoring/applicability/contract. Same conventions
-- as every prior migration in this schema: uuid PK, timestamptz audit
-- columns, snake_case, plain text + check (not enums), deny-all RLS,
-- security definer RPCs under public.call_center_*, grant execute to
-- service_role only.
--
-- NOT applied automatically per this session's brief (§13 "DO NOT apply
-- database migrations automatically"). Prepared here for review and
-- manual `supabase db push` / dashboard application by the user.
--
-- Raw LLM response text may contain customer transcript content (brief
-- §3) — this table is reachable ONLY via security definer RPCs granted
-- to service_role, the same deny-all-RLS pattern every other QA table
-- already uses. No RPC here is ever called from api/admin.ts's HTTP
-- surface for raw-response retrieval (brief §8 — "do not create a new
-- public API merely to expose raw LLM responses"); retrieval is a
-- controlled, server-side procedure documented in
-- docs/SESSION_16_4_4_AUTOMATED_QA_ATTEMPT_DIAGNOSTICS.md.

create table if not exists call_center.automated_qa_evaluation_attempts (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references call_center.automated_qa_evaluations(id) on delete cascade,
  window_index int not null,
  -- 1-based within (evaluation_id, window_index) — brief §2.1.
  attempt_number int not null,
  request_id text not null,
  model_id text,
  -- The brief §3 outcome vocabulary: did it return a response, fail
  -- during transport, fail during JSON parsing, fail the Generic Local
  -- LLM API's own contract, or fail one of this application's two
  -- semantic-validation defects.
  outcome text not null check (outcome in (
    'success', 'transport_failure', 'parse_failure', 'llm_error',
    'contradictory_applicability', 'uninformative_unassessability'
  )),
  error_code text,
  error_message text,
  -- Exact response body text, never normalized/corrected (brief §3).
  -- Null only for a transport-level failure that never received a body.
  -- Application-layer boundRawResponse() already caps this at 60,000
  -- chars before the RPC is ever called; this check is a server-side
  -- backstop (defense in depth) against any future caller that bypasses
  -- it — generous enough (100,000) to never clip a value the
  -- application already bounded.
  raw_response text check (raw_response is null or length(raw_response) <= 100000),
  -- Structured validation diagnostics (brief §4) — rejected individual
  -- observation entries, and, when applicable, the cross-array
  -- contradiction / placeholder-unassessability detail with the exact
  -- conflicting parameter codes and their raw occurrence counts.
  validation_detail jsonb,
  -- Why THIS attempt happened — the previous attempt's error/defect
  -- code, or null for the first attempt in a window (brief §5).
  retry_reason text,
  correction_instruction_id text,
  previous_attempt_id uuid references call_center.automated_qa_evaluation_attempts(id),
  requested_max_output_tokens int,
  prompt_tokens int,
  completion_tokens int,
  latency_ms int,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (evaluation_id, window_index, attempt_number),
  unique (request_id)
);

create index if not exists automated_qa_evaluation_attempts_evaluation_idx
  on call_center.automated_qa_evaluation_attempts (evaluation_id, window_index, attempt_number);
create index if not exists automated_qa_evaluation_attempts_created_idx
  on call_center.automated_qa_evaluation_attempts (created_at);

alter table call_center.automated_qa_evaluation_attempts enable row level security;
-- Deny-all RLS (no policies) — every access path is through the
-- security definer RPCs below, same convention as every other QA table.

-- =====================================================================
-- RPCs — public.call_center_automated_qa_attempts_*
-- =====================================================================

-- Batch insert: one call per evaluation run, inserting every attempt
-- (initial + retries, across every window) in one transaction. Never
-- called from a code path that can turn a diagnostic-write failure into
-- a QA evaluation failure — api/admin.ts wraps this call in try/catch
-- and persists the evaluation's own terminal state regardless (brief
-- §6 — "A failure to write optional diagnostics must not turn a valid
-- QA evaluation into a failure").
create or replace function public.call_center_automated_qa_attempts_record(
  p_evaluation_id uuid, p_attempts jsonb, p_now timestamptz
)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_attempt jsonb; v_inserted int := 0; v_rows int;
begin
  if p_attempts is null then
    return jsonb_build_object('inserted', 0);
  end if;

  for v_attempt in select * from jsonb_array_elements(p_attempts) loop
    insert into call_center.automated_qa_evaluation_attempts (
      id, evaluation_id, window_index, attempt_number, request_id, model_id,
      outcome, error_code, error_message, raw_response, validation_detail,
      retry_reason, correction_instruction_id, previous_attempt_id,
      requested_max_output_tokens, prompt_tokens, completion_tokens, latency_ms,
      started_at, completed_at, created_at
    ) values (
      (v_attempt->>'attemptId')::uuid, p_evaluation_id,
      (v_attempt->>'windowIndex')::int, (v_attempt->>'attemptNumber')::int,
      v_attempt->>'requestId', v_attempt->>'modelId',
      v_attempt->>'outcome', v_attempt->>'errorCode', v_attempt->>'errorMessage',
      v_attempt->>'rawResponseText', v_attempt->'validationDetail',
      v_attempt->>'retryReason', v_attempt->>'correctionInstructionId',
      nullif(v_attempt->>'previousAttemptId', '')::uuid,
      (v_attempt->>'requestedMaxOutputTokens')::int, (v_attempt->>'promptTokens')::int,
      (v_attempt->>'completionTokens')::int, (v_attempt->>'latencyMs')::int,
      (v_attempt->>'startedAt')::timestamptz, (v_attempt->>'completedAt')::timestamptz, p_now
    )
    -- Idempotent: a duplicate (evaluation_id, window_index,
    -- attempt_number) is silently skipped, never a duplicate row and
    -- never an error. GET DIAGNOSTICS after THIS statement (not after
    -- the loop) is what makes `inserted` an accurate count of rows
    -- actually written, not just loop iterations — a bug found and
    -- fixed during this session's own security/migration review: the
    -- original version incremented v_inserted unconditionally, so a
    -- re-run of an already-persisted evaluation's attempts falsely
    -- reported every row as freshly inserted.
    on conflict (evaluation_id, window_index, attempt_number) do nothing;
    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;
  end loop;

  return jsonb_build_object('inserted', v_inserted);
end;
$$;

-- Diagnostic read, for authorized server-side retrieval only (brief §8
-- — never wired into api/admin.ts's HTTP surface). Run via a locally-
-- held service-role script or the Supabase SQL editor by authorized
-- diagnostic personnel, not through the deployed application.
create or replace function public.call_center_automated_qa_attempts_list(p_evaluation_id uuid)
returns jsonb language sql security definer set search_path = call_center, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(a) order by a.window_index, a.attempt_number), '[]'::jsonb)
    from call_center.automated_qa_evaluation_attempts a
    where a.evaluation_id = p_evaluation_id;
$$;

-- Bounded retention (brief §6) — not scheduled automatically in this
-- session (no cron wiring added); an administrator invokes this
-- manually (or it can be wired to the existing daily-cron convention in
-- a future session) to delete attempt diagnostics older than a given
-- cutoff. Deleting attempts never touches automated_qa_evaluations/
-- automated_qa_observations.
create or replace function public.call_center_automated_qa_attempts_prune(p_older_than timestamptz)
returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare v_deleted int;
begin
  delete from call_center.automated_qa_evaluation_attempts where created_at < p_older_than;
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('deleted', v_deleted);
end;
$$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'call_center_automated_qa_attempts_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
