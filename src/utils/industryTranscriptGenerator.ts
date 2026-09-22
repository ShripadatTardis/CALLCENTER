
import { Industry } from '@/types/industry';

interface TranscriptEntry {
  speaker: 'AI' | 'Customer';
  time: string;
  message: string;
}

const getBankingTranscript = (customerName: string): TranscriptEntry[] => [
  { 
    speaker: 'AI', 
    time: '00:00', 
    message: `Hello ${customerName}, this is a friendly reminder from Zenyth Bank. Your EMI payment is due soon. Is this a good time to talk?` 
  },
  { 
    speaker: 'Customer', 
    time: '00:15', 
    message: 'Yes, I can talk now.' 
  },
  { 
    speaker: 'AI', 
    time: '00:18', 
    message: 'Great! Your EMI of KES 15,000 is due on the 15th of this month. Would you like me to send you a payment link to make this convenient for you?' 
  },
  { 
    speaker: 'Customer', 
    time: '00:35', 
    message: 'Yes, that would be helpful. Can you send it to my registered mobile number?' 
  },
  { 
    speaker: 'AI', 
    time: '00:42', 
    message: 'Absolutely! I will send the payment link to your registered mobile number ending in 5678. You should receive it within the next few minutes. Is there anything else I can help you with today?' 
  },
  { 
    speaker: 'Customer', 
    time: '01:15', 
    message: 'No, that\'s all. Thank you!' 
  },
  { 
    speaker: 'AI', 
    time: '01:18', 
    message: 'You\'re welcome! Thank you for banking with Zenyth Bank. Have a great day!' 
  }
];

const getTelecomTranscript = (customerName: string): TranscriptEntry[] => [
  { 
    speaker: 'AI', 
    time: '00:00', 
    message: `Hello ${customerName}, this is TeleConnect regarding your monthly bill payment. Your bill of $45.99 is due in 3 days. Would you like to make the payment now?` 
  },
  { 
    speaker: 'Customer', 
    time: '00:12', 
    message: 'Hi, yes I\'d like to pay my bill. Can you help me with that?' 
  },
  { 
    speaker: 'AI', 
    time: '00:18', 
    message: 'Of course! I can process your payment right now. Would you like to use your saved payment method ending in 1234?' 
  },
  { 
    speaker: 'Customer', 
    time: '00:25', 
    message: 'Yes, that\'s fine. Please go ahead.' 
  },
  { 
    speaker: 'AI', 
    time: '00:30', 
    message: 'Perfect! I\'ve processed your payment of $45.99. You should receive a confirmation SMS shortly. Also, I notice you\'re eligible for our new unlimited data plan. Would you like to hear about it?' 
  },
  { 
    speaker: 'Customer', 
    time: '00:45', 
    message: 'Sure, tell me more about the unlimited plan.' 
  },
  { 
    speaker: 'AI', 
    time: '00:48', 
    message: 'Our unlimited plan offers unlimited talk, text, and high-speed data for just $10 more per month. Would you like me to upgrade your plan?' 
  },
  { 
    speaker: 'Customer', 
    time: '01:05', 
    message: 'That sounds good. Please upgrade my plan.' 
  },
  { 
    speaker: 'AI', 
    time: '01:10', 
    message: 'Excellent! Your plan has been upgraded and will take effect on your next billing cycle. Thank you for choosing TeleConnect!' 
  }
];

const getAirlinesTranscript = (customerName: string): TranscriptEntry[] => [
  { 
    speaker: 'AI', 
    time: '00:00', 
    message: `Hello ${customerName}, this is SkyWings Airlines. Your flight SW1234 to New York is scheduled for tomorrow at 2:30 PM. Online check-in is now available. Would you like me to help you check in?` 
  },
  { 
    speaker: 'Customer', 
    time: '00:15', 
    message: 'Yes, I\'d like to check in. Can you also tell me about seat selection?' 
  },
  { 
    speaker: 'AI', 
    time: '00:20', 
    message: 'Absolutely! I\'ve checked you in for flight SW1234. For seat selection, you currently have seat 12B assigned. Premium seats with extra legroom are available for $25. Would you like to upgrade?' 
  },
  { 
    speaker: 'Customer', 
    time: '00:35', 
    message: 'What seats are available in the front?' 
  },
  { 
    speaker: 'AI', 
    time: '00:40', 
    message: 'I have seats 3A and 4C available with extra legroom. Both offer priority boarding and are located near the front of the aircraft.' 
  },
  { 
    speaker: 'Customer', 
    time: '00:50', 
    message: 'I\'ll take seat 3A please.' 
  },
  { 
    speaker: 'AI', 
    time: '00:55', 
    message: 'Perfect! I\'ve assigned you seat 3A and charged $25 to your original payment method. Your boarding pass has been sent to your email. Please arrive at the airport 2 hours early. Have a wonderful flight!' 
  }
];

const getHotelsTranscript = (customerName: string): TranscriptEntry[] => [
  { 
    speaker: 'AI', 
    time: '00:00', 
    message: `Hello ${customerName}, this is Grand Plaza Hotel. I\'m calling to confirm your reservation for tomorrow, March 15th. Your check-in is scheduled for 3:00 PM. Is everything still on track?` 
  },
  { 
    speaker: 'Customer', 
    time: '00:12', 
    message: 'Yes, that\'s correct. I should arrive around 4:00 PM though. Is that okay?' 
  },
  { 
    speaker: 'AI', 
    time: '00:18', 
    message: 'Absolutely, no problem at all! I\'ve noted your later arrival time. I also wanted to mention that we have a complimentary room upgrade available to our Executive Suite. Would you be interested?' 
  },
  { 
    speaker: 'Customer', 
    time: '00:30', 
    message: 'That sounds great! What does the Executive Suite include?' 
  },
  { 
    speaker: 'AI', 
    time: '00:35', 
    message: 'The Executive Suite features a separate living area, city view, complimentary breakfast, and access to our executive lounge with evening cocktails. There\'s no additional charge for this upgrade.' 
  },
  { 
    speaker: 'Customer', 
    time: '00:50', 
    message: 'Perfect! I\'ll take the upgrade. Thank you so much.' 
  },
  { 
    speaker: 'AI', 
    time: '00:55', 
    message: 'Wonderful! I\'ve upgraded your reservation to the Executive Suite. We look forward to welcoming you tomorrow. Have a great day!' 
  }
];

