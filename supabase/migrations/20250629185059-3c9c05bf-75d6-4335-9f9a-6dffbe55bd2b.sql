
-- Create SMS messages table to log SMS communications
CREATE TABLE public.sms_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT NOT NULL,
  direction TEXT CHECK (direction IN ('inbound', 'outbound')) NOT NULL,
  twilio_message_sid TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (since this is an internal tool)
CREATE POLICY "Allow all operations on sms_messages" 
  ON public.sms_messages 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Enable real-time updates
ALTER TABLE public.sms_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_messages;
