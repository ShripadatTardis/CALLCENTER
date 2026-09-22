
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { formatAndLogVapiResponse } from '../shared/vapi-formatter.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    
    console.log('Webhook received:', Object.fromEntries(formData));

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract message data from Twilio webhook
    const messageSid = formData.get('MessageSid') as string;
    const from = formData.get('From') as string;
    const to = formData.get('To') as string;
    const body = formData.get('Body') as string;
    const messageStatus = formData.get('SmsStatus') as string;

    if (!messageSid || !from || !to || !body) {
      console.log('Missing required fields');
      return new Response('OK', { status: 200 });
    }

    // Remove 'whatsapp:' prefix from phone numbers
    const fromNumber = from.replace('whatsapp:', '');
    const toNumber = to.replace('whatsapp:', '');

    // Get credentials from environment
    const vapiApiKey = Deno.env.get('VAPI_API_KEY');
    const vapiAssistantId = Deno.env.get('VAPI_ASSISTANT_ID');
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioFromNumber = Deno.env.get('TWILIO_FROM_NUMBER');

    // Check if authentication is enabled
    const authEnabled = Deno.env.get('WHATSAPP_AUTH_ENABLED') === 'true';
    const idleTimeoutMinutes = parseInt(Deno.env.get('AUTH_IDLE_TIMEOUT_MINUTES') || '5');

    if (!vapiApiKey || !vapiAssistantId) {
      console.error('VAPI_API_KEY or VAPI_ASSISTANT_ID not found');
      return new Response('OK', { status: 200 });
    }

    if (!twilioAccountSid || !twilioAuthToken || !twilioFromNumber) {
      console.error('Missing Twilio credentials');
      return new Response('OK', { status: 200 });
    }

    // Helper function to send WhatsApp message via Twilio or Simulator
    const sendWhatsAppMessage = async (messageBody: string) => {
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
              To: from,
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
                To: from,
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
              to_number: fromNumber,
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

    // Store incoming message in database
    const { data: incomingMessage, error } = await supabase
      .from('whatsapp_messages')
      .insert({
        from_number: fromNumber,
        to_number: toNumber,
        message_body: body,
        direction: 'inbound',
        twilio_message_sid: messageSid,
        status: messageStatus || 'received',
        processed: false, // Default to unprocessed
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    console.log('Incoming message stored:', incomingMessage);

    // Authentication check if enabled
    if (authEnabled) {
      // Check for existing session and authentication status
      const { data: session, error: sessionError } = await supabase
        .from('whatsapp_sessions')
        .select('*')
        .eq('phone_number', fromNumber)
        .maybeSingle();

      if (sessionError) {
        console.error('Error checking session:', sessionError);
      }

      let isAuthenticated = false;
      if (session) {
        // Check if authenticated and not expired
        const lastActiveTime = new Date(session.last_active || 0);
        const timeoutTime = new Date(Date.now() - idleTimeoutMinutes * 60 * 1000);
        
        isAuthenticated = session.authenticated && lastActiveTime > timeoutTime;
        
        if (!isAuthenticated && session.authenticated) {
          // Mark as not authenticated due to timeout
          await supabase
            .from('whatsapp_sessions')
            .update({ authenticated: false })
            .eq('phone_number', fromNumber);
        }
      }

      if (!isAuthenticated) {
        // Send login link
        const loginUrl = `${Deno.env.get('SITE_URL') || 'https://wyzmsetlxltnojyxjkkd.supabase.co'}/whatsapp-authenticate?phone=${encodeURIComponent(fromNumber)}`;
        const loginMessage = `Please log in to continue: ${loginUrl}`;
        
        await sendWhatsAppMessage(loginMessage);
        
        console.log('Authentication required, login link sent to:', fromNumber);
        return new Response('OK', { status: 200 });
      }

      // Update last active time
      await supabase
        .from('whatsapp_sessions')
        .update({ last_active: new Date().toISOString() })
        .eq('phone_number', fromNumber);
    }

    // Continue with existing message processing logic
    let sessionId = null;
    let isNewSession = false;

    // Check for existing VAPI session
    const { data: existingSession, error: sessionError } = await supabase
      .from('whatsapp_sessions')
      .select('session_id')
      .eq('phone_number', fromNumber)
      .maybeSingle();

    if (sessionError) {
      console.error('Error checking existing session:', sessionError);
    } else if (existingSession) {
      sessionId = existingSession.session_id;
      console.log('Found existing session:', sessionId);
    }

    // Helper function to create new VAPI session
    const createVAPISession = async () => {
      try {
        console.log('Creating new VAPI session...');
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
          console.log('VAPI session created:', sessionData);
          return sessionData.id;
        } else {
          const errorText = await sessionResponse.text();
          console.error('VAPI session creation error:', sessionResponse.status, errorText);
          return null;
        }
      } catch (error) {
        console.error('Error creating VAPI session:', error);
        return null;
      }
    };

    // If no session exists, create a new one
    if (!sessionId) {
      sessionId = await createVAPISession();
      if (sessionId) {
        // Store new session in database
        const { error: upsertError } = await supabase
          .from('whatsapp_sessions')
          .upsert({
            phone_number: fromNumber,
            session_id: sessionId,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'phone_number'
          });

        if (upsertError) {
          console.error('Error storing new session:', upsertError);
        } else {
          console.log('New session stored:', sessionId);
          isNewSession = true;
        }
      }
    }

    // Send "fresh conversation" notice if new session
    if (isNewSession) {
      const freshConversationText = "A fresh conversation has been initiated.";
      const formattedFreshText = await formatAndLogVapiResponse(freshConversationText, sessionId, fromNumber);
      const freshConversationSid = await sendWhatsAppMessage(formattedFreshText);
      if (freshConversationSid) {
        // Update the stored message with session_id
        await supabase
          .from('whatsapp_messages')
          .update({ session_id: sessionId })
          .eq('twilio_message_sid', freshConversationSid);
      }
    }

    // Call VAPI Chat API
    let aiReply = "Sorry, I couldn't process your message right now.";
    let retryCount = 0;
    const maxRetries = 1;

    while (retryCount <= maxRetries && sessionId) {
      try {
        console.log(`Calling VAPI Chat API (attempt ${retryCount + 1}) with sessionId:`, sessionId);
        
        const vapiResponse = await fetch('https://api.vapi.ai/chat', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${vapiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: sessionId,
            input: body,
          }),
        });

        if (vapiResponse.ok) {
          const vapiData = await vapiResponse.json();
          console.log('VAPI response:', vapiData);
          
          // Extract response from output array
          if (vapiData.output && vapiData.output.length > 0 && vapiData.output[0].content) {
            aiReply = vapiData.output[0].content;
            break; // Success, exit retry loop
          } else {
            console.error('Unexpected VAPI response format:', vapiData);
            break; // Don't retry for format issues
          }
        } else {
          const errorText = await vapiResponse.text();
          console.error('VAPI API error:', vapiResponse.status, errorText);
          
          // Check if it's a session not found error
          if (vapiResponse.status === 400 && errorText.includes('session')) {
            console.log('Session not found, creating new session...');
            
            // Create new session
            sessionId = await createVAPISession();
            if (sessionId) {
              // Update session in database
              const { error: updateError } = await supabase
                .from('whatsapp_sessions')
                .upsert({
                  phone_number: fromNumber,
                  session_id: sessionId,
                  updated_at: new Date().toISOString(),
                }, {
                  onConflict: 'phone_number'
                });

              if (updateError) {
                console.error('Error updating session:', updateError);
              }

              // Send fresh conversation notice
              const freshConversationText = "A fresh conversation has been initiated.";
              const formattedFreshText = await formatAndLogVapiResponse(freshConversationText, sessionId, fromNumber);
              const freshConversationSid = await sendWhatsAppMessage(formattedFreshText);
              if (freshConversationSid) {
                await supabase
                  .from('whatsapp_messages')
                  .update({ session_id: sessionId })
                  .eq('twilio_message_sid', freshConversationSid);
              }
            }
          } else {
            break; // Don't retry for other errors
          }
        }
      } catch (vapiError) {
        console.error('Error calling VAPI API:', vapiError);
        break; // Don't retry for network errors
      }
      
      retryCount++;
    }

    // Format and send AI reply
    if (sessionId) {
      const formattedReply = await formatAndLogVapiResponse(aiReply, sessionId, fromNumber);
      const aiReplySid = await sendWhatsAppMessage(formattedReply);
      if (aiReplySid) {
        // Update the AI reply message with session_id
        await supabase
          .from('whatsapp_messages')
          .update({ session_id: sessionId })
          .eq('twilio_message_sid', aiReplySid);
      }

      // Update the original incoming message with session_id and mark as processed
      await supabase
        .from('whatsapp_messages')
        .update({ 
          session_id: sessionId,
          processed: true 
        })
        .eq('id', incomingMessage.id);
    }

    return new Response('OK', { status: 200 });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('Error', { status: 500 });
  }
});