const getHospitalsTranscript = (customerName: string): TranscriptEntry[] => [
  { 
    speaker: 'AI', 
    time: '00:00', 
    message: `Hello ${customerName}, this is MediCare Hospital calling to remind you about your appointment with Dr. Smith tomorrow at 10:00 AM. Can you confirm your attendance?` 
  },
  { 
    speaker: 'Customer', 
    time: '00:12', 
    message: 'Yes, I\'ll be there. Do I need to bring anything specific?' 
  },
  { 
    speaker: 'AI', 
    time: '00:18', 
    message: 'Please bring a valid ID, your insurance card, and any current medications you\'re taking. Also, please arrive 15 minutes early for check-in. Do you have any questions about the appointment?' 
  },
  { 
    speaker: 'Customer', 
    time: '00:30', 
    message: 'Will my test results from last week be available?' 
  },
  { 
    speaker: 'AI', 
    time: '00:35', 
    message: 'Yes, Dr. Smith will have your lab results ready for review during your appointment. He\'ll discuss the findings and next steps with you then.' 
  },
  { 
    speaker: 'Customer', 
    time: '00:45', 
    message: 'Great! I\'ll see you tomorrow at 10 AM then.' 
  },
  { 
    speaker: 'AI', 
    time: '00:50', 
    message: 'Perfect! We look forward to seeing you tomorrow. If you need to reschedule, please call us at least 24 hours in advance. Take care!' 
  }
];

const getAutomotiveTranscript = (customerName: string): TranscriptEntry[] => [
  { 
    speaker: 'AI', 
    time: '00:00', 
    message: `Hello ${customerName}, this is AutoCare Service Center. Your 2023 Honda Accord is due for its 15,000-mile service. Would you like to schedule an appointment?` 
  },
  { 
    speaker: 'Customer', 
    time: '00:15', 
    message: 'Yes, I\'ve been meaning to schedule that. What does the service include?' 
  },
  { 
    speaker: 'AI', 
    time: '00:22', 
    message: 'The 15,000-mile service includes oil change, tire rotation, brake inspection, fluid level checks, and a complimentary multi-point inspection. It typically takes about 90 minutes.' 
  },
  { 
    speaker: 'Customer', 
    time: '00:40', 
    message: 'Sounds good. What days are available this week?' 
  },
  { 
    speaker: 'AI', 
    time: '00:45', 
    message: 'We have availability on Thursday at 9:00 AM, Friday at 2:00 PM, or Saturday at 11:00 AM. Which works best for you?' 
  },
  { 
    speaker: 'Customer', 
    time: '01:00', 
    message: 'I\'ll take Thursday at 9:00 AM please.' 
  },
  { 
    speaker: 'AI', 
    time: '01:05', 
    message: 'Perfect! I\'ve scheduled your service for Thursday, March 14th at 9:00 AM. We\'ll send you a confirmation text with all the details. See you then!' 
  }
];

const getInsuranceTranscript = (customerName: string): TranscriptEntry[] => [
  { 
    speaker: 'AI', 
    time: '00:00', 
    message: `Hello ${customerName}, this is an automated call from SecureLife Insurance regarding your policy premium.` 
  },
  { 
    speaker: 'Customer', 
    time: '00:08', 
    message: 'Yes, go ahead.' 
  },
  { 
    speaker: 'AI', 
    time: '00:10', 
    message: 'Your premium of $1,245 is due on March 15th. Would you like to make the payment now?' 
  },
  { 
    speaker: 'Customer', 
    time: '00:18', 
    message: 'Can I pay it online?' 
  },
  { 
    speaker: 'AI', 
    time: '00:20', 
    message: 'Absolutely! You can pay through our mobile app or website. I can send you a payment link via SMS.' 
  },
  { 
    speaker: 'Customer', 
    time: '00:30', 
    message: 'That would be great, thank you.' 
  },
  { 
    speaker: 'AI', 
    time: '00:33', 
    message: 'Perfect! I\'ve sent the link to your registered mobile number. Is there anything else I can help you with?' 
  },
  { 
    speaker: 'Customer', 
    time: '00:42', 
    message: 'No, that\'s all. Thank you.' 
  },
  { 
    speaker: 'AI', 
    time: '00:45', 
    message: 'You\'re welcome! Have a great day, and thank you for choosing SecureLife Insurance.' 
  }
];

export const getIndustrySpecificTranscript = (industry: Industry, customerName: string): TranscriptEntry[] => {
  switch (industry) {
    case 'banking':
      return getBankingTranscript(customerName);
    case 'telecom':
      return getTelecomTranscript(customerName);
    case 'airlines':
      return getAirlinesTranscript(customerName);
    case 'hotels':
      return getHotelsTranscript(customerName);
    case 'hospitals':
      return getHospitalsTranscript(customerName);
    case 'automotive':
      return getAutomotiveTranscript(customerName);
    case 'insurance':
      return getInsuranceTranscript(customerName);
    default:
      return getBankingTranscript(customerName);
  }
};
