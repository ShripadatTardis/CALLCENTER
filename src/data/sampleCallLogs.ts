
import { CallLog } from '@/types/auth';

export const sampleCallLogs: CallLog[] = [
  {
    id: 'log_001',
    callId: 'call_002',
    transcript: 'Customer: Hi, I wanted to check on my loan application status.\nAI: Hello! I can help you check your loan status. May I have your application reference number?\nCustomer: Sure, it\'s LA-2024-5678.\nAI: Thank you. Let me check that for you... Your loan application has been approved! You should receive the documents within 2-3 business days.',
    recording: '/recordings/call_002.mp3',
    tags: ['Loan Status', 'Approved', 'Satisfied Customer'],
    outcome: 'resolved',
    fcr: true,
    aht: 180,
    intentAccuracy: 0.95,
    csatScore: 5,
    csatRating: 'excellent',
    csatFeedback: 'Very helpful and quick response'
  },
  {
    id: 'log_002',
    callId: 'call_003',
    transcript: 'Customer: I\'m having trouble with my online banking login.\nAI: I understand you\'re having login issues. Let me help troubleshoot this...\nCustomer: I\'ve tried everything and it\'s still not working. This is really frustrating.\nAI: I apologize for the inconvenience. This appears to be a complex technical issue that requires specialized assistance. Let me connect you with our technical support team.',
    recording: '/recordings/call_003.mp3',
    tags: ['Technical Support', 'Escalated', 'Login Issues'],
    outcome: 'escalated',
    fcr: false,
    aht: 420,
    intentAccuracy: 0.87,
    csatScore: 2,
    csatRating: 'fair',
    csatFeedback: 'Issue not resolved, had to escalate'
  }
];
