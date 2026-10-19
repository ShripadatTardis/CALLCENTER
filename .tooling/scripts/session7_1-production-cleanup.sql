-- Session 7.1 -- removes the CMA_POC_500_V1 synthetic dataset completely.
-- Safe to run multiple times (no error if already clean -- every delete
-- is a plain `where dataset_id = ...`, matching zero rows after the
-- first run). Deletes only rows explicitly tagged with this dataset_id --
-- never touches any real operational row (dataset_id is null for all of
-- those, always excluded).

begin;

delete from call_center.automated_qa_observations
  where evaluation_id in (select id from call_center.automated_qa_evaluations where dataset_id = 'CMA_POC_500_V1');

delete from call_center.automated_qa_evaluations
  where dataset_id = 'CMA_POC_500_V1';

delete from call_center.qa_findings
  where review_id in (select id from call_center.qa_reviews where dataset_id = 'CMA_POC_500_V1');

delete from call_center.qa_reviews
  where dataset_id = 'CMA_POC_500_V1';

delete from call_center.chat_sessions
  where dataset_id = 'CMA_POC_500_V1';

delete from call_center.customer_interactions
  where dataset_id = 'CMA_POC_500_V1';

commit;
