
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface FormatResult {
  formattedText: string;
  strategy: 'LOCAL' | 'AI';
}

// LOCAL formatting function with enhanced rules
function formatLocal(text: string): string {
  let formatted = text;
  
  // Replace currency mentions
  formatted = formatted.replace(/Ghanaian Cedi/gi, 'GHS');
  formatted = formatted.replace(/Ghana Cedis/gi, 'GHS');
  
  // Convert account references with emojis
  formatted = formatted.replace(/Savings Account (\d+)/gi, '💰 Account $1');
  formatted = formatted.replace(/Account (\d+)/gi, '💰 Account $1');
  formatted = formatted.replace(/Fixed Deposit/gi, '🏦 Fixed Deposit');
  formatted = formatted.replace(/Current Account/gi, '💳 Current Account');
  
  // Clean up headers and markdown
  formatted = formatted.replace(/###\s*\*\*([^*]+)\*\*.*?/g, '$1');
  formatted = formatted.replace(/###\s*([^#\n]+)/g, '$1');
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '$1');
  
  // Convert bullet points
  formatted = formatted.replace(/^\s*-\s*(.+)$/gm, '\n• $1');
  formatted = formatted.replace(/^\s*\*\s*(.+)$/gm, '\n• $1');
  
  // Add contextual emojis for banking terms
  formatted = formatted.replace(/Balance:/gi, '💰 Balance:');
  formatted = formatted.replace(/Available Balance:/gi, '💰 Available:');
  formatted = formatted.replace(/Transaction/gi, '🧾 Transaction');
  formatted = formatted.replace(/Transfer/gi, '💸 Transfer');
  formatted = formatted.replace(/Deposit/gi, '💵 Deposit');
  formatted = formatted.replace(/Withdrawal/gi, '🏧 Withdrawal');
  formatted = formatted.replace(/Loan/gi, '💳 Loan');
  formatted = formatted.replace(/EMI/gi, '💳 EMI');
  formatted = formatted.replace(/Interest/gi, '📊 Interest');
  formatted = formatted.replace(/Payment/gi, '💳 Payment');
  formatted = formatted.replace(/Outstanding/gi, '⚠️ Outstanding');
  
  // Format dates to be more concise
  formatted = formatted.replace(/(\d{1,2})(st|nd|rd|th) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})/gi, '$1 $3 $4');
  
  // Clean up extra whitespace and line breaks
  formatted = formatted.replace(/\n\s*\n\s*\n/g, '\n\n');
  formatted = formatted.replace(/^\s+|\s+$/g, '');
  formatted = formatted.trim();
  
  // Ensure WhatsApp-friendly length (split long messages if needed)
  if (formatted.length > 1500) {
    const sentences = formatted.split(/[.!?]\s+/);
    const halfPoint = Math.ceil(sentences.length / 2);
    formatted = sentences.slice(0, halfPoint).join('. ') + '.\n\n(Continued...)';
  }
  
  return formatted;
}

// AI formatting function using OpenAI
async function formatWithLLM(text: string): Promise<string> {
  try {
    const llmProvider = Deno.env.get('LLM_PROVIDER');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (llmProvider !== 'OPENAI' || !openaiApiKey) {
      console.log('LLM provider not OPENAI or API key missing, falling back to LOCAL');
      return formatLocal(text);
    }
    
    const systemPrompt = `You are a WhatsApp message formatter for a bank's customer service. 
Rewrite banking assistant replies to be:
- Concise and WhatsApp-friendly (under 500 characters when possible)
- Use bullets (•) for lists
- Replace "Ghanaian Cedi" with "GHS" 
- Add relevant emojis (💰 for money/balance, 🏦 for banking, 📊 for data, 🧾 for transactions, 💳 for payments/loans, 💸 for transfers, 🏧 for withdrawals)
- Keep it professional but friendly
- Preserve all important numerical data and dates
- Remove unnecessary headers and formatting
- Make dates more concise (e.g., "15 March 2024" instead of "15th March, 2024")`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        max_tokens: 800,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error('OpenAI API error:', response.status);
      return formatLocal(text);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content?.trim();
    
    if (!aiResponse) {
      console.error('No response from OpenAI');
      return formatLocal(text);
    }
    
    return aiResponse;
  } catch (error) {
    console.error('Error in AI formatting:', error);
    return formatLocal(text);
  }
}

// Main formatting and logging function
export async function formatAndLogVapiResponse(
  rawText: string, 
  sessionId: string | null, 
  whatsappNumber: string
): Promise<string> {
  try {
    // Check if formatting is enabled
    const formattingEnabled = Deno.env.get('FORMATTING_ENABLED');
    
    if (formattingEnabled !== 'true') {
      console.log('Formatting is disabled, returning original text without logging');
      return rawText;
    }
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get formatting strategy from environment
    const formatOption = Deno.env.get('CHAT_FORMAT_OPTION') || 'LOCAL';
    
    let result: FormatResult;
    
    if (formatOption === 'AI') {
      const formattedText = await formatWithLLM(rawText);
      result = {
        formattedText,
        strategy: 'AI'
      };
    } else {
      const formattedText = formatLocal(rawText);
      result = {
        formattedText,
        strategy: 'LOCAL'
      };
    }
    
    // Log the formatting operation
    const { error: logError } = await supabase
      .from('vapi_response_logs')
      .insert({
        session_id: sessionId,
        whatsapp_number: whatsappNumber,
        original_text: rawText,
        formatted_text: result.formattedText,
        format_strategy: result.strategy,
      });
    
    if (logError) {
      console.error('Error logging VAPI response formatting:', logError);
    }
    
    console.log(`Formatted message using ${result.strategy} strategy`);
    return result.formattedText;
  } catch (error) {
    console.error('Error in formatAndLogVapiResponse:', error);
    // Return original text on any error
    return rawText;
  }
}
