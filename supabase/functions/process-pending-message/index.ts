
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { formatAndLogVapiResponse } from '../shared/vapi-formatter.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Get VAPI credentials
    const vapiApiKey = Deno.env.get('VAPI_API_KEY');
    const vapiAssistantId = Deno.env.get('VAPI_ASSISTANT_ID');
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioFromNumber = Deno.env.get('TWILIO_FROM_NUMBER');

    if (!vapiApiKey || !vapiAssistantId || !twilioAccountSid || !twilioAuthToken || !twilioFromNumber) {
      return new Response(
        JSON.stringify({ error: 'Required credentials not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

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

    // Get the most recent unprocessed message
    const { data: message, error: messageError } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('from_number', phone_number)
      .eq('processed', false)
      .eq('direction', 'inbound')
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (messageError) {
      console.error('Error fetching message:', messageError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch message' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!message) {
      return new Response(
        JSON.stringify({ message: 'No unprocessed messages found' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get session for VAPI
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('session_id')
      .eq('phone_number', phone_number)
      .maybeSingle();

    let sessionId = session?.session_id;

    // Create VAPI session if needed
    if (!sessionId) {
      const sessionResponse = await fetch('https://api.vapi.ai/session', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vapiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assistantId: vapiAssistantId,
        }),
      });

      if (sessionResponse.ok) {
        const sessionData = await sessionResponse.json();
        sessionId = sessionData.id;
        
        await supabase
          .from('whatsapp_sessions')
          .update({ session_id: sessionId })
          .eq('phone_number', phone_number);
      }
    }

    // Process message with VAPI
    let aiReply = "Sorry, I couldn't process your message right now.";
    
    if (sessionId) {
      try {
        const vapiResponse = await fetch('https://api.vapi.ai/chat', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${vapiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: sessionId,
            input: message.message_body,
          }),
        });

        if (vapiResponse.ok) {
          const vapiData = await vapiResponse.json();
          if (vapiData.output && vapiData.output.length > 0 && vapiData.output[0].content) {
            aiReply = vapiData.output[0].content;
          }
        }
      } catch (error) {
        console.error('VAPI error:', error);
      }
    }

    // Format the AI reply before sending
    const formattedReply = await formatAndLogVapiResponse(aiReply, sessionId, phone_number);
    
    // Send reply via WhatsApp (using simulator or Twilio)
    const aiReplySid = await sendWhatsAppMessage(formattedReply, phone_number);

    if (aiReplySid) {
      // Store outbound message
      await supabase
        .from('whatsapp_messages')
        .insert({
          from_number: twilioFromNumber,
          to_number: phone_number,
          message_body: formattedReply,
          direction: 'outbound',
          twilio_message_sid: aiReplySid,
          status: 'queued',
          session_id: sessionId,
          processed: true,
        });

      // Mark original message as processed
      await supabase
        .from('whatsapp_messages')
        .update({ 
          processed: true,
          session_id: sessionId 
        })
        .eq('id', message.id);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Message processed successfully' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Process message error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
