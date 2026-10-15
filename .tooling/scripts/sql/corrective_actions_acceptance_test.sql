-- Session 16.5 — Corrective Action Management: database-backed
-- acceptance test (brief "Final Acceptance Preparation" step 5).
--
-- WHEN TO RUN: only AFTER
-- supabase/migrations/20261022000000_corrective_action_management.sql
-- has been applied to the target database. Not part of that migration
-- itself, and never applied automatically.
--
-- HOW TO RUN: as a single script, e.g.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f .tooling/scripts/sql/corrective_actions_acceptance_test.sql
-- or paste the whole file into the Supabase SQL editor and run it once.
--
-- SAFETY: everything below runs inside ONE transaction that ends with
-- an explicit ROLLBACK, whether every assertion passes or not. It
-- creates only its own temporary fixtures (two throwaway roles, three
-- throwaway user_profiles rows, and whatever corrective_actions/
-- groups/verifications/activities those fixtures touch) and leaves
-- NO residue in the database either way — a failed assertion aborts
-- the transaction (same net effect as the explicit rollback at the
-- end), and `plpgsql`'s `assert` surfaces the exact failing check by
-- name in the error message/NOTICE stream.
--
-- WHAT THIS COVERS (brief step 5, all ten bullets):
--   A. Manual CA creation (valid, missing fields, idempotent resubmit,
--      out-of-scope agent_id at creation)
--   B. Assignment and ownership (take-ownership, manage-any reassign,
--      non-manage-any blocked from reassigning someone else's, eligible
--      assignee enforcement via real role/agent-scope rows)
--   C. Lifecycle transitions (valid chain, invalid transition rejected,
--      cancellation requires a reason, administrative closure requires
--      manage-any + a reason)
--   D. Group linking/unlinking (transactional link, already-in-another-
--      group rejected with NOTHING written, unlink)
--   E. Common correction (record_correction never changes status)
--   F. Individual verification (passed closes; failed does not)
--   G. Bulk verification and closure (every selected CA gets its own
--      verification row + outcome; an ineligible id in the batch fails
--      independently without aborting the others)
--   H. Invalid transitions (direct open -> closed rejected)
--   I. Authorization failures (ownership_required, assignment_not_permitted)
--   J. Data-scope isolation (an out-of-scope CA is invisible to get/
--      list/update/assign/set_status/verify — reported as not-found,
--      never a different error that would leak existence)

begin;

-- ---------------------------------------------------------------------
-- Fixtures: two throwaway roles with disjoint Agent Scope, three
-- throwaway users. Nothing here is referenced by any real application
-- code — role codes are namespaced "zz_ca_test_*" to make accidental
-- collision with a real role obvious if this script is ever run
-- against a database that already has one.
-- ---------------------------------------------------------------------
create temporary table ca_test_ctx (key text primary key, value text) on commit drop;

insert into call_center.roles (code, label) values
  ('zz_ca_test_role_a', 'CA acceptance test — scope A'),
  ('zz_ca_test_role_b', 'CA acceptance test — scope B');

insert into call_center.role_agent_scope (role_code, all_agents) values
  ('zz_ca_test_role_a', false),
  ('zz_ca_test_role_b', false);

insert into call_center.role_agent_scope_items (role_code, agent_id) values
  ('zz_ca_test_role_a', 'zz-ca-test-agent-1'),
  ('zz_ca_test_role_b', 'zz-ca-test-agent-2');

insert into call_center.user_profiles (identity_provider, identity_subject, email, display_name, status)
values
  ('ca_test', 'ca-test-user-a', 'ca-test-user-a@test.invalid', 'CA Test User A (scope: agent-1)', 'active'),
  ('ca_test', 'ca-test-user-b', 'ca-test-user-b@test.invalid', 'CA Test User B (scope: agent-1)', 'active'),
  ('ca_test', 'ca-test-user-c', 'ca-test-user-c@test.invalid', 'CA Test User C (scope: agent-2, disjoint)', 'active');

