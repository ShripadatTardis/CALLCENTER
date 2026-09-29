-- Session R5: AI-Native Telemetry Foundation
-- docs/SESSION_R5_AI_NATIVE_TELEMETRY_FOUNDATION.md
--
-- interaction_events: FACTS about what happened during an AI
-- interaction (tool calls, authentication, knowledge retrieval,
-- fallback, guardrail interventions, escalation, human transfer,
-- intent detection). Never a calculated ratio/rate/aggregate — that
-- belongs entirely to the Ratio Service layer (R6+), never this table.
--
-- Same access model as every other call_center domain: the schema
-- itself is not exposed via PostgREST; the only access path is a set
-- of public.call_center_events_* SECURITY DEFINER functions, each
-- locked to service_role only by the same blanket grant loop every
-- prior migration in this project uses.
--
-- interaction_id is deliberately `text`, NOT a foreign key to
-- call_center.customer_interactions.id — mirrors
-- customer_interactions.interaction_id's own existing convention (a
-- text external identity, not a hard FK) exactly, because AI-execution
-- events can legitimately arrive before or during a call, ahead of
-- customer_interactions' own async reconciliation materializing that
-- row. Correlation happens at query time, not via a required FK.

create table if not exists call_center.interaction_events (
  event_id text primary key,
  interaction_id text not null,
  event_time timestamptz not null,
  event_type text not null check (event_type in (
    'intent_detected', 'authentication', 'knowledge_retrieval', 'tool_call',
    'fallback', 'conversation_recovery', 'guardrail_intervention', 'escalation', 'human_transfer'
  )),
  event_name text,
  -- null = "not applicable to this event type" (e.g. escalation,
  -- guardrail_intervention) - a future ratio calculator must treat null
  -- as excluded-from-eligibility, never coerced to false. See
  -- src/types/interactionEvent.ts's InteractionEventSuccess doc comment.
  success boolean,
  error_code text,
  error_message text,
  latency_ms int check (latency_ms is null or latency_ms >= 0),
  tool_name text,
  provider text,
  model text,
  -- Extensible provider/tool-specific payload only - never a first-class
  -- dimension a Ratio would need to filter/group by (those get their
  -- own column), and never a transcript body (existing transcript/
  -- session storage remains authoritative for conversation evidence).
  metadata jsonb,
  ingested_at timestamptz not null default now()
);

-- Matches the exact three access patterns InteractionEventRepository
-- needs (§8): by interaction, by event_time-ordered range, and by
-- type/tool/success for future filtered aggregation.
create index if not exists interaction_events_interaction_id_event_time_idx
  on call_center.interaction_events(interaction_id, event_time);
create index if not exists interaction_events_event_type_event_time_idx
  on call_center.interaction_events(event_type, event_time);
create index if not exists interaction_events_tool_name_idx
  on call_center.interaction_events(tool_name) where tool_name is not null;

alter table call_center.interaction_events enable row level security;

-- ---------------------------------------------------------------------
-- Access functions (public schema, SECURITY DEFINER, service_role only)
-- ---------------------------------------------------------------------

-- Idempotent on event_id (§10) - a repeat delivery of the same event_id
-- is a genuine no-op: `on conflict do nothing`, and the function reports
-- back whether it actually inserted a new row or matched an existing
-- one, so the caller can distinguish "accepted, new" from "accepted,
-- already had this" without a separate lookup round-trip.
create or replace function public.call_center_events_append(
  p_event_id text, p_interaction_id text, p_event_time timestamptz, p_event_type text,
  p_event_name text, p_success boolean, p_error_code text, p_error_message text,
  p_latency_ms int, p_tool_name text, p_provider text, p_model text, p_metadata jsonb,
  p_ingested_at timestamptz
) returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
declare
  v_row call_center.interaction_events;
  v_was_insert boolean;
begin
  insert into call_center.interaction_events as e (
    event_id, interaction_id, event_time, event_type, event_name, success,
    error_code, error_message, latency_ms, tool_name, provider, model, metadata, ingested_at
  ) values (
    p_event_id, p_interaction_id, p_event_time, p_event_type, p_event_name, p_success,
    p_error_code, p_error_message, p_latency_ms, p_tool_name, p_provider, p_model, p_metadata, p_ingested_at
  )
  on conflict (event_id) do nothing
  returning e.* into v_row;

  if v_row.event_id is null then
    v_was_insert := false;
    select * into v_row from call_center.interaction_events where event_id = p_event_id;
  else
    v_was_insert := true;
  end if;

  return jsonb_build_object('event', to_jsonb(v_row), 'wasInsert', v_was_insert);
end;
$$;

create or replace function public.call_center_events_get_for_interaction(p_interaction_id text)
returns setof call_center.interaction_events language sql security definer set search_path = call_center, pg_temp as $$
  select * from call_center.interaction_events
    where interaction_id = p_interaction_id
    order by event_time asc;
$$;

-- Generic filtered query for future Ratio aggregation (R6). No
-- pagination/cap decision made here - that's the AggregationProvider
-- layer's job, exactly like callPopulationFetcher.ts today.
create or replace function public.call_center_events_query(
  p_interaction_id text, p_event_type text, p_tool_name text, p_success boolean,
  p_event_time_from timestamptz, p_event_time_to timestamptz
) returns setof call_center.interaction_events language sql security definer set search_path = call_center, pg_temp as $$
  select * from call_center.interaction_events
    where (p_interaction_id is null or interaction_id = p_interaction_id)
      and (p_event_type is null or event_type = p_event_type)
      and (p_tool_name is null or tool_name = p_tool_name)
      and (p_success is null or success = p_success)
      and (p_event_time_from is null or event_time >= p_event_time_from)
      and (p_event_time_to is null or event_time <= p_event_time_to)
    order by event_time asc;
$$;

-- ---------------------------------------------------------------------
-- Lock down every new function the same way as every prior migration.
-- ---------------------------------------------------------------------
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
