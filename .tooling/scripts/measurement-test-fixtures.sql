-- Session 4D — Part C controlled test-data fixtures.
--
-- Deterministic, idempotent synthetic data for verifying CMA calculation
-- accuracy against independently hand-computed expected results (see
-- docs/VOICEFORCE_MEASUREMENT_TEST_DATA_PLAN.md for the full scenario
-- list and expected-value tables this fixture realizes).
--
-- SAFETY: this file is for a disposable PostgreSQL instance ONLY. It has
-- never been run against production and must never be. Every fixture
-- row is tagged so it can be identified and removed by
-- measurement-test-fixtures-cleanup.sql — agent_id/campaign name/
-- interaction_id values all carry an 'fx_' prefix, and every table this
-- file touches is cleaned up by matching that prefix (see the companion
-- cleanup script).
--
-- Anchor window: [2026-06-01T00:00:00Z, 2026-06-02T00:00:00Z) — a
-- synthetic date chosen because it cannot collide with this project's
-- real data (which spans Sept-Oct 2026).
--
-- Idempotent: deletes any pre-existing fx_-tagged rows first, so this
-- file can be re-run any number of times without duplicating records.

begin;

-- ===================================================================
-- Cleanup any prior run's fixture rows first (same tag the standalone
-- cleanup script uses) so this file is safely re-runnable on its own.
-- ===================================================================
delete from call_center.action_items where agent_id like 'fx_%';
delete from call_center.chat_sessions where upstream_session_id like 'fx_%';
-- campaign_targets.effective_result_id -> campaign_results is a circular FK; null it
-- out before campaign_results rows can be deleted.
update call_center.campaign_targets set effective_result_id = null
  where campaign_id in (select id from call_center.campaigns where name like 'fx_%');
delete from call_center.campaign_results where campaign_result_code like 'fx_%';
delete from call_center.campaign_executions where id in (
  select ce.id from call_center.campaign_executions ce
  join call_center.campaign_targets ct on ct.id = ce.campaign_target_id
  join call_center.campaigns c on c.id = ct.campaign_id
  where c.name like 'fx_%'
);
delete from call_center.campaign_targets where campaign_id in (select id from call_center.campaigns where name like 'fx_%');
delete from call_center.campaigns where name like 'fx_%';
delete from call_center.campaign_classifications where code like 'fx_%';
delete from call_center.automated_qa_observations where evaluation_id in (select id from call_center.automated_qa_evaluations where interaction_id like 'fx_%');
delete from call_center.automated_qa_evaluations where interaction_id like 'fx_%';
delete from call_center.qa_findings where review_id in (select id from call_center.qa_reviews where interaction_id like 'fx_%');
delete from call_center.qa_reviews where interaction_id like 'fx_%';
delete from call_center.customer_interactions where interaction_id like 'fx_%';
delete from call_center.customer_contact_points where normalized_value like 'fx_%';
delete from call_center.customers where source_customer_ref like 'fx_%';
delete from call_center.user_profiles where email like 'fx_%';

-- ===================================================================
-- PART 0 — shared dummy rows required by NOT NULL FKs.
-- ===================================================================

insert into call_center.user_profiles (id, identity_provider, identity_subject, email, status)
values ('f1000000-0000-4000-8000-000000000001', 'supabase_auth', 'fx_subject', 'fx_fixture_user@example.invalid', 'active');

insert into call_center.customers (id, source_customer_ref)
values
  ('f1000000-0000-4000-8000-000000000011', 'fx_customer_repeat'),  -- used by R6/R7 (repeat contact)
  ('f1000000-0000-4000-8000-000000000012', 'fx_customer_campaign');

insert into call_center.customer_contact_points (id, customer_id, type, raw_value, normalized_value, is_primary, first_seen, last_seen)
values
  ('f1000000-0000-4000-8000-000000000021', 'f1000000-0000-4000-8000-000000000011', 'phone', 'fx_phone_repeat', 'fx_phone_repeat', true, now(), now()),
  ('f1000000-0000-4000-8000-000000000022', 'f1000000-0000-4000-8000-000000000012', 'phone', 'fx_phone_campaign', 'fx_phone_campaign', true, now(), now());