insert into ca_test_ctx (key, value)
select 'user_a', id::text from call_center.user_profiles where identity_subject = 'ca-test-user-a'
union all select 'user_b', id::text from call_center.user_profiles where identity_subject = 'ca-test-user-b'
union all select 'user_c', id::text from call_center.user_profiles where identity_subject = 'ca-test-user-c';

insert into call_center.user_roles (user_id, role_code) values
  ((select value::uuid from ca_test_ctx where key = 'user_a'), 'zz_ca_test_role_a'),
  ((select value::uuid from ca_test_ctx where key = 'user_b'), 'zz_ca_test_role_a'),
  ((select value::uuid from ca_test_ctx where key = 'user_c'), 'zz_ca_test_role_b');

-- Scope-arg shorthands used throughout, matching exactly what
-- toCorrectiveActionScopeArgs() in api/admin.ts would compute for each
-- simulated actor:
--   SCOPE_A  = restricted to zz-ca-test-agent-1 (user_a / user_b)
--   SCOPE_B  = restricted to zz-ca-test-agent-2 (user_c)
--   SCOPE_ALL = unrestricted (an administrator/supervisor, or any
--               call-site that has already validated scope upstream)

-- =======================================================================
-- A. Manual CA creation
-- =======================================================================
do $$
declare
  v_user_a uuid; v_ca jsonb; v_ca2 jsonb;
