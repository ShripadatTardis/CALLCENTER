
import { NPSScript } from '@/types/auth';

export const sampleNPSScripts: NPSScript[] = [
  {
    id: 'nps_voice_standard_v1',
    name: 'Standard Voice NPS Survey',
    type: 'voice',
    content: 'Hello {{name}}, this is {{bank_name}}. On a scale from 0 to 10, where 10 means extremely likely and 0 means not at all likely, how likely are you to recommend {{bank_name}} to a friend or colleague? Please press the number on your keypad or say the number clearly.',
    language: 'English',
    version: '1.0',
    placeholders: ['name', 'bank_name']
  },
  {
    id: 'nps_whatsapp_template',
    name: 'WhatsApp NPS Quick Survey',
    type: 'whatsapp',
    content: 'Hi {{name}}! 👋 How likely are you to recommend {{bank_name}} to others? Please reply with a number from 0-10. We value your feedback! 🌟',
    language: 'English',
    version: '1.0',
    placeholders: ['name', 'bank_name']  
  },
  {
    id: 'nps_sms_standard_v1',
    name: 'Standard SMS NPS Survey',
    type: 'sms',
    content: '{{bank_name}}: Rate us 0-10! How likely are you to recommend us to others? Reply with just the number. Thank you {{name}}!',
    language: 'English',
    version: '1.0',
    placeholders: ['name', 'bank_name']
  },
  {
    id: 'nps_email_v1',
    name: 'Email NPS Survey',
    type: 'email',
    content: 'Dear {{name}}, we value your opinion! Please click the link below to rate how likely you are to recommend {{bank_name}} to others on a scale of 0-10. [Survey Link]',
    language: 'English',
    version: '1.0',
    placeholders: ['name', 'bank_name']
  }
];