-- ===================================================================
-- PART 1 — voice interactions (CANON-RES-RATE / -AUTH-SUCCESS-RATE /
-- -SUCCESSFUL-RES-TIME / -AVG-SENT-SCORE / -INTENT-CONFIDENCE).
-- Agents: fx_agent_a, fx_agent_b (authorized in the scope test),
-- fx_agent_c (deliberately unauthorized).
-- ===================================================================

insert into call_center.customer_interactions
  (id, interaction_id, channel, agent_id, started_at, outcome, duration_seconds, sentiment_score, intent_confidence, was_authenticated, escalation_trigger, customer_id, recording_available, source, ingested_at)
values
  -- fx_agent_a (R1-R8)
  ('f2000000-0000-4000-8000-000000000001', 'fx_r1', 'voice', 'fx_agent_a', '2026-06-01T01:00:00Z', 'resolved',  180,   0.8,  0.90, true,  null, null, false, 'call-data', now()),
  ('f2000000-0000-4000-8000-000000000002', 'fx_r2', 'voice', 'fx_agent_a', '2026-06-01T02:00:00Z', 'resolved',  240,   0.6,  0.85, true,  null, null, false, 'call-data', now()),
  ('f2000000-0000-4000-8000-000000000003', 'fx_r3', 'voice', 'fx_agent_a', '2026-06-01T03:00:00Z', 'escalated', 20000, 0.1,  0.20, false, 'customer requested supervisor', null, false, 'call-data', now()),
  ('f2000000-0000-4000-8000-000000000004', 'fx_r4', 'voice', 'fx_agent_a', '2026-06-01T04:00:00Z', 'escalated', 300,   null, null, null,  null, null, false, 'call-data', now()),
  ('f2000000-0000-4000-8000-000000000005', 'fx_r5', 'voice', 'fx_agent_a', '2026-06-01T05:00:00Z', null,        150,   0.5,  0.60, true,  null, null, false, 'call-data', now()),
  ('f2000000-0000-4000-8000-000000000006', 'fx_r6', 'voice', 'fx_agent_a', '2026-06-01T06:00:00Z', 'resolved',  100,   0.4,  0.50, true,  null, 'f1000000-0000-4000-8000-000000000011', false, 'call-data', now()),
  ('f2000000-0000-4000-8000-000000000007', 'fx_r7', 'voice', 'fx_agent_a', '2026-06-01T06:30:00Z', 'resolved',  120,   0.3,  0.40, true,  null, 'f1000000-0000-4000-8000-000000000011', false, 'call-data', now()),
  ('f2000000-0000-4000-8000-000000000008', 'fx_r8', 'voice', 'fx_agent_a', '2026-06-01T00:00:00Z', 'resolved',  160,   0.9,  0.95, true,  null, null, false, 'call-data', now()), -- window START boundary (inclusive)
  -- fx_agent_b (R9-R10)
  ('f2000000-0000-4000-8000-000000000009', 'fx_r9',  'voice', 'fx_agent_b', '2026-06-01T07:00:00Z', 'resolved', 200, 0.7, 0.75, true, null, null, false, 'call-data', now()),
  ('f2000000-0000-4000-8000-00000000000a', 'fx_r10', 'voice', 'fx_agent_b', '2026-06-02T00:00:00Z', 'resolved', 100, 0.5, 0.50, true, null, null, false, 'call-data', now()), -- window END boundary (must be EXCLUDED, half-open)
  -- fx_agent_c (R11-R12) — unauthorized in the scope test
  ('f2000000-0000-4000-8000-00000000000b', 'fx_r11', 'voice', 'fx_agent_c', '2026-06-01T08:00:00Z', 'resolved',  100, 0.5, 0.5, true, null, null, false, 'call-data', now()),
  ('f2000000-0000-4000-8000-00000000000c', 'fx_r12', 'voice', 'fx_agent_c', '2026-06-01T09:00:00Z', 'escalated', 300, 0.2, 0.3, true, null, null, false, 'call-data', now()),
  -- null-agent row (must never appear in a groupBy:'agent' breakdown)
  ('f2000000-0000-4000-8000-00000000000d', 'fx_r13', 'voice', null, '2026-06-01T10:00:00Z', 'resolved', 100, 0.5, 0.5, true, null, null, false, 'call-data', now());

