
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHash } from 'https://deno.land/std@0.177.0/crypto/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone_number, otp_code, new_password } = await req.json();

    if (!phone_number || !otp_code || !new_password) {
      return new Response(
        JSON.stringify({ error: 'Phone number, OTP code, and new password are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get session with OTP
    const { data: session, error: sessionError } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('phone_number', phone_number)
      .maybeSingle();

    if (sessionError) {
      console.error('Error fetching session:', sessionError);
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!session) {
      return new Response(
        JSON.stringify({ error: 'Session not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Check OTP attempts
    const maxAttempts = parseInt(Deno.env.get('MAX_OTP_ATTEMPTS') || '3');
    if (session.otp_attempts >= maxAttempts) {
      return new Response(
        JSON.stringify({ error: 'Maximum OTP attempts exceeded' }),
        { 
          status: 429, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Check OTP expiry
    if (!session.otp_expires_at || new Date() > new Date(session.otp_expires_at)) {
      return new Response(
        JSON.stringify({ error: 'OTP has expired' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Verify OTP
    if (session.otp_code !== otp_code) {
      // Increment attempt count
      await supabase
        .from('whatsapp_sessions')
        .update({ otp_attempts: session.otp_attempts + 1 })
        .eq('phone_number', phone_number);

      return new Response(
        JSON.stringify({ error: 'Invalid OTP code' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Hash new password
    const hashedPassword = await hashPassword(new_password);

    // Update password and clear OTP
    const { error: updateError } = await supabase
      .from('whatsapp_sessions')
      .update({
        hashed_password: hashedPassword,
        authenticated: true,
        last_active: new Date().toISOString(),
        otp_code: null,
        otp_expires_at: null,
        otp_attempts: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('phone_number', phone_number);

    if (updateError) {
      console.error('Error updating password:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update password' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Password updated successfully' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Reset password error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
