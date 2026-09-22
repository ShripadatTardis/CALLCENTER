
import { TranscriptEntry } from '@/types/auth';

export const generateDetailedTranscript = (callType: string, callerName: string): TranscriptEntry[] => {
  const baseTranscripts: Record<string, TranscriptEntry[]> = {
    billing: [
      { timestamp: '00:00:00', speaker: 'ai', text: 'Hello, thank you for calling Zenyth Bank. How can I assist you today?', sentiment: 'neutral', confidence: 0.95 },
      { timestamp: '00:00:05', speaker: 'customer', text: 'Hi, I have a question about my recent bill. There seems to be a charge I don\'t recognize.', sentiment: 'neutral', confidence: 0.92 },
      { timestamp: '00:00:15', speaker: 'ai', text: 'I\'d be happy to help you with your billing inquiry. Let me pull up your account details.', sentiment: 'positive', confidence: 0.96 },
      { timestamp: '00:00:25', speaker: 'customer', text: 'Thank you. The charge is for $25.99 on March 15th.', sentiment: 'neutral', confidence: 0.89 },
      { timestamp: '00:00:35', speaker: 'ai', text: 'I can see that charge. It appears to be an overdraft fee. I can provide more details and discuss options to avoid this in the future.', sentiment: 'neutral', confidence: 0.94 },
      { timestamp: '00:00:50', speaker: 'customer', text: 'That would be great. Can you help me set up overdraft protection?', sentiment: 'positive', confidence: 0.91 },
      { timestamp: '00:01:00', speaker: 'ai', text: 'Absolutely! I\'ve added overdraft protection to your account and set up balance alerts. Is there anything else I can help you with?', sentiment: 'positive', confidence: 0.97 }
    ],
    loan: [
      { timestamp: '00:00:00', speaker: 'ai', text: 'Good afternoon! This is Zenyth Bank AI assistant. How may I help you today?', sentiment: 'positive', confidence: 0.98 },
      { timestamp: '00:00:06', speaker: 'customer', text: 'Hi, I submitted a loan application last week and wanted to check on the status.', sentiment: 'neutral', confidence: 0.94 },
      { timestamp: '00:00:15', speaker: 'ai', text: 'I\'ll be glad to check that for you. Let me look up your application status right now.', sentiment: 'positive', confidence: 0.96 },
      { timestamp: '00:00:25', speaker: 'customer', text: 'Great, thank you.', sentiment: 'positive', confidence: 0.93 },
      { timestamp: '00:00:30', speaker: 'ai', text: 'Good news! Your loan application has been approved. You should receive the documentation via email within 24 hours.', sentiment: 'positive', confidence: 0.99 },
      { timestamp: '00:00:45', speaker: 'customer', text: 'That\'s wonderful! What are the next steps?', sentiment: 'positive', confidence: 0.95 },
      { timestamp: '00:00:50', speaker: 'ai', text: 'You\'ll need to review and sign the documents, then funds will be disbursed within 3-5 business days.', sentiment: 'neutral', confidence: 0.97 }
    ],
    technical: [
      { timestamp: '00:00:00', speaker: 'ai', text: 'Hello, thank you for contacting Zenyth Bank. How can I assist you?', sentiment: 'neutral', confidence: 0.94 },
      { timestamp: '00:00:07', speaker: 'customer', text: 'I\'m having issues with the mobile app. It keeps crashing when I try to access my portfolio.', sentiment: 'negative', confidence: 0.88 },
      { timestamp: '00:00:18', speaker: 'ai', text: 'I understand your frustration. Let me help troubleshoot this issue. What device are you using?', sentiment: 'neutral', confidence: 0.85 },
      { timestamp: '00:00:28', speaker: 'customer', text: 'iPhone 14 Pro, latest iOS version. I\'ve tried restarting and reinstalling the app.', sentiment: 'negative', confidence: 0.82 },
      { timestamp: '00:00:40', speaker: 'ai', text: 'This seems like a complex technical issue. Let me connect you with our technical team for advanced troubleshooting.', sentiment: 'neutral', confidence: 0.79 },
      { timestamp: '00:00:55', speaker: 'customer', text: 'Okay, that would be helpful. How long will the wait be?', sentiment: 'neutral', confidence: 0.91 },
      { timestamp: '00:01:02', speaker: 'ai', text: 'The current wait time is approximately 5 minutes. I\'ll ensure a smooth transfer. Thank you for your patience.', sentiment: 'positive', confidence: 0.87 }
    ]
  };

  // Return appropriate transcript based on call type
  const transcript = baseTranscripts[callType] || baseTranscripts['billing'];
  
  // Personalize the first AI message with caller name if available
  return transcript.map((entry, index) => {
    if (index === 0 && entry.speaker === 'ai' && callerName) {
      return {
        ...entry,
        text: `Hello ${callerName.split(' ')[0]}, thank you for calling Zenyth Bank. How can I assist you today?`
      };
    }
    return entry;
  });
};