-- ===================================================================
-- PART 2 — QA fixtures (CANON-CONTEXT-CONTINUITY-RATE, turn-shape;
-- CANON-REPETITION-LOOP-RATE, review-shape). Human QA (qa_reviews/
-- qa_findings) and Automated QA (automated_qa_evaluations/
-- automated_qa_observations), channel voice, same window.
-- ===================================================================

-- Human QA — context_continuity_rate: H1=PASS, H2=FAIL, H3=N_A (all submitted); H4=PASS but NOT submitted (draft, must be excluded entirely).
insert into call_center.qa_reviews (id, interaction_id, channel, agent_id, reviewer_user_id, status, started_at, contract_version)
values
  ('f3000000-0000-4000-8000-000000000001', 'fx_qa_h1', 'voice', 'fx_agent_a', 'f1000000-0000-4000-8000-000000000001', 'submitted',   '2026-06-01T01:00:00Z', 'fx_v1'),
  ('f3000000-0000-4000-8000-000000000002', 'fx_qa_h2', 'voice', 'fx_agent_a', 'f1000000-0000-4000-8000-000000000001', 'submitted',   '2026-06-01T02:00:00Z', 'fx_v1'),
  ('f3000000-0000-4000-8000-000000000003', 'fx_qa_h3', 'voice', 'fx_agent_a', 'f1000000-0000-4000-8000-000000000001', 'submitted',   '2026-06-01T03:00:00Z', 'fx_v1'),
  ('f3000000-0000-4000-8000-000000000004', 'fx_qa_h4', 'voice', 'fx_agent_a', 'f1000000-0000-4000-8000-000000000001', 'in_progress', '2026-06-01T04:00:00Z', 'fx_v1'),
  -- repetition_loop_rate review-shape fixtures: review X=ISSUE, review Y=NO_ISSUE
  ('f3000000-0000-4000-8000-000000000005', 'fx_qa_hx', 'voice', 'fx_agent_a', 'f1000000-0000-4000-8000-000000000001', 'submitted', '2026-06-01T05:00:00Z', 'fx_v1'),
  ('f3000000-0000-4000-8000-000000000006', 'fx_qa_hy', 'voice', 'fx_agent_a', 'f1000000-0000-4000-8000-000000000001', 'submitted', '2026-06-01T06:00:00Z', 'fx_v1');

insert into call_center.qa_findings (id, review_id, parameter_code, value, primary_turn_id)
values
  ('f3000000-0000-4000-8000-000000000011', 'f3000000-0000-4000-8000-000000000001', 'context_continuity_rate', 'PASS', 'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000012', 'f3000000-0000-4000-8000-000000000002', 'context_continuity_rate', 'FAIL', 'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000013', 'f3000000-0000-4000-8000-000000000003', 'context_continuity_rate', 'N_A',  'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000014', 'f3000000-0000-4000-8000-000000000004', 'context_continuity_rate', 'PASS', 'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000015', 'f3000000-0000-4000-8000-000000000005', 'repetition_loop_rate', 'ISSUE',    'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000016', 'f3000000-0000-4000-8000-000000000006', 'repetition_loop_rate', 'NO_ISSUE', 'fx_turn_1');

-- Automated QA — context_continuity_rate: A1=PASS (completed), A2=N_A (completed), A3=PASS but status='running' (must be excluded entirely).
insert into call_center.automated_qa_evaluations
  (id, interaction_id, channel, agent_id, status, initiated_by, prompt_version, contract_version, schema_version, request_ids, transcript_snapshot, transcript_hash, evaluated_turn_ids, uncovered_turn_ids, unassessable_parameters, evaluation_completeness, window_count, started_at)
