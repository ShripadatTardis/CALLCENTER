
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
    const { phone_number, password } = await req.json();

    if (!phone_number || !password) {
      return new Response(
        JSON.stringify({ error: 'Phone number and password are required' }),
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

    // Get Twilio credentials
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioFromNumber = Deno.env.get('TWILIO_FROM_NUMBER');

    // Helper function to send WhatsApp message via Twilio or Simulator
    const sendWhatsAppMessage = async (messageBody: string, toNumber: string) => {
      try {
        // Check if we should use simulator
        const useSimulator = Deno.env.get('USE_SIMULATOR') === 'true';
        const simulatorUrl = Deno.env.get('SIMULATOR_URL') || 'https://37ba-115-98-234-92.ngrok-free.app';
        let twilioResponse;
        
        if (useSimulator) {
          // Use simulator for testing
          twilioResponse = await fetch(`${simulatorUrl}/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
              From: `whatsapp:${twilioFromNumber}`,
              To: `whatsapp:${toNumber}`,
              Body: messageBody
            })
          });
        } else {
          // Use real Twilio API for production
          const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
          twilioResponse = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                From: `whatsapp:${twilioFromNumber}`,
                To: `whatsapp:${toNumber}`,
                Body: messageBody,
              }),
            }
          );
        }

        const twilioData = await twilioResponse.json();
        console.log('Twilio response:', twilioData);

        if (twilioResponse.ok) {
          // Store outbound message in database
          const { data: outboundMessage, error: outboundError } = await supabase
            .from('whatsapp_messages')
            .insert({
              from_number: twilioFromNumber,
              to_number: toNumber,
              message_body: messageBody,
              direction: 'outbound',
              twilio_message_sid: twilioData.sid,
              status: twilioData.status,
              processed: true,
            })
            .select()
            .single();

          if (outboundError) {
            console.error('Error storing outbound message:', outboundError);
          } else {
            console.log('Outbound message stored:', outboundMessage);
          }

          return twilioData.sid;
        } else {
          console.error('Twilio error:', twilioData);
          return null;
        }
      } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        return null;
      }
    };

    // Get user session
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

    if (!session || !session.hashed_password) {
      return new Response(
        JSON.stringify({ error: 'No password set for this number' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Verify password
    const hashedInput = await hashPassword(password);
    if (hashedInput !== session.hashed_password) {
      return new Response(
        JSON.stringify({ error: 'Invalid password' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Update session as authenticated
    const { error: updateError } = await supabase
      .from('whatsapp_sessions')
      .update({
        authenticated: true,
        last_active: new Date().toISOString(),
      })
      .eq('phone_number', phone_number);

    if (updateError) {
      console.error('Error updating session:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update session' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Send re-authentication success message
    if (twilioAccountSid && twilioAuthToken && twilioFromNumber) {
      const reAuthMessage = "You are successfully re-authenticated. Now continuing the dialogue from last message";
      await sendWhatsAppMessage(reAuthMessage, phone_number);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Authentication successful' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Validation error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
