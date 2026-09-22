
-- Update the check constraint to allow 'DISABLED' as a valid format_strategy value
ALTER TABLE vapi_response_logs DROP CONSTRAINT IF EXISTS vapi_response_logs_format_strategy_check;
ALTER TABLE vapi_response_logs ADD CONSTRAINT vapi_response_logs_format_strategy_check 
CHECK (format_strategy IN ('LOCAL', 'AI', 'DISABLED'));