values
  ('f3000000-0000-4000-8000-000000000021', 'fx_qa_a1', 'voice', 'fx_agent_a', 'completed', 'f1000000-0000-4000-8000-000000000001', 'fx_p1', 'fx_v1', 'fx_s1', '{}'::jsonb, '{}'::jsonb, 'fx_hash1', '{}'::text[], '{}'::text[], '{}'::jsonb, 'COMPLETE', 1, '2026-06-01T01:00:00Z'),
  ('f3000000-0000-4000-8000-000000000022', 'fx_qa_a2', 'voice', 'fx_agent_a', 'completed', 'f1000000-0000-4000-8000-000000000001', 'fx_p1', 'fx_v1', 'fx_s1', '{}'::jsonb, '{}'::jsonb, 'fx_hash2', '{}'::text[], '{}'::text[], '{}'::jsonb, 'COMPLETE', 1, '2026-06-01T02:00:00Z'),
  ('f3000000-0000-4000-8000-000000000023', 'fx_qa_a3', 'voice', 'fx_agent_a', 'running',   'f1000000-0000-4000-8000-000000000001', 'fx_p1', 'fx_v1', 'fx_s1', '{}'::jsonb, '{}'::jsonb, 'fx_hash3', '{}'::text[], '{}'::text[], '{}'::jsonb, 'COMPLETE', 1, '2026-06-01T03:00:00Z'),
  -- repetition_loop_rate review-shape fixtures: eval P=ISSUE, eval Q=NO_ISSUE
  ('f3000000-0000-4000-8000-000000000024', 'fx_qa_ap', 'voice', 'fx_agent_a', 'completed', 'f1000000-0000-4000-8000-000000000001', 'fx_p1', 'fx_v1', 'fx_s1', '{}'::jsonb, '{}'::jsonb, 'fx_hash4', '{}'::text[], '{}'::text[], '{}'::jsonb, 'COMPLETE', 1, '2026-06-01T04:00:00Z'),
  ('f3000000-0000-4000-8000-000000000025', 'fx_qa_aq', 'voice', 'fx_agent_a', 'completed', 'f1000000-0000-4000-8000-000000000001', 'fx_p1', 'fx_v1', 'fx_s1', '{}'::jsonb, '{}'::jsonb, 'fx_hash5', '{}'::text[], '{}'::text[], '{}'::jsonb, 'COMPLETE', 1, '2026-06-01T05:00:00Z');

insert into call_center.automated_qa_observations (id, evaluation_id, parameter_code, value, primary_turn_id)
values
  ('f3000000-0000-4000-8000-000000000031', 'f3000000-0000-4000-8000-000000000021', 'context_continuity_rate', 'PASS', 'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000032', 'f3000000-0000-4000-8000-000000000022', 'context_continuity_rate', 'N_A',  'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000033', 'f3000000-0000-4000-8000-000000000023', 'context_continuity_rate', 'PASS', 'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000034', 'f3000000-0000-4000-8000-000000000024', 'repetition_loop_rate', 'ISSUE',    'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000035', 'f3000000-0000-4000-8000-000000000025', 'repetition_loop_rate', 'NO_ISSUE', 'fx_turn_1');

-- ---------------------------------------------------------------------
-- PART 2b — the remaining 7 QA measures, scored onto the SAME existing
-- review/evaluation records above (H1/H2/H3/H4, A1/A2/A3 for the 6
-- turn-shape parameters; review X/Y and eval P/Q for the 1 additional
-- review-shape parameter) rather than new records — one real QA
-- review/evaluation typically scores multiple parameters at once, and
-- this reuses the exact same submitted/draft/completed/running status
-- mix already proven to exercise the status-filter exclusions correctly.
-- H4 and A3 deliberately get NO new rows here (they stay excluded by
-- the qa_reviews.status/automated_qa_evaluations.status filter
-- regardless of parameter_code).
-- ---------------------------------------------------------------------

