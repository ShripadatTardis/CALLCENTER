
-- Create whatsapp_sessions table to store session IDs per phone number
CREATE TABLE public.whatsapp_sessions (
  phone_number TEXT NOT NULL PRIMARY KEY,
  session_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (since this is an internal tool)
CREATE POLICY "Allow all operations on whatsapp_sessions" 
  ON public.whatsapp_sessions 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Add session_id column to whatsapp_messages table
ALTER TABLE public.whatsapp_messages ADD COLUMN session_id TEXT;

-- Enable real-time updates for the sessions table
ALTER TABLE public.whatsapp_sessions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_sessions;
