-- Session 7-T — CMA_POC_500_V1 cleanup. Removes every cma500_ row.
begin;
delete from call_center.automated_qa_observations where evaluation_id in (select id from call_center.automated_qa_evaluations where interaction_id like 'cma500_%');
delete from call_center.automated_qa_evaluations where interaction_id like 'cma500_%';
delete from call_center.qa_findings where review_id in (select id from call_center.qa_reviews where interaction_id like 'cma500_%');
delete from call_center.qa_reviews where interaction_id like 'cma500_%';
delete from call_center.chat_sessions where upstream_session_id like 'cma500_%';
delete from call_center.customer_interactions where interaction_id like 'cma500_%';
commit;