-- Turn-shape, PASS-target (followup_understanding_rate / task_progression_rate / reference_resolution_accuracy):
-- H1=PASS (hit), H2=FAIL (eligible, not hit), H3=N_A (ineligible). A1=PASS (hit), A2=N_A (ineligible).
insert into call_center.qa_findings (id, review_id, parameter_code, value, primary_turn_id)
values
  ('f3000000-0000-4000-8000-000000000101', 'f3000000-0000-4000-8000-000000000001', 'followup_understanding_rate', 'PASS', 'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000102', 'f3000000-0000-4000-8000-000000000002', 'followup_understanding_rate', 'FAIL', 'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000103', 'f3000000-0000-4000-8000-000000000003', 'followup_understanding_rate', 'N_A',  'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000104', 'f3000000-0000-4000-8000-000000000001', 'task_progression_rate', 'PASS', 'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000105', 'f3000000-0000-4000-8000-000000000002', 'task_progression_rate', 'FAIL', 'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000106', 'f3000000-0000-4000-8000-000000000003', 'task_progression_rate', 'N_A',  'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000107', 'f3000000-0000-4000-8000-000000000001', 'reference_resolution_accuracy', 'PASS', 'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000108', 'f3000000-0000-4000-8000-000000000002', 'reference_resolution_accuracy', 'FAIL', 'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000109', 'f3000000-0000-4000-8000-000000000003', 'reference_resolution_accuracy', 'N_A',  'fx_turn_1'),
  -- response_grounding_rate: target GROUNDED, non-target eligible NOT_GROUNDED
  ('f3000000-0000-4000-8000-000000000110', 'f3000000-0000-4000-8000-000000000001', 'response_grounding_rate', 'GROUNDED',     'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000111', 'f3000000-0000-4000-8000-000000000002', 'response_grounding_rate', 'NOT_GROUNDED', 'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000112', 'f3000000-0000-4000-8000-000000000003', 'response_grounding_rate', 'N_A',          'fx_turn_1'),
  -- conversation_recovery_rate: target SUCCESSFUL, non-target eligible UNSUCCESSFUL
  ('f3000000-0000-4000-8000-000000000113', 'f3000000-0000-4000-8000-000000000001', 'conversation_recovery_rate', 'SUCCESSFUL',   'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000114', 'f3000000-0000-4000-8000-000000000002', 'conversation_recovery_rate', 'UNSUCCESSFUL', 'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000115', 'f3000000-0000-4000-8000-000000000003', 'conversation_recovery_rate', 'N_A',          'fx_turn_1'),
  -- unnecessary_clarification_rate (lower-is-better): target/numerator value is ISSUE itself, so H1=ISSUE (hit), H2=NO_ISSUE (eligible, not hit)
  ('f3000000-0000-4000-8000-000000000116', 'f3000000-0000-4000-8000-000000000001', 'unnecessary_clarification_rate', 'ISSUE',    'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000117', 'f3000000-0000-4000-8000-000000000002', 'unnecessary_clarification_rate', 'NO_ISSUE', 'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000118', 'f3000000-0000-4000-8000-000000000003', 'unnecessary_clarification_rate', 'N_A',      'fx_turn_1'),
  -- customer_correction_rate (review-shape, lower-is-better, target ISSUE) — scored on the SAME review-shape pair used for repetition_loop_rate
  ('f3000000-0000-4000-8000-000000000119', 'f3000000-0000-4000-8000-000000000005', 'customer_correction_rate', 'ISSUE',    'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000120', 'f3000000-0000-4000-8000-000000000006', 'customer_correction_rate', 'NO_ISSUE', 'fx_turn_1');

