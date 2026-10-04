import { createClient } from '@supabase/supabase-js';

/**
 * Session 14.1 — real Supabase Auth client for sign-in/sign-out only.
 *
 * Deliberately a SEPARATE client from src/integrations/supabase/client.ts
 * (which stays pointed at the unrelated legacy WhatsApp/SMS project,
 * untouched by this session). This one points at the same project this
 * app's call_center data already lives in (the "AuditAI" project), using
 * its publishable/anon key — safe to ship to the browser; it can only
 * perform Supabase Auth operations (sign in/out, session refresh), never
 * read or write call_center tables (those stay behind the server-only
 * service-role key under src/server/**).
 *
 * This client is never used to query any table — only `.auth.*`.
 */
const SUPABASE_AUTH_URL = 'https://dtbaczafdzgctkbqviod.supabase.co';
const SUPABASE_AUTH_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0YmFjemFmZHpnY3RrYnF2aW9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIxMTkyMTMsImV4cCI6MjA2NzY5NTIxM30.FQpFvHllNe6ygpAszF7PiJKGbduIvmg4lcrwZ3CiR9I';

export const supabaseAuthClient = createClient(SUPABASE_AUTH_URL, SUPABASE_AUTH_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
