-- Session 4D — removes every row measurement-test-fixtures.sql inserts
-- (same 'fx_' tag match). Safe to run even if the fixture was never
-- applied (every DELETE is a no-op then). Run this after a test pass to
-- confirm the disposable database returns to its pre-fixture state, or
-- simply let the fixture script's own leading DELETE block (identical
-- to this file) handle it automatically on the next run.

begin;

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

commit;
