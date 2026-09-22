
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone_number } = await req.json();

    if (!phone_number) {
      return new Response(
        JSON.stringify({ error: 'Phone number is required' }),
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

    // Get configuration for OTP delivery method
    const otpMethod = Deno.env.get('SEND_OTP_METHOD') || 'WA'; // Default to WhatsApp

    // Get Twilio credentials
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER');
    const smsFromNumber = Deno.env.get('TWILIO_SMS_FROM_NUMBER') || '+18287313201';

    if (!accountSid || !authToken || !fromNumber) {
      return new Response(
        JSON.stringify({ error: 'Twilio credentials not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Generate OTP
    const otpCode = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // First, try to update existing session with OTP (preserving session_id and other data)
    const { data: updateResult, error: updateError } = await supabase
      .from('whatsapp_sessions')
      .update({
        otp_code: otpCode,
        otp_expires_at: otpExpiresAt.toISOString(),
        otp_attempts: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('phone_number', phone_number)
      .select();

    // If no existing session was updated, create a new one
    if (updateError || !updateResult || updateResult.length === 0) {
      const { error: insertError } = await supabase
        .from('whatsapp_sessions')
        .insert({
          phone_number: phone_number,
          session_id: `temp_${Date.now()}`, // Temporary session ID until VAPI session is created
          otp_code: otpCode,
          otp_expires_at: otpExpiresAt.toISOString(),
          otp_attempts: 0,
          updated_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('Error storing OTP:', insertError);
        return new Response(
          JSON.stringify({ error: 'Failed to generate OTP' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
    }

    // Send OTP based on configured method
    try {
      const otpMessage = `Your OTP code is: ${otpCode}. This code will expire in 10 minutes.`;
      let messagingResult;

      if (otpMethod === 'SMS') {
        // Send via SMS
        console.log('Sending OTP via SMS');
        const auth = btoa(`${accountSid}:${authToken}`);
        const twilioResponse = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              From: smsFromNumber,
              To: phone_number,
              Body: otpMessage,
            }),
          }
        );

        messagingResult = await twilioResponse.json();

        if (twilioResponse.ok) {
          // Store SMS message in database
          await supabase
            .from('sms_messages')
            .insert({
              from_number: smsFromNumber,
              to_number: phone_number,
              body: otpMessage,
              direction: 'outbound',
              twilio_message_sid: messagingResult.sid,
              status: messagingResult.status,
            });
        }
      } else {
        // Send via WhatsApp (existing logic)
        console.log('Sending OTP via WhatsApp');
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
              From: `whatsapp:${fromNumber}`,
              To: `whatsapp:${phone_number}`,
              Body: otpMessage
            })
          });
        } else {
          // Use real Twilio API for production
          const auth = btoa(`${accountSid}:${authToken}`);
          twilioResponse = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                From: `whatsapp:${fromNumber}`,
                To: `whatsapp:${phone_number}`,
                Body: otpMessage,
              }),
            }
          );
        }

        messagingResult = await twilioResponse.json();
      }

      if (!messagingResult || (messagingResult.error_code && messagingResult.error_code !== undefined)) {
        console.error('Messaging error:', messagingResult);
        return new Response(
          JSON.stringify({ error: `Failed to send OTP via ${otpMethod}` }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: `OTP sent successfully via ${otpMethod}` }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    } catch (sendError) {
      console.error('Error sending OTP:', sendError);
      return new Response(
        JSON.stringify({ error: 'Failed to send OTP' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

  } catch (error) {
    console.error('Send OTP error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
