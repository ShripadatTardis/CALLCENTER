
import { CallScript } from '@/types/auth';

export const sampleCallScripts: CallScript[] = [
  {
    id: 'script_1',
    name: 'loan_emi_reminder_eng_v1',
    campaignType: 'loan_emi_reminder',
    content: 'Hello {{name}}, this is a friendly reminder from Zenyth Bank. Your EMI of KES {{amount}} is due on {{due_date}}. Would you like me to send you a payment link to make this payment convenient for you?',
    language: 'english',
    version: 'v1',
    placeholders: ['name', 'amount', 'due_date']
  },
  {
    id: 'script_2',
    name: 'loan_overdue_followup_eng_v1',
    campaignType: 'overdue_loan_followup',
    content: 'Hello {{name}}, this is a friendly reminder from Zenyth Bank about your overdue loan payment of KES {{amount}}. Your payment was due on {{due_date}}. To avoid any late fees, please make the payment today. Can I assist you with a payment link?',
    language: 'english',
    version: 'v1',
    placeholders: ['name', 'amount', 'due_date']
  },
  {
    id: 'script_3',
    name: 'document_reminder_eng_v1',
    campaignType: 'document_reminder',
    content: 'Hello {{name}}, we are waiting for your KYC documents to complete your loan application with Zenyth Bank. Please upload the required documents to proceed with your application. Would you like me to guide you through the process?',
    language: 'english',
    version: 'v1',
    placeholders: ['name']
  },
  {
    id: 'script_4',
    name: 'creditcard_offer_eng_v1',
    campaignType: 'cross_sell',
    content: 'Hello {{name}}, as one of our valued customers, we are offering you a no-annual-fee credit card with exclusive benefits. Would you like to know more about this special offer from Zenyth Bank?',
    language: 'english',
    version: 'v1',
    placeholders: ['name']
  },
  {
    id: 'script_5',
    name: 'welcome_call_eng_v1',
    campaignType: 'welcome_call',
    content: 'Hello {{name}}, welcome to Zenyth Bank! Thank you for choosing us for your banking needs. I am calling to ensure you have everything you need and to introduce you to our digital services. Do you have any questions I can help with?',
    language: 'english',
    version: 'v1',
    placeholders: ['name']
  }
];
