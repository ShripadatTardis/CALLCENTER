-- Session 6 — CMA Conversation-Aware Measurement Foundation.
--
-- Persistence for the typed interaction-evidence contract
-- (src/server/cma/cmaEvidenceTypes.ts). Generalizes the provenance
-- shape call_center.automated_qa_evaluations already proved out
-- (finding + evidence + validation status + evaluator/version +
-- timestamps + supersession), for arbitrary CMA-relevant interaction
-- facts that are NOT QA parameters (e.g. escalation_reason) — QA's own
-- tables are untouched and remain QA-specific.
--
-- Same conventions as every prior session: uuid PK, timestamptz audit
-- columns, snake_case, plain text + check (not enums), deny-all RLS,
-- security definer RPCs under public.call_center_*, grant execute to
-- service_role only.
--
-- Written and validated in Session 6 against a disposable local
-- PostgreSQL cluster (see docs/SESSION_6_CMA_CONVERSATION_AWARE_FOUNDATION.md),
-- then explicitly authorized and applied to production in Session 6.1
-- (recorded in Supabase project dtbaczafdzgctkbqviod's migration
-- history as version 20261019041938, name
-- cma_interaction_evidence_foundation).

create table if not exists call_center.cma_interaction_evidence (
  id uuid primary key default gen_random_uuid(),
  interaction_id text not null,
  interaction_type text not null check (interaction_type in ('call', 'chat')),
  fact_id text not null,
  eligibility text not null check (eligibility in ('eligible', 'ineligible', 'indeterminate')),
  value jsonb,
  source_origin text check (source_origin in ('voiceforce_api', 'qa_evaluation', 'derived')),
  source_raw jsonb,
  evidence_refs text[] not null default '{}',
  validation_status text not null check (validation_status in ('validated', 'contradicted', 'insufficient', 'unresolved')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evaluation_method text not null check (evaluation_method in ('fast_path', 'verification_llm', 'derivation_deterministic', 'unresolved')),
  evaluator_version text not null,
  evaluated_at timestamptz not null default now(),
  -- Self-referencing supersession chain, same precedent as
  -- campaign_configuration_versions.previous_version_id — a new
  -- evaluation of the same (interaction_id, fact_id) never overwrites
  -- the prior row; it supersedes it explicitly and auditably.
  supersedes_evaluation_id uuid references call_center.cma_interaction_evidence(id),
  status text not null default 'active' check (status in ('active', 'superseded')),
  note text,
  created_at timestamptz not null default now()
);

-- Exactly one active finding per (interaction, fact) at a time —
-- re-evaluation must explicitly supersede the prior active row before
-- (or atomically with) inserting a new active one, never leave two
-- active findings for the same fact disagreeing silently.
create unique index if not exists cma_interaction_evidence_one_active_per_fact
  on call_center.cma_interaction_evidence (interaction_id, interaction_type, fact_id)
  where status = 'active';

create index if not exists cma_interaction_evidence_fact_idx on call_center.cma_interaction_evidence (fact_id, evaluated_at desc);
create index if not exists cma_interaction_evidence_interaction_idx on call_center.cma_interaction_evidence (interaction_id, interaction_type);

alter table call_center.cma_interaction_evidence enable row level security;
-- Deny-all RLS (no policies) — every access path is through the
-- security definer RPCs below.

-- =====================================================================
-- RPCs — public.call_center_cma_evidence_*
-- =====================================================================

-- Idempotent upsert: superseding the current active row (if any) and
-- inserting the new one happens in one transaction, so a caller never
-- observes a gap with zero active findings for a fact that already had
-- one. Re-submitting byte-identical inputs under the same
-- evaluator_version is intentionally NOT special-cased here — the
-- application layer's own computeEvidenceEvaluationId already makes
-- repeat submissions idempotent at the caller's level (brief §15); this
-- RPC's job is only to keep the supersession chain correct.
create or replace function public.call_center_cma_evidence_upsert(
  p_interaction_id text,
  p_interaction_type text,
  p_fact_id text,
  p_eligibility text,
  p_value jsonb,
  p_source_origin text,
  p_source_raw jsonb,
  p_evidence_refs text[],
  p_validation_status text,
  p_confidence numeric,
  p_evaluation_method text,
  p_evaluator_version text,
  p_note text
)
returns table (id uuid, superseded_id uuid)
language plpgsql
security definer
set search_path = public, call_center
as $$
declare
  v_prior_id uuid;
  v_new_id uuid;
begin
  select e.id into v_prior_id
    from call_center.cma_interaction_evidence e
    where e.interaction_id = p_interaction_id
      and e.interaction_type = p_interaction_type
      and e.fact_id = p_fact_id
      and e.status = 'active';

  if v_prior_id is not null then
    update call_center.cma_interaction_evidence set status = 'superseded' where cma_interaction_evidence.id = v_prior_id;
  end if;

  insert into call_center.cma_interaction_evidence (
    interaction_id, interaction_type, fact_id, eligibility, value, source_origin, source_raw,
    evidence_refs, validation_status, confidence, evaluation_method, evaluator_version,
    supersedes_evaluation_id, note
  ) values (
    p_interaction_id, p_interaction_type, p_fact_id, p_eligibility, p_value, p_source_origin, p_source_raw,
    coalesce(p_evidence_refs, '{}'), p_validation_status, p_confidence, p_evaluation_method, p_evaluator_version,
    v_prior_id, p_note
  )
  returning cma_interaction_evidence.id into v_new_id;

  return query select v_new_id, v_prior_id;
end;
$$;

create or replace function public.call_center_cma_evidence_get_active(
  p_interaction_id text,
  p_interaction_type text,
  p_fact_id text
)
returns setof call_center.cma_interaction_evidence
language sql
security definer
set search_path = public, call_center
as $$
  select * from call_center.cma_interaction_evidence
  where interaction_id = p_interaction_id
    and interaction_type = p_interaction_type
    and fact_id = p_fact_id
    and status = 'active';
$$;

revoke all on function public.call_center_cma_evidence_upsert from public, anon, authenticated;
revoke all on function public.call_center_cma_evidence_get_active from public, anon, authenticated;
grant execute on function public.call_center_cma_evidence_upsert to service_role;
grant execute on function public.call_center_cma_evidence_get_active to service_role;
