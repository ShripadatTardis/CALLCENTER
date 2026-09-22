
import { Industry } from '@/types/industry';
import { CampaignContact } from '@/types/auth';

export const getIndustrySpecificCampaignContacts = (industry: Industry, campaignId: string): CampaignContact[] => {
  const baseDate = new Date();
  
  const contacts: Record<Industry, CampaignContact[]> = {
    banking: [
      {
        id: 'contact-bank-001',
        campaignId,
        name: 'Rajesh Kumar',
        mobileNumber: '+91-9876543210',
        language: 'en',
        accountId: 'ACC-BANK-001',
        status: 'completed',
        actionTaken: 'payment_link_sent',
        callTimestamp: new Date(baseDate.getTime() - 2 * 60 * 60 * 1000),
        callDuration: 180,
        transcriptId: 'transcript-bank-001',
        recordingId: 'recording-bank-001'
      },
      {
        id: 'contact-bank-002',
        campaignId,
        name: 'Priya Sharma',
        mobileNumber: '+91-9876543211',
        language: 'en',
        accountId: 'ACC-BANK-002',
        status: 'not_answered',
        actionTaken: null,
        callTimestamp: new Date(baseDate.getTime() - 4 * 60 * 60 * 1000),
        callDuration: 0,
        transcriptId: null,
        recordingId: null
      },
      {
        id: 'contact-bank-003',
        campaignId,
        name: 'Amit Verma',
        mobileNumber: '+91-9876543212',
        language: 'en',
        accountId: 'ACC-BANK-003',
        status: 'completed',
        actionTaken: 'callback_requested',
        callTimestamp: new Date(baseDate.getTime() - 6 * 60 * 60 * 1000),
        callDuration: 240,
        transcriptId: 'transcript-bank-003',
        recordingId: 'recording-bank-003'
      },
      {
        id: 'contact-bank-004',
        campaignId,
        name: 'Sneha Patel',
        mobileNumber: '+91-9876543213',
        language: 'en',
        accountId: 'ACC-BANK-004',
        status: 'completed',
        actionTaken: 'payment_link_sent',
        callTimestamp: new Date(baseDate.getTime() - 8 * 60 * 60 * 1000),
        callDuration: 165,
        transcriptId: 'transcript-bank-004',
        recordingId: 'recording-bank-004'
      }
    ],
    telecom: [
      {
        id: 'contact-telecom-001',
        campaignId,
        name: 'Vikash Singh',
        mobileNumber: '+91-9123456789',
        language: 'en',
        accountId: 'ACC-TEL-001',
        status: 'completed',
        actionTaken: 'payment_link_sent',
        callTimestamp: new Date(baseDate.getTime() - 1 * 60 * 60 * 1000),
        callDuration: 195,
        transcriptId: 'transcript-telecom-001',
        recordingId: 'recording-telecom-001'
      },
      {
        id: 'contact-telecom-002',
        campaignId,
        name: 'Anita Reddy',
        mobileNumber: '+91-9123456790',
        language: 'en',
        accountId: 'ACC-TEL-002',
        status: 'completed',
        actionTaken: 'callback_requested',
        callTimestamp: new Date(baseDate.getTime() - 3 * 60 * 60 * 1000),
        callDuration: 320,
        transcriptId: 'transcript-telecom-002',
        recordingId: 'recording-telecom-002'
      },
      {
        id: 'contact-telecom-003',
        campaignId,
        name: 'Rohit Gupta',
        mobileNumber: '+91-9123456791',
        language: 'en',
        accountId: 'ACC-TEL-003',
        status: 'not_answered',
        actionTaken: null,
        callTimestamp: new Date(baseDate.getTime() - 5 * 60 * 60 * 1000),
        callDuration: 0,
        transcriptId: null,
        recordingId: null
      },
      {
        id: 'contact-telecom-004',
        campaignId,
        name: 'Kavitha Nair',
        mobileNumber: '+91-9123456792',
        language: 'en',
        accountId: 'ACC-TEL-004',
        status: 'completed',
        actionTaken: 'callback_requested',
        callTimestamp: new Date(baseDate.getTime() - 7 * 60 * 60 * 1000),
        callDuration: 150,
        transcriptId: 'transcript-telecom-004',
        recordingId: 'recording-telecom-004'
      }
    ],
    airlines: [
      {
        id: 'contact-airline-001',
        campaignId,
        name: 'Arjun Kapoor',
        mobileNumber: '+91-9234567890',
        language: 'en',
        accountId: 'ACC-AIR-001',
        status: 'completed',
        actionTaken: 'callback_requested',
        callTimestamp: new Date(baseDate.getTime() - 2 * 60 * 60 * 1000),
        callDuration: 210,
        transcriptId: 'transcript-airline-001',
        recordingId: 'recording-airline-001'
      },
      {
        id: 'contact-airline-002',
        campaignId,
        name: 'Deepika Shah',
        mobileNumber: '+91-9234567891',
        language: 'en',
        accountId: 'ACC-AIR-002',
        status: 'completed',
        actionTaken: 'payment_link_sent',
        callTimestamp: new Date(baseDate.getTime() - 4 * 60 * 60 * 1000),
        callDuration: 145,
        transcriptId: 'transcript-airline-002',
        recordingId: 'recording-airline-002'
      },
      {
        id: 'contact-airline-003',
        campaignId,
        name: 'Manish Agarwal',
        mobileNumber: '+91-9234567892',
        language: 'en',
        accountId: 'ACC-AIR-003',
        status: 'not_answered',
        actionTaken: null,
        callTimestamp: new Date(baseDate.getTime() - 6 * 60 * 60 * 1000),
        callDuration: 0,
        transcriptId: null,
        recordingId: null
      },
      {
        id: 'contact-airline-004',
        campaignId,
        name: 'Shreya Joshi',
        mobileNumber: '+91-9234567893',
        language: 'en',
        accountId: 'ACC-AIR-004',
        status: 'completed',
        actionTaken: 'ignored',
        callTimestamp: new Date(baseDate.getTime() - 8 * 60 * 60 * 1000),
        callDuration: 280,
        transcriptId: 'transcript-airline-004',
        recordingId: 'recording-airline-004'
      }
    ],
    hotels: [
      {
        id: 'contact-hotel-001',
        campaignId,
        name: 'Rahul Mehta',
        mobileNumber: '+91-9345678901',
        language: 'en',
        accountId: 'ACC-HOT-001',
        status: 'completed',
        actionTaken: 'callback_requested',
        callTimestamp: new Date(baseDate.getTime() - 1 * 60 * 60 * 1000),
        callDuration: 175,
        transcriptId: 'transcript-hotel-001',
        recordingId: 'recording-hotel-001'
      },
      {
        id: 'contact-hotel-002',
        campaignId,
        name: 'Pooja Desai',
        mobileNumber: '+91-9345678902',
        language: 'en',
        accountId: 'ACC-HOT-002',
        status: 'completed',
        actionTaken: 'payment_link_sent',
        callTimestamp: new Date(baseDate.getTime() - 3 * 60 * 60 * 1000),
        callDuration: 225,
        transcriptId: 'transcript-hotel-002',
        recordingId: 'recording-hotel-002'
      },
      {
        id: 'contact-hotel-003',
        campaignId,
        name: 'Sandeep Yadav',
        mobileNumber: '+91-9345678903',
        language: 'en',
        accountId: 'ACC-HOT-003',
        status: 'not_answered',
        actionTaken: null,
        callTimestamp: new Date(baseDate.getTime() - 5 * 60 * 60 * 1000),
        callDuration: 0,
        transcriptId: null,
        recordingId: null
      },
      {
        id: 'contact-hotel-004',
        campaignId,
        name: 'Neha Malhotra',
        mobileNumber: '+91-9345678904',
        language: 'en',
        accountId: 'ACC-HOT-004',
        status: 'completed',
        actionTaken: 'ignored',
        callTimestamp: new Date(baseDate.getTime() - 7 * 60 * 60 * 1000),
        callDuration: 190,
        transcriptId: 'transcript-hotel-004',
        recordingId: 'recording-hotel-004'
      }
    ],
    hospitals: [
      {
        id: 'contact-hospital-001',
        campaignId,
        name: 'Sunita Rao',
        mobileNumber: '+91-9456789012',
        language: 'en',
        accountId: 'ACC-HOS-001',
        status: 'completed',
        actionTaken: 'callback_requested',
        callTimestamp: new Date(baseDate.getTime() - 2 * 60 * 60 * 1000),
        callDuration: 160,
        transcriptId: 'transcript-hospital-001',
        recordingId: 'recording-hospital-001'
      },
      {
        id: 'contact-hospital-002',
        campaignId,
        name: 'Ramesh Iyer',
        mobileNumber: '+91-9456789013',
        language: 'en',
        accountId: 'ACC-HOS-002',
        status: 'completed',
        actionTaken: 'payment_link_sent',
        callTimestamp: new Date(baseDate.getTime() - 4 * 60 * 60 * 1000),
        callDuration: 205,
        transcriptId: 'transcript-hospital-002',
        recordingId: 'recording-hospital-002'
      },
      {
        id: 'contact-hospital-003',
        campaignId,
        name: 'Meera Jain',
        mobileNumber: '+91-9456789014',
        language: 'en',
        accountId: 'ACC-HOS-003',
        status: 'not_answered',
        actionTaken: null,
        callTimestamp: new Date(baseDate.getTime() - 6 * 60 * 60 * 1000),
        callDuration: 0,
        transcriptId: null,
        recordingId: null
      },
      {
        id: 'contact-hospital-004',
        campaignId,
        name: 'Anita Singh',
        mobileNumber: '+91-9456789015',
        language: 'en',
        accountId: 'ACC-HOS-004',
        status: 'completed',
        actionTaken: 'escalated',
        callTimestamp: new Date(baseDate.getTime() - 8 * 60 * 60 * 1000),
        callDuration: 240,
        transcriptId: 'transcript-hospital-004',
        recordingId: 'recording-hospital-004'
      }
    ],
    automotive: [
      {
        id: 'contact-auto-001',
        campaignId,
        name: 'Michael Johnson',
        mobileNumber: '+1-555-0301',
        language: 'en',
        accountId: 'ACC-AUTO-001',
        status: 'completed',
        actionTaken: 'callback_requested',
        callTimestamp: new Date(baseDate.getTime() - 2 * 60 * 60 * 1000),
        callDuration: 185,
        transcriptId: 'transcript-auto-001',
        recordingId: 'recording-auto-001'
      },
      {
        id: 'contact-auto-002',
        campaignId,
        name: 'Jennifer Williams',
        mobileNumber: '+1-555-0302',
        language: 'en',
        accountId: 'ACC-AUTO-002',
        status: 'completed',
        actionTaken: 'payment_link_sent',
        callTimestamp: new Date(baseDate.getTime() - 4 * 60 * 60 * 1000),
        callDuration: 220,
        transcriptId: 'transcript-auto-002',
        recordingId: 'recording-auto-002'
      },
      {
        id: 'contact-auto-003',
        campaignId,
        name: 'Robert Davis',
        mobileNumber: '+1-555-0303',
        language: 'en',
        accountId: 'ACC-AUTO-003',
        status: 'not_answered',
        actionTaken: null,
        callTimestamp: new Date(baseDate.getTime() - 6 * 60 * 60 * 1000),
        callDuration: 0,
        transcriptId: null,
        recordingId: null
      },
      {
        id: 'contact-auto-004',
        campaignId,
        name: 'Patricia Martinez',
        mobileNumber: '+1-555-0304',
        language: 'en',
        accountId: 'ACC-AUTO-004',
        status: 'completed',
        actionTaken: 'ignored',
        callTimestamp: new Date(baseDate.getTime() - 8 * 60 * 60 * 1000),
        callDuration: 195,
        transcriptId: 'transcript-auto-004',
        recordingId: 'recording-auto-004'
      }
    ],
    insurance: [
      {
        id: 'contact-ins-001',
        campaignId,
        name: 'Robert Martinez',
        mobileNumber: '+1-555-0701',
        language: 'en',
        accountId: 'POL-INS-001',
        status: 'completed',
        actionTaken: 'payment_link_sent',
        callTimestamp: new Date(baseDate.getTime() - 2 * 60 * 60 * 1000),
        callDuration: 145,
        transcriptId: 'transcript-ins-001',
        recordingId: 'recording-ins-001'
      },
      {
        id: 'contact-ins-002',
        campaignId,
        name: 'Linda Thompson',
        mobileNumber: '+1-555-0702',
        language: 'en',
        accountId: 'POL-INS-002',
        status: 'completed',
        actionTaken: 'callback_requested',
        callTimestamp: new Date(baseDate.getTime() - 4 * 60 * 60 * 1000),
        callDuration: 210,
        transcriptId: 'transcript-ins-002',
        recordingId: 'recording-ins-002'
      },
      {
        id: 'contact-ins-003',
        campaignId,
        name: 'James Wilson',
        mobileNumber: '+1-555-0703',
        language: 'en',
        accountId: 'POL-INS-003',
        status: 'not_answered',
        actionTaken: null,
        callTimestamp: new Date(baseDate.getTime() - 6 * 60 * 60 * 1000),
        callDuration: 0,
        transcriptId: null,
        recordingId: null
      },
      {
        id: 'contact-ins-004',
        campaignId,
        name: 'Barbara Anderson',
        mobileNumber: '+1-555-0704',
        language: 'en',
        accountId: 'POL-INS-004',
        status: 'completed',
        actionTaken: 'escalated',
        callTimestamp: new Date(baseDate.getTime() - 8 * 60 * 60 * 1000),
        callDuration: 280,
        transcriptId: 'transcript-ins-004',
        recordingId: 'recording-ins-004'
      }
    ]
  };

  return contacts[industry] || contacts.banking;
};
