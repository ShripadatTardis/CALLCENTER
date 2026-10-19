-- Session 7 Part C — minimal, versioned transcript-evidence cache for
-- CMA, fronting the live Voice API transcript fetch
-- (fetchRawVoiceTranscript, src/server/qa/transcriptFetcher.ts) so a
-- repeated CMA evidence evaluation of the same interaction does not
-- refetch an unchanged transcript every time (brief: "avoid repeated
-- fetching of unchanged transcripts"). This is NOT a second
-- general-purpose conversation store — it holds only what CMA's
-- evidence evaluators need to cite individual turns, keyed by
-- (interaction_id, interaction_type), one row per interaction, content-
-- hashed and versioned, with an explicit 30-day retention rule (brief:
-- "do not retain transcripts indefinitely without an explicit
-- retention rule").
--
-- Same conventions as every prior CMA migration: uuid PK, timestamptz
-- audit columns, snake_case, plain text + check (not enums), deny-all
-- RLS, security definer RPCs under public.call_center_*, grant execute
-- to service_role only.
--
-- NOT APPLIED TO PRODUCTION THIS SESSION. Per Session 7's explicit
-- boundary ("Implement and test the session locally first" / "Do not
-- commit, push or deploy automatically"), this file is written and
-- validated only against a disposable local PostgreSQL cluster — see
-- docs/SESSION_7_CMA_SOURCE_EVIDENCE_INTEGRATION.md for that run's
-- results.

create table if not exists call_center.cma_transcript_evidence_cache (
  id uuid primary key default gen_random_uuid(),
  interaction_id text not null,
  interaction_type text not null check (interaction_type in ('call', 'chat')),
  source text not null check (source in ('voiceforce_api')),
  content_hash text not null,
  turns jsonb not null,
  turn_count integer not null check (turn_count >= 0),
  fetch_status text not null check (fetch_status in ('available', 'unavailable', 'incomplete')),
  version integer not null default 1,
  fetched_at timestamptz not null default now(),
  -- Explicit retention rule (brief requirement) — a manual purge RPC
  -- (below) deletes rows past this, never a new cron job.
  retention_expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);

-- One row per interaction — a re-fetch always updates this same row
-- (content-hash-aware, see the upsert RPC), never a growing history of
-- duplicate rows for the same interaction.
create unique index if not exists cma_transcript_evidence_cache_one_per_interaction
  on call_center.cma_transcript_evidence_cache (interaction_id, interaction_type);

create index if not exists cma_transcript_evidence_cache_expiry_idx
  on call_center.cma_transcript_evidence_cache (retention_expires_at);

alter table call_center.cma_transcript_evidence_cache enable row level security;
-- Deny-all RLS (no policies) — every access path is through the
-- security definer RPCs below.

-- =====================================================================
-- RPCs — public.call_center_cma_transcript_cache_*
-- =====================================================================

create or replace function public.call_center_cma_transcript_cache_get(
  p_interaction_id text,
  p_interaction_type text
)
returns setof call_center.cma_transcript_evidence_cache
language sql
security definer
set search_path = public, call_center
as $$
  select * from call_center.cma_transcript_evidence_cache
  where interaction_id = p_interaction_id
    and interaction_type = p_interaction_type;
$$;

-- Idempotent upsert: a byte-identical re-fetch (same content_hash) only
-- refreshes fetched_at/retention_expires_at (no version bump, no row
-- duplication); a genuinely changed transcript bumps version and
-- overwrites the content. There is exactly one row per
-- (interaction_id, interaction_type) at all times — never two
-- candidate rows disagreeing silently.
create or replace function public.call_center_cma_transcript_cache_upsert(
  p_interaction_id text,
  p_interaction_type text,
  p_source text,
  p_content_hash text,
  p_turns jsonb,
  p_turn_count integer,
  p_fetch_status text
)
returns call_center.cma_transcript_evidence_cache
language plpgsql
security definer
set search_path = public, call_center
as $$
declare
  v_existing call_center.cma_transcript_evidence_cache;
  v_result call_center.cma_transcript_evidence_cache;
begin
  select * into v_existing
    from call_center.cma_transcript_evidence_cache
    where interaction_id = p_interaction_id
      and interaction_type = p_interaction_type;

  if v_existing.id is null then
    insert into call_center.cma_transcript_evidence_cache (
      interaction_id, interaction_type, source, content_hash, turns, turn_count, fetch_status,
      version, fetched_at, retention_expires_at
    ) values (
      p_interaction_id, p_interaction_type, p_source, p_content_hash, p_turns, p_turn_count, p_fetch_status,
      1, now(), now() + interval '30 days'
    )
    returning * into v_result;
  elsif v_existing.content_hash = p_content_hash then
    update call_center.cma_transcript_evidence_cache
      set fetched_at = now(),
          retention_expires_at = now() + interval '30 days',
          fetch_status = p_fetch_status
      where cma_transcript_evidence_cache.id = v_existing.id
      returning * into v_result;
  else
    update call_center.cma_transcript_evidence_cache
      set content_hash = p_content_hash,
          turns = p_turns,
          turn_count = p_turn_count,
          fetch_status = p_fetch_status,
          version = v_existing.version + 1,
          fetched_at = now(),
          retention_expires_at = now() + interval '30 days'
      where cma_transcript_evidence_cache.id = v_existing.id
      returning * into v_result;
  end if;

  return v_result;
end;
$$;

-- Manual retention cleanup — invoked by an operator (SQL editor or a
-- future admin control), never a new cron job (brief: "do not
-- introduce a new cron job").
create or replace function public.call_center_cma_transcript_cache_purge_expired()
returns integer
language plpgsql
security definer
set search_path = public, call_center
as $$
declare
  v_count integer;
begin
  delete from call_center.cma_transcript_evidence_cache where retention_expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.call_center_cma_transcript_cache_get from public, anon, authenticated;
revoke all on function public.call_center_cma_transcript_cache_upsert from public, anon, authenticated;
revoke all on function public.call_center_cma_transcript_cache_purge_expired from public, anon, authenticated;
grant execute on function public.call_center_cma_transcript_cache_get to service_role;
grant execute on function public.call_center_cma_transcript_cache_upsert to service_role;
grant execute on function public.call_center_cma_transcript_cache_purge_expired to service_role;