begin
  select value::uuid into v_user_a from ca_test_ctx where key = 'user_a';

  -- A1: plain manual creation, no agent_id, no QA reference — valid
  -- without any source context (brief §4.1 — "a CA must be valid
  -- without any QA, call or interaction reference").
  select public.call_center_corrective_actions_create(
    jsonb_build_object('title', 'Acceptance A1', 'description', 'Manual creation, no source reference', 'category', 'process'),
    v_user_a, null, true, array[]::text[]
  ) into v_ca;
  assert (v_ca->>'id') is not null, 'A1: manual CA without agent_id/source should be created';
  assert v_ca->>'status' = 'open', 'A1: new CA defaults to open';
  assert v_ca->>'sourceType' = 'manual', 'A1: default sourceType is manual';
  insert into ca_test_ctx (key, value) values ('ca1_id', v_ca->>'id');

  -- A2: missing title/description rejected
  begin
    perform public.call_center_corrective_actions_create(
      jsonb_build_object('title', '', 'description', 'x', 'category', 'process'), v_user_a, null, true, array[]::text[]
    );
    assert false, 'A2: empty title must be rejected';
  exception when others then
    assert sqlerrm = 'title_and_description_required', format('A2: expected title_and_description_required, got %s', sqlerrm);
  end;

  -- A3: idempotent resubmission — same idempotency_key returns the SAME row, not a second one.
  select public.call_center_corrective_actions_create(
    jsonb_build_object('title', 'Acceptance A3', 'description', 'Idempotent create', 'category', 'process'),
    v_user_a, 'zz-ca-test-idem-key-1', true, array[]::text[]
  ) into v_ca;
  select public.call_center_corrective_actions_create(
    jsonb_build_object('title', 'Acceptance A3 (resubmit, should be ignored)', 'description', 'Different text, same key', 'category', 'process'),
    v_user_a, 'zz-ca-test-idem-key-1', true, array[]::text[]
  ) into v_ca2;
  assert v_ca->>'id' = v_ca2->>'id', 'A3: resubmitting the same idempotency key must return the SAME row';
  assert v_ca2->>'title' = 'Acceptance A3', 'A3: the second (duplicate) submission must not overwrite the original title';
  assert (select count(*) from call_center.corrective_actions where idempotency_key = 'zz-ca-test-idem-key-1') = 1,
    'A3: exactly one row must exist for the idempotency key';

  -- A4: creation with an agent_id OUTSIDE the actor's own scope is
  -- rejected (the Business Data Scope isolation fix reviewed in this
  -- acceptance pass — closes the "create as a loophole around scope"
  -- gap found during SQL review).
  begin
    perform public.call_center_corrective_actions_create(
      jsonb_build_object('title', 'Acceptance A4', 'description', 'Out of scope agent', 'category', 'process', 'agentId', 'zz-ca-test-agent-2'),
      v_user_a, null, false, array['zz-ca-test-agent-1']
    );
    assert false, 'A4: creating a CA for an out-of-scope agent_id must be rejected';
  exception when others then
    assert sqlerrm = 'agent_out_of_scope', format('A4: expected agent_out_of_scope, got %s', sqlerrm);
  end;

  -- A5: creation WITH an agent_id inside the actor's own scope succeeds.
  select public.call_center_corrective_actions_create(
    jsonb_build_object('title', 'Acceptance A5', 'description', 'In-scope agent', 'category', 'process', 'agentId', 'zz-ca-test-agent-1'),
    v_user_a, null, false, array['zz-ca-test-agent-1']
  ) into v_ca;
  assert (v_ca->>'id') is not null, 'A5: in-scope agent_id creation must succeed';
  insert into ca_test_ctx (key, value) values ('ca5_id', v_ca->>'id');

  raise notice 'A. Manual CA creation — ALL PASSED';
end $$;

-- =======================================================================
-- B. Assignment and ownership
-- =======================================================================
do $$
declare
  v_user_a uuid; v_user_b uuid; v_user_c uuid; v_ca_id uuid; v_result jsonb;
begin
  select value::uuid into v_user_a from ca_test_ctx where key = 'user_a';
  select value::uuid into v_user_b from ca_test_ctx where key = 'user_b';
  select value::uuid into v_user_c from ca_test_ctx where key = 'user_c';
  select value::uuid into v_ca_id from ca_test_ctx where key = 'ca1_id';

  -- B1: take ownership (self-assign to an unassigned slot) by a NON
  -- manage-any actor succeeds.
  select public.call_center_corrective_actions_assign(v_ca_id, 'assignee', v_user_a, v_user_a, false, true, array[]::text[]) into v_result;
  assert v_result->>'assignedTo' = v_user_a::text, 'B1: self-take-ownership on an unassigned CA must succeed';

  -- B2: a non-manage-any actor cannot reassign an already-owned CA to someone else.
  begin
    perform public.call_center_corrective_actions_assign(v_ca_id, 'assignee', v_user_b, v_user_b, false, true, array[]::text[]);
    assert false, 'B2: a non-manage-any actor must not be able to reassign a CA already owned by someone else';
  exception when others then
    assert sqlerrm = 'assignment_not_permitted', format('B2: expected assignment_not_permitted, got %s', sqlerrm);
  end;

  -- B3: a manage-any actor CAN reassign regardless of current ownership.
  select public.call_center_corrective_actions_assign(v_ca_id, 'assignee', v_user_b, v_user_a, true, true, array[]::text[]) into v_result;
  assert v_result->>'assignedTo' = v_user_b::text, 'B3: manage-any reassignment must succeed';

  -- B4: assigning to an out-of-scope (for this CA's agent) person is
  -- rejected even for a manage-any actor — eligibility is about the
  -- ASSIGNEE's scope, not the caller's authority level. ca1 has no
  -- agent_id (visible/assignable to anyone), so re-use ca5 (scoped to
  -- zz-ca-test-agent-1) and attempt to assign user_c (scoped only to
  -- zz-ca-test-agent-2).
  declare v_ca5_id uuid;
  begin
    select value::uuid into v_ca5_id from ca_test_ctx where key = 'ca5_id';
    begin
      perform public.call_center_corrective_actions_assign(v_ca5_id, 'assignee', v_user_c, v_user_a, true, true, array[]::text[]);
      assert false, 'B4: assigning an out-of-scope-for-this-agent person must be rejected';
    exception when others then
      assert sqlerrm = 'assignee_out_of_scope', format('B4: expected assignee_out_of_scope, got %s', sqlerrm);
    end;
  end;

  raise notice 'B. Assignment and ownership — ALL PASSED';
end $$;

-- =======================================================================
-- C. Lifecycle transitions
-- =======================================================================
do $$
declare v_user_a uuid; v_ca_id uuid; v_result jsonb;
begin
  select value::uuid into v_user_a from ca_test_ctx where key = 'user_a';
  select value::uuid into v_ca_id from ca_test_ctx where key = 'ca1_id';

  -- C1: open -> in_progress, by the owner (assigned_to = user_b from
  -- step B3 — use manage-any here since user_a is the creator, not the
  -- current assignee, and "owns" allows created_by OR assigned_to).
  select public.call_center_corrective_actions_set_status(v_ca_id, 'in_progress', v_user_a, true, null, true, array[]::text[]) into v_result;
  assert v_result->>'status' = 'in_progress', 'C1: open -> in_progress must succeed';

  -- C2: an invalid direct transition (in_progress -> closed, skipping
  -- pending_verification) is rejected by the centrally-enforced table.
  begin
    perform public.call_center_corrective_actions_set_status(v_ca_id, 'closed', v_user_a, true, 'skip ahead', true, array[]::text[]);
    assert false, 'C2: in_progress -> closed directly must be rejected';
  exception when others then
    assert sqlerrm = 'invalid_status_transition', format('C2: expected invalid_status_transition, got %s', sqlerrm);
  end;

  -- C3: in_progress -> pending_verification, valid.
  select public.call_center_corrective_actions_set_status(v_ca_id, 'pending_verification', v_user_a, true, null, true, array[]::text[]) into v_result;
  assert v_result->>'status' = 'pending_verification', 'C3: in_progress -> pending_verification must succeed';

  -- C4: cancellation without a reason is rejected (brief §5).
  begin
    perform public.call_center_corrective_actions_set_status(v_ca_id, 'cancelled', v_user_a, true, null, true, array[]::text[]);
    assert false, 'C4: cancellation without a reason must be rejected';
  exception when others then
    assert sqlerrm = 'cancellation_reason_required', format('C4: expected cancellation_reason_required, got %s', sqlerrm);
  end;

  -- C5: administrative closure (pending_verification -> closed via
  -- set_status, NOT via a recorded verification) requires manage-any
  -- AND a reason.
  begin
    perform public.call_center_corrective_actions_set_status(v_ca_id, 'closed', v_user_a, false, 'admin override', true, array[]::text[]);
    assert false, 'C5a: administrative closure by a non-manage-any actor must be rejected';
  exception when others then
    assert sqlerrm = 'ownership_required', format('C5a: expected ownership_required, got %s', sqlerrm);
  end;
  begin
    perform public.call_center_corrective_actions_set_status(v_ca_id, 'closed', v_user_a, true, null, true, array[]::text[]);
    assert false, 'C5b: administrative closure without a reason must be rejected';
  exception when others then
    assert sqlerrm = 'administrative_closure_reason_required', format('C5b: expected administrative_closure_reason_required, got %s', sqlerrm);
  end;
  select public.call_center_corrective_actions_set_status(v_ca_id, 'closed', v_user_a, true, 'administrative disposition — acceptance test', true, array[]::text[]) into v_result;
  assert v_result->>'status' = 'closed', 'C5c: administrative closure WITH manage-any + a reason must succeed';

  -- C6: reopen a closed CA, then verify a direct open -> closed jump is
  -- still rejected (covered again under H below for emphasis).
  select public.call_center_corrective_actions_set_status(v_ca_id, 'reopened', v_user_a, true, null, true, array[]::text[]) into v_result;
  assert v_result->>'status' = 'reopened', 'C6: closed -> reopened must succeed';

  raise notice 'C. Lifecycle transitions — ALL PASSED';
end $$;

-- =======================================================================
-- D. Group linking/unlinking
-- =======================================================================
do $$
declare
  v_user_a uuid; v_ca1 uuid; v_ca5 uuid; v_group1 jsonb; v_group2 jsonb; v_members jsonb;
begin
  select value::uuid into v_user_a from ca_test_ctx where key = 'user_a';
  select value::uuid into v_ca1 from ca_test_ctx where key = 'ca1_id';
  select value::uuid into v_ca5 from ca_test_ctx where key = 'ca5_id';

  select public.call_center_corrective_action_groups_create('Acceptance Group 1', 'D-series group', v_user_a) into v_group1;
  select public.call_center_corrective_action_groups_create('Acceptance Group 2', 'D-series group (rival)', v_user_a) into v_group2;

  -- D1: transactional link of two CAs into group 1 succeeds.
  select public.call_center_corrective_action_groups_link(
    (v_group1->>'id')::uuid, array[v_ca1, v_ca5], v_user_a, true, array[]::text[]
  ) into v_members;
  assert jsonb_array_length(v_members) = 2, 'D1: both CAs must be linked';

  -- D2: attempting to link an already-grouped CA into a DIFFERENT group
  -- is rejected, and the whole call aborts with NOTHING written (true
  -- transactionality) — verify by trying to also move ca1 into group2
  -- alongside a brand-new CA, and confirming ca1 is still in group1
  -- afterward (the new CA must NOT have been linked either).
  declare v_ca_fresh uuid; v_fresh_result jsonb;
  begin
    select public.call_center_corrective_actions_create(
      jsonb_build_object('title', 'Acceptance D2 fresh CA', 'description', 'Should remain unlinked after the aborted call', 'category', 'process'),
      v_user_a, null, true, array[]::text[]
    ) into v_fresh_result;
    v_ca_fresh := (v_fresh_result->>'id')::uuid;

    begin
      perform public.call_center_corrective_action_groups_link((v_group2->>'id')::uuid, array[v_ca_fresh, v_ca1], v_user_a, true, array[]::text[]);
      assert false, 'D2: linking a CA already in a different active group must be rejected';
    exception when others then
      assert sqlerrm like 'already_in_another_group%', format('D2: expected already_in_another_group, got %s', sqlerrm);
    end;

    assert (select group_id from call_center.corrective_actions where id = v_ca_fresh) is null,
      'D2: the fresh CA must remain UNLINKED — the aborted call must not have partially written it';
    assert (select group_id from call_center.corrective_actions where id = v_ca1) = (v_group1->>'id')::uuid,
      'D2: ca1 must remain in its original group, untouched by the aborted call';
  end;

  -- D3: unlink ca5 from group1.
  perform public.call_center_corrective_action_groups_unlink((v_group1->>'id')::uuid, v_ca5, v_user_a);
  assert (select group_id from call_center.corrective_actions where id = v_ca5) is null, 'D3: ca5 must be unlinked';

  insert into ca_test_ctx (key, value) values ('group1_id', v_group1->>'id');

  raise notice 'D. Group linking/unlinking — ALL PASSED';
end $$;

-- =======================================================================
-- E, F, G: common correction, individual verification, bulk verify/close
-- =======================================================================
do $$
declare
  v_user_a uuid; v_ca_a jsonb; v_ca_b jsonb; v_ca_c jsonb; v_group jsonb;
  v_ca_a_id uuid; v_ca_b_id uuid; v_ca_c_id uuid; v_result jsonb; v_bulk jsonb;
begin
  select value::uuid into v_user_a from ca_test_ctx where key = 'user_a';

  -- Three fresh CAs, moved to pending_verification (except one left at
  -- 'open' on purpose, for the ineligible-bulk-member case in G2).
  select public.call_center_corrective_actions_create(jsonb_build_object('title','Acceptance E/F/G — a','description','x','category','process'), v_user_a, null, true, array[]::text[]) into v_ca_a;
  select public.call_center_corrective_actions_create(jsonb_build_object('title','Acceptance E/F/G — b','description','x','category','process'), v_user_a, null, true, array[]::text[]) into v_ca_b;
  select public.call_center_corrective_actions_create(jsonb_build_object('title','Acceptance E/F/G — c (left open)','description','x','category','process'), v_user_a, null, true, array[]::text[]) into v_ca_c;
  v_ca_a_id := (v_ca_a->>'id')::uuid; v_ca_b_id := (v_ca_b->>'id')::uuid; v_ca_c_id := (v_ca_c->>'id')::uuid;

  perform public.call_center_corrective_actions_set_status(v_ca_a_id, 'in_progress', v_user_a, true, null, true, array[]::text[]);
  perform public.call_center_corrective_actions_set_status(v_ca_a_id, 'pending_verification', v_user_a, true, null, true, array[]::text[]);
  perform public.call_center_corrective_actions_set_status(v_ca_b_id, 'in_progress', v_user_a, true, null, true, array[]::text[]);
  perform public.call_center_corrective_actions_set_status(v_ca_b_id, 'pending_verification', v_user_a, true, null, true, array[]::text[]);
  -- v_ca_c stays 'open' deliberately.

  -- E: record_correction never changes status on its own.
  select public.call_center_corrective_actions_record_correction(v_ca_a_id, 'Reconfigured the knowledge base entry.', v_user_a, true, true, array[]::text[]) into v_result;
  assert v_result->>'status' = 'pending_verification', 'E: recording a correction must NOT change status';
  assert v_result->>'resolutionSummary' = 'Reconfigured the knowledge base entry.', 'E: resolution summary must be stored';

  -- F: individual verification — FAILED does not close.
  select public.call_center_corrective_action_verify_one(v_ca_a_id, 'failed', 'First retest', null, 'Still reproduces', v_user_a, true, null, true, array[]::text[]) into v_result;
  assert v_result->>'status' = 'pending_verification', 'F1: a FAILED verification must NOT close the CA';
  assert v_result->>'verificationResult' = 'failed', 'F1: verificationResult must record failed';

  -- F: individual verification — PASSED closes.
  select public.call_center_corrective_actions_record_verification(v_ca_a_id, 'passed', 'Second retest', null, 'Resolved', v_user_a, true, true, array[]::text[]) into v_result;
  assert v_result->>'status' = 'closed', 'F2: a PASSED verification must close the CA';
  assert v_result->>'closedAt' is not null, 'F2: closedAt must be set';
  assert (select count(*) from call_center.corrective_action_verifications where corrective_action_id = v_ca_a_id) = 2,
    'F3: both verification attempts (failed, then passed) must be individually retained, not overwritten';

  -- G: bulk verification over [ca_b (eligible), ca_c (NOT eligible —
  -- still open)] — must report per-id success/failure independently,
  -- close only the eligible one, and never abort the whole batch
  -- because of the ineligible member.
  select public.call_center_corrective_action_groups_create('Acceptance Bulk Group', 'G-series', v_user_a) into v_group;
  perform public.call_center_corrective_action_groups_link((v_group->>'id')::uuid, array[v_ca_b_id, v_ca_c_id], v_user_a, true, array[]::text[]);

  select public.call_center_corrective_actions_bulk_verify(
    array[v_ca_b_id, v_ca_c_id], 'passed', 'Shared regression test', 'evidence://acceptance-g', 'Common fix verified',
    v_user_a, true, (v_group->>'id')::uuid, true, array[]::text[]
  ) into v_bulk;
  assert (v_bulk->>'succeeded')::int = 1, 'G1: exactly one of the two selected CAs should succeed (ca_b)';
  assert (v_bulk->>'failed')::int = 1, 'G2: exactly one (ca_c, still open) should be reported as failed, not silently skipped';
  assert (select status from call_center.corrective_actions where id = v_ca_b_id) = 'closed', 'G3: the eligible CA (ca_b) must be closed';
  assert (select status from call_center.corrective_actions where id = v_ca_c_id) = 'open', 'G4: the ineligible CA (ca_c) must remain completely untouched — still open';
  assert (select count(*) from call_center.corrective_action_verifications where corrective_action_id = v_ca_b_id) = 1,
    'G5: ca_b must have received its own individually-recorded verification row';
  assert (select count(*) from call_center.corrective_action_verifications where corrective_action_id = v_ca_c_id) = 0,
    'G6: ca_c must NOT have a verification row (it was never eligible, so verify_one was never reached for it)';

  raise notice 'E/F/G. Correction, individual verification, bulk verify/close — ALL PASSED';
end $$;

-- =======================================================================
-- H. Invalid transitions (direct open -> closed)
-- =======================================================================
do $$
declare v_user_a uuid; v_ca jsonb; v_ca_id uuid;
begin
  select value::uuid into v_user_a from ca_test_ctx where key = 'user_a';
  select public.call_center_corrective_actions_create(jsonb_build_object('title','Acceptance H','description','x','category','process'), v_user_a, null, true, array[]::text[]) into v_ca;
  v_ca_id := (v_ca->>'id')::uuid;
  begin
    perform public.call_center_corrective_actions_set_status(v_ca_id, 'closed', v_user_a, true, 'skip straight to closed', true, array[]::text[]);
    assert false, 'H: a brand-new open CA must not be transitionable directly to closed';
  exception when others then
    assert sqlerrm = 'invalid_status_transition', format('H: expected invalid_status_transition, got %s', sqlerrm);
  end;
  raise notice 'H. Invalid transitions — PASSED';
end $$;

-- =======================================================================
-- I. Authorization failures (ownership_required on update/record_correction)
-- =======================================================================
do $$
declare v_user_a uuid; v_user_c uuid; v_ca jsonb; v_ca_id uuid;
begin
  select value::uuid into v_user_a from ca_test_ctx where key = 'user_a';
  select value::uuid into v_user_c from ca_test_ctx where key = 'user_c';
  select public.call_center_corrective_actions_create(jsonb_build_object('title','Acceptance I','description','x','category','process'), v_user_a, null, true, array[]::text[]) into v_ca;
  v_ca_id := (v_ca->>'id')::uuid;

  -- user_c is neither creator, assignee, nor manage-any — must be denied.
  begin
    perform public.call_center_corrective_actions_update(v_ca_id, jsonb_build_object('priority', 'high'), v_user_c, false, true, array[]::text[]);
    assert false, 'I1: a non-owner, non-manage-any actor must not be able to edit this CA';
  exception when others then
    assert sqlerrm = 'ownership_required', format('I1: expected ownership_required, got %s', sqlerrm);
  end;

  begin
    perform public.call_center_corrective_actions_record_correction(v_ca_id, 'unauthorized attempt', v_user_c, false, true, array[]::text[]);
    assert false, 'I2: a non-owner, non-manage-any actor must not be able to record a correction';
  exception when others then
    assert sqlerrm = 'ownership_required', format('I2: expected ownership_required, got %s', sqlerrm);
  end;

  raise notice 'I. Authorization failures — PASSED';
end $$;

-- =======================================================================
-- J. Data-scope isolation — an out-of-scope CA is invisible / unreachable,
--    always reported as not-found (never a distinguishable error that
--    would leak its existence to someone who cannot see it via list/get).
-- =======================================================================
do $$
declare v_user_a uuid; v_ca jsonb; v_ca_id uuid; v_get jsonb; v_list jsonb;
  SCOPE_B_ALL boolean := false; SCOPE_B_IDS text[] := array['zz-ca-test-agent-2'];
begin
  select value::uuid into v_user_a from ca_test_ctx where key = 'user_a';

  -- A CA explicitly scoped to agent-1.
  select public.call_center_corrective_actions_create(
    jsonb_build_object('title','Acceptance J','description','x','category','process','agentId','zz-ca-test-agent-1'),
    v_user_a, null, false, array['zz-ca-test-agent-1']
  ) into v_ca;
  v_ca_id := (v_ca->>'id')::uuid;

  -- J1: get() with ONLY agent-2 scope returns null (not an error, not
  -- the row) — exactly how an out-of-scope read must behave.
  select public.call_center_corrective_actions_get(v_ca_id, SCOPE_B_ALL, SCOPE_B_IDS) into v_get;
  assert v_get is null, 'J1: get() must return null for an out-of-scope CA';

  -- J2: list() with ONLY agent-2 scope never includes it.
  select public.call_center_corrective_actions_list(null, null, null, null, null, null, null, null, SCOPE_B_ALL, SCOPE_B_IDS, 200, 0) into v_list;
  assert not exists (select 1 from jsonb_array_elements(v_list) e where (e->>'id')::uuid = v_ca_id), 'J2: list() must never surface an out-of-scope CA';

  -- J3: update/assign/set_status/record_correction/verify from an
  -- agent-2-scoped actor all fail closed as "not found", never as a
  -- distinguishable 403/422 that would confirm the CA's existence.
  begin
    perform public.call_center_corrective_actions_update(v_ca_id, jsonb_build_object('priority','high'), v_user_a, true, SCOPE_B_ALL, SCOPE_B_IDS);
    assert false, 'J3a: update() on an out-of-scope CA must be rejected';
  exception when others then assert sqlerrm = 'corrective_action_not_found', format('J3a: expected corrective_action_not_found, got %s', sqlerrm); end;

  begin
    perform public.call_center_corrective_actions_assign(v_ca_id, 'assignee', v_user_a, v_user_a, true, SCOPE_B_ALL, SCOPE_B_IDS);
    assert false, 'J3b: assign() on an out-of-scope CA must be rejected';
  exception when others then assert sqlerrm = 'corrective_action_not_found', format('J3b: expected corrective_action_not_found, got %s', sqlerrm); end;

  begin
    perform public.call_center_corrective_actions_set_status(v_ca_id, 'in_progress', v_user_a, true, null, SCOPE_B_ALL, SCOPE_B_IDS);
    assert false, 'J3c: set_status() on an out-of-scope CA must be rejected';
  exception when others then assert sqlerrm = 'corrective_action_not_found', format('J3c: expected corrective_action_not_found, got %s', sqlerrm); end;

  begin
    perform public.call_center_corrective_actions_record_correction(v_ca_id, 'x', v_user_a, true, SCOPE_B_ALL, SCOPE_B_IDS);
    assert false, 'J3d: record_correction() on an out-of-scope CA must be rejected';
  exception when others then assert sqlerrm = 'corrective_action_not_found', format('J3d: expected corrective_action_not_found, got %s', sqlerrm); end;

  begin
    perform public.call_center_corrective_actions_record_verification(v_ca_id, 'passed', null, null, null, v_user_a, true, SCOPE_B_ALL, SCOPE_B_IDS);
    assert false, 'J3e: record_verification() on an out-of-scope CA must be rejected';
  exception when others then assert sqlerrm = 'corrective_action_not_found', format('J3e: expected corrective_action_not_found, got %s', sqlerrm); end;

  -- J4: bulk_verify with a mix of in-scope and out-of-scope ids reports
  -- the out-of-scope id as an independent per-item failure (not an
  -- abort of the whole batch).
  declare v_bulk jsonb;
  begin
    select public.call_center_corrective_actions_bulk_verify(
      array[v_ca_id], 'passed', null, null, null, v_user_a, true, null, SCOPE_B_ALL, SCOPE_B_IDS
    ) into v_bulk;
    assert (v_bulk->>'failed')::int = 1, 'J4: an out-of-scope id inside a bulk batch must be reported as a failure, not silently dropped or forced through';
    assert (select status from call_center.corrective_actions where id = v_ca_id) = 'open', 'J4: the out-of-scope CA must remain completely untouched';
  end;

  raise notice 'J. Data-scope isolation — ALL PASSED';
end $$;

do $$
begin
  raise notice '================================================================';
  raise notice 'SESSION 16.5 CORRECTIVE ACTION MANAGEMENT — ALL ACCEPTANCE CHECKS PASSED';
  raise notice '================================================================';
end $$;

rollback;
