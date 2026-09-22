
-- Create table for logging VAPI response formatting
CREATE TABLE public.vapi_response_logs (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT,
  whatsapp_number TEXT NOT NULL,
  original_text TEXT NOT NULL,
  formatted_text TEXT NOT NULL,
  format_strategy TEXT NOT NULL CHECK (format_strategy IN ('LOCAL', 'AI')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_vapi_response_logs_whatsapp_number ON public.vapi_response_logs(whatsapp_number);
CREATE INDEX idx_vapi_response_logs_session_id ON public.vapi_response_logs(session_id);
CREATE INDEX idx_vapi_response_logs_created_at ON public.vapi_response_logs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.vapi_response_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (since this is an internal tool)
CREATE POLICY "Allow all operations on vapi_response_logs" 
  ON public.vapi_response_logs 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Enable real-time updates
ALTER TABLE public.vapi_response_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vapi_response_logs;
