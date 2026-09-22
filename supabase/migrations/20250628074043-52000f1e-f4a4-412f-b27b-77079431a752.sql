
-- Create enum for message direction
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');

-- Create whatsapp_messages table
CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  message_body TEXT NOT NULL,
  direction message_direction NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  twilio_message_sid TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (since this is an internal tool)
CREATE POLICY "Allow all operations on whatsapp_messages" 
  ON public.whatsapp_messages 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Enable real-time updates
ALTER TABLE public.whatsapp_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