insert into call_center.automated_qa_observations (id, evaluation_id, parameter_code, value, primary_turn_id)
values
  ('f3000000-0000-4000-8000-000000000201', 'f3000000-0000-4000-8000-000000000021', 'followup_understanding_rate', 'PASS', 'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000202', 'f3000000-0000-4000-8000-000000000022', 'followup_understanding_rate', 'N_A',  'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000203', 'f3000000-0000-4000-8000-000000000021', 'task_progression_rate', 'PASS', 'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000204', 'f3000000-0000-4000-8000-000000000022', 'task_progression_rate', 'N_A',  'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000205', 'f3000000-0000-4000-8000-000000000021', 'reference_resolution_accuracy', 'PASS', 'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000206', 'f3000000-0000-4000-8000-000000000022', 'reference_resolution_accuracy', 'N_A',  'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000207', 'f3000000-0000-4000-8000-000000000021', 'response_grounding_rate', 'GROUNDED', 'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000208', 'f3000000-0000-4000-8000-000000000022', 'response_grounding_rate', 'N_A',      'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000209', 'f3000000-0000-4000-8000-000000000021', 'conversation_recovery_rate', 'SUCCESSFUL', 'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000210', 'f3000000-0000-4000-8000-000000000022', 'conversation_recovery_rate', 'N_A',        'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000211', 'f3000000-0000-4000-8000-000000000021', 'unnecessary_clarification_rate', 'ISSUE', 'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000212', 'f3000000-0000-4000-8000-000000000022', 'unnecessary_clarification_rate', 'N_A',   'fx_turn_1'),
  -- customer_correction_rate — scored on the SAME review-shape pair (eval P/Q) used for repetition_loop_rate
  ('f3000000-0000-4000-8000-000000000213', 'f3000000-0000-4000-8000-000000000024', 'customer_correction_rate', 'ISSUE',    'fx_turn_1'),
  ('f3000000-0000-4000-8000-000000000214', 'f3000000-0000-4000-8000-000000000025', 'customer_correction_rate', 'NO_ISSUE', 'fx_turn_1');

-- ===================================================================
-- PART 3 — campaign fixtures (CANON-CAMPAIGN-TARGET-COUNT /
-- -SUCCESS-COUNT-RATE-RAW-CLASSIFI / -SUCCESS-COUNT-RATE-POLICY-CLASS).
-- C1: 3 targets (1 raw+policy success, 1 raw failure, 1 unclassified).
-- C2: 2 targets (1 raw success no policy, 1 unclassified).
-- ===================================================================

insert into call_center.campaign_classifications (code, label, is_success, is_fallback_unresolved, sort_order, active)
values ('fx_class_success', 'Fixture Success', true, false, 1, true);

insert into call_center.campaigns (id, name, agent_id, status)
values
  ('f4000000-0000-4000-8000-000000000001', 'fx_campaign_1', 'fx_agent_a', 'running'),
  ('f4000000-0000-4000-8000-000000000002', 'fx_campaign_2', 'fx_agent_a', 'running');

insert into call_center.campaign_targets (id, campaign_id, customer_id, contact_point_id, status, created_at)
values
  ('f4000000-0000-4000-8000-000000000011', 'f4000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000012', 'f1000000-0000-4000-8000-000000000022', 'completed', '2026-06-01T00:00:00Z'), -- T1: raw+policy success
  ('f4000000-0000-4000-8000-000000000012', 'f4000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000012', 'f1000000-0000-4000-8000-000000000022', 'completed', '2026-06-01T00:00:00Z'), -- T2: raw failure
  ('f4000000-0000-4000-8000-000000000013', 'f4000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000012', 'f1000000-0000-4000-8000-000000000022', 'pending',   '2026-06-01T00:00:00Z'), -- T3: unclassified
  ('f4000000-0000-4000-8000-000000000014', 'f4000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000012', 'f1000000-0000-4000-8000-000000000022', 'completed', '2026-06-01T00:00:00Z'), -- T4: raw success, no policy
  ('f4000000-0000-4000-8000-000000000015', 'f4000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000012', 'f1000000-0000-4000-8000-000000000022', 'pending',   '2026-06-01T00:00:00Z'); -- T5: unclassified

insert into call_center.campaign_executions (id, campaign_target_id, sequence, status, reconciliation_status)
values
  ('f4000000-0000-4000-8000-000000000021', 'f4000000-0000-4000-8000-000000000011', 1, 'triggered', 'reconciled'),
  ('f4000000-0000-4000-8000-000000000022', 'f4000000-0000-4000-8000-000000000012', 1, 'triggered', 'reconciled'),
  ('f4000000-0000-4000-8000-000000000023', 'f4000000-0000-4000-8000-000000000014', 1, 'triggered', 'reconciled');

