
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, body } = await req.json();

    if (!to || !body) {
      return new Response(
        JSON.stringify({ error: 'Phone number (to) and message body are required' }),
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
    const twilioSmsFromNumber = Deno.env.get('TWILIO_SMS_FROM_NUMBER') || '+18287313201';

    if (!twilioAccountSid || !twilioAuthToken) {
      return new Response(
        JSON.stringify({ error: 'Twilio credentials not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Send SMS via Twilio
    try {
      const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
      const twilioResponse = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            From: twilioSmsFromNumber,
            To: to,
            Body: body,
          }),
        }
      );

      const twilioData = await twilioResponse.json();

      if (!twilioResponse.ok) {
        console.error('Twilio SMS error:', twilioData);
        return new Response(
          JSON.stringify({ error: 'Failed to send SMS', details: twilioData }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Store SMS message in database
      const { data: smsMessage, error: insertError } = await supabase
        .from('sms_messages')
        .insert({
          from_number: twilioSmsFromNumber,
          to_number: to,
          body: body,
          direction: 'outbound',
          twilio_message_sid: twilioData.sid,
          status: twilioData.status,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error storing SMS message:', insertError);
        // Still return success since SMS was sent, but log the database error
      } else {
        console.log('SMS message stored:', smsMessage);
      }

      return new Response(
        JSON.stringify({ status: 'sent', sid: twilioData.sid }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    } catch (sendError) {
      console.error('Error sending SMS:', sendError);
      return new Response(
        JSON.stringify({ error: 'Failed to send SMS' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

  } catch (error) {
    console.error('Send SMS error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
