
-- Add authentication fields to whatsapp_sessions table
ALTER TABLE public.whatsapp_sessions ADD COLUMN IF NOT EXISTS authenticated BOOLEAN DEFAULT false;
ALTER TABLE public.whatsapp_sessions ADD COLUMN IF NOT EXISTS last_active TIMESTAMP WITH TIME ZONE DEFAULT now();
ALTER TABLE public.whatsapp_sessions ADD COLUMN IF NOT EXISTS hashed_password TEXT;
ALTER TABLE public.whatsapp_sessions ADD COLUMN IF NOT EXISTS otp_code TEXT;
ALTER TABLE public.whatsapp_sessions ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.whatsapp_sessions ADD COLUMN IF NOT EXISTS otp_attempts INTEGER DEFAULT 0;

-- Add processed field to whatsapp_messages table
ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT false;

-- Create index for performance on authentication checks
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_phone_auth ON public.whatsapp_sessions(phone_number, authenticated, last_active);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_processed ON public.whatsapp_messages(from_number, processed, timestamp);