insert into call_center.campaign_results (id, campaign_execution_id, campaign_target_id, campaign_result_code, campaign_result_label, result_source, result_recorded_at, is_success, campaign_classification_code, classification_contract_drift)
values
  ('f4000000-0000-4000-8000-000000000031', 'f4000000-0000-4000-8000-000000000021', 'f4000000-0000-4000-8000-000000000011', 'fx_success', 'Fixture Success', 'fixture', '2026-06-01T00:30:00Z', true,  'fx_class_success', false), -- T1's result
  ('f4000000-0000-4000-8000-000000000032', 'f4000000-0000-4000-8000-000000000022', 'f4000000-0000-4000-8000-000000000012', 'fx_fail',    'Fixture Failure', 'fixture', '2026-06-01T00:30:00Z', false, null,               false), -- T2's result
  ('f4000000-0000-4000-8000-000000000033', 'f4000000-0000-4000-8000-000000000023', 'f4000000-0000-4000-8000-000000000014', 'fx_success', 'Fixture Success', 'fixture', '2026-06-01T00:30:00Z', true,  null,               false); -- T4's result

update call_center.campaign_targets set effective_result_id = 'f4000000-0000-4000-8000-000000000031' where id = 'f4000000-0000-4000-8000-000000000011';
update call_center.campaign_targets set effective_result_id = 'f4000000-0000-4000-8000-000000000032' where id = 'f4000000-0000-4000-8000-000000000012';
update call_center.campaign_targets set effective_result_id = 'f4000000-0000-4000-8000-000000000033' where id = 'f4000000-0000-4000-8000-000000000014';

-- ===================================================================
-- PART 4 — chat fixtures (CANON-CHAT-SESSION-SPAN).
-- NOTE: `chat_sessions.last_activity_at` is NOT NULL in the real,
-- current schema (confirmed via information_schema, not assumed) —
-- despite the RPC's own defensive `last_activity_at is not null`
-- filter, a row with a genuinely missing end time cannot exist in this
-- schema today. Per this session's brief ("for cases needing
-- unavailable source facts, explicitly mark them as future test
-- scenarios rather than forcing synthetic fields into the current
-- schema"), that specific scenario is NOT fixtured here — see
-- docs/VOICEFORCE_MEASUREMENT_TEST_DATA_PLAN.md's "known unavailable
-- scenarios" section.
-- ===================================================================

insert into call_center.chat_sessions (id, upstream_session_id, agent_id, started_at, last_activity_at, status, message_count)
values
  ('f5000000-0000-4000-8000-000000000001', 'fx_chat_1', 'fx_agent_a', '2026-06-01T01:00:00Z', '2026-06-01T01:02:00Z', 'completed', 4), -- span 120s
  ('f5000000-0000-4000-8000-000000000002', 'fx_chat_2', 'fx_agent_a', '2026-06-01T02:00:00Z', '2026-06-01T02:03:00Z', 'completed', 6); -- span 180s

-- ===================================================================
-- PART 5 — action item fixtures (CANON-ACTION-REQUIRED-QUEUE-ITEMS).
-- 4 rows for fx_agent_a; 2 belong to fx_campaign_1, 2 have no campaign.
-- ===================================================================

insert into call_center.action_items (id, source_interaction_type, source_interaction_id, signal_type, agent_id, campaign_id, reason_code, status, created_at)
values
  ('f6000000-0000-4000-8000-000000000001', 'call', 'fx_r1', 'escalation', 'fx_agent_a', 'f4000000-0000-4000-8000-000000000001', 'escalation_reason_unavailable', 'open', '2026-06-01T01:00:00Z'),
  ('f6000000-0000-4000-8000-000000000002', 'call', 'fx_r2', 'escalation', 'fx_agent_a', 'f4000000-0000-4000-8000-000000000001', 'escalation_reason_unavailable', 'open', '2026-06-01T02:00:00Z'),
  ('f6000000-0000-4000-8000-000000000003', 'call', 'fx_r3', 'escalation', 'fx_agent_a', null, 'escalation_reason_unavailable', 'open', '2026-06-01T03:00:00Z'),
  ('f6000000-0000-4000-8000-000000000004', 'call', 'fx_r4', 'escalation', 'fx_agent_a', null, 'escalation_reason_unavailable', 'open', '2026-06-01T04:00:00Z');

commit;
