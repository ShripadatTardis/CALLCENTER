
import { Industry } from '@/types/industry';
import { OutboundCampaign } from '@/types/auth';

export const getIndustrySpecificCampaigns = (industry: Industry): OutboundCampaign[] => {
  const baseDate = new Date();
  const campaigns: Record<Industry, OutboundCampaign[]> = {
    banking: [
      {
        id: 'camp-bank-001',
        name: 'Q4 EMI Reminder Campaign',
        description: 'Automated reminders for upcoming EMI payments to reduce defaults',
        campaignType: 'loan_emi_reminder',
        status: 'running',
        totalContacts: 2500,
        callsMade: 1875,
        successRate: 68.5,
        launchDate: new Date(baseDate.getTime() - 15 * 24 * 60 * 60 * 1000),
        createdBy: 'Priya Sharma',
        scriptId: 'script-bank-001',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 3
        },
        triggerType: 'scheduled',
        channel: 'voice'
      },
      {
        id: 'camp-bank-002',
        name: 'Overdue Loan Recovery Drive',
        description: 'Follow-up calls for customers with overdue loan payments',
        campaignType: 'overdue_loan_followup',
        status: 'running',
        totalContacts: 1200,
        callsMade: 980,
        successRate: 45.2,
        launchDate: new Date(baseDate.getTime() - 8 * 24 * 60 * 60 * 1000),
        createdBy: 'Rajesh Kumar',
        scriptId: 'script-bank-002',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 5
        },
        triggerType: 'manual',
        channel: 'voice'
      },
      {
        id: 'camp-bank-003',
        name: 'KYC Document Collection',
        description: 'Reminder calls for pending KYC document submissions',
        campaignType: 'document_reminder',
        status: 'completed',
        totalContacts: 800,
        callsMade: 800,
        successRate: 82.3,
        launchDate: new Date(baseDate.getTime() - 25 * 24 * 60 * 60 * 1000),
        createdBy: 'Anjali Patel',
        scriptId: 'script-bank-003',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 2
        },
        triggerType: 'scheduled',
        channel: 'voice'
      },
      {
        id: 'camp-bank-004',
        name: 'Credit Card Cross-sell',
        description: 'Promote premium credit cards to eligible customers',
        campaignType: 'cross_sell',
        status: 'scheduled',
        totalContacts: 3000,
        callsMade: 0,
        successRate: 0,
        launchDate: new Date(baseDate.getTime() + 5 * 24 * 60 * 60 * 1000),
        createdBy: 'Vikram Singh',
        scriptId: 'script-bank-004',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 3
        },
        triggerType: 'scheduled',
        scheduledTime: new Date(baseDate.getTime() + 5 * 24 * 60 * 60 * 1000),
        channel: 'voice'
      }
    ],
    telecom: [
      {
        id: 'camp-telecom-001',
        name: 'Bill Payment Reminder Drive',
        description: 'Automated reminders for upcoming bill payments',
        campaignType: 'loan_emi_reminder',
        status: 'running',
        totalContacts: 3200,
        callsMade: 2400,
        successRate: 72.1,
        launchDate: new Date(baseDate.getTime() - 12 * 24 * 60 * 60 * 1000),
        createdBy: 'Neha Gupta',
        scriptId: 'script-telecom-001',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 3
        },
        triggerType: 'scheduled',
        channel: 'voice'
      },
      {
        id: 'camp-telecom-002',
        name: 'Data Plan Upgrade Campaign',
        description: 'Promote higher data plans to eligible subscribers',
        campaignType: 'cross_sell',
        status: 'running',
        totalContacts: 1800,
        callsMade: 1350,
        successRate: 38.5,
        launchDate: new Date(baseDate.getTime() - 20 * 24 * 60 * 60 * 1000),
        createdBy: 'Amit Verma',
        scriptId: 'script-telecom-002',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 2
        },
        triggerType: 'manual',
        channel: 'voice'
      },
      {
        id: 'camp-telecom-003',
        name: 'Service Outage Notification',
        description: 'Inform customers about scheduled maintenance and service updates',
        campaignType: 'document_reminder',
        status: 'completed',
        totalContacts: 5000,
        callsMade: 5000,
        successRate: 95.8,
        launchDate: new Date(baseDate.getTime() - 30 * 24 * 60 * 60 * 1000),
        createdBy: 'Pooja Reddy',
        scriptId: 'script-telecom-003',
        targetLanguage: 'en',
        retryLogic: {
          enabled: false,
          maxAttempts: 1
        },
        triggerType: 'manual',
        channel: 'voice'
      },
      {
        id: 'camp-telecom-004',
        name: 'New Customer Welcome Calls',
        description: 'Welcome new subscribers and explain service features',
        campaignType: 'welcome_call',
        status: 'running',
        totalContacts: 950,
        callsMade: 720,
        successRate: 88.9,
        launchDate: new Date(baseDate.getTime() - 5 * 24 * 60 * 60 * 1000),
        createdBy: 'Ravi Mehta',
        scriptId: 'script-telecom-004',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 2
        },
        triggerType: 'scheduled',
        channel: 'voice'
      }
    ],
    airlines: [
      {
        id: 'camp-airline-001',
        name: 'Flight Booking Confirmations',
        description: 'Confirm flight bookings and provide travel information',
        campaignType: 'welcome_call',
        status: 'running',
        totalContacts: 1500,
        callsMade: 1125,
        successRate: 91.2,
        launchDate: new Date(baseDate.getTime() - 10 * 24 * 60 * 60 * 1000),
        createdBy: 'Kavya Nair',
        scriptId: 'script-airline-001',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 2
        },
        triggerType: 'scheduled',
        channel: 'voice'
      },
      {
        id: 'camp-airline-002',
        name: 'Flight Change Notifications',
        description: 'Notify passengers about flight schedule changes',
        campaignType: 'document_reminder',
        status: 'running',
        totalContacts: 800,
        callsMade: 600,
        successRate: 85.7,
        launchDate: new Date(baseDate.getTime() - 3 * 24 * 60 * 60 * 1000),
        createdBy: 'Arjun Kapoor',
        scriptId: 'script-airline-002',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 3
        },
        triggerType: 'manual',
        channel: 'voice'
      },
      {
        id: 'camp-airline-003',
        name: 'Loyalty Program Enrollment',
        description: 'Invite eligible passengers to join frequent flyer program',
        campaignType: 'cross_sell',
        status: 'scheduled',
        totalContacts: 2200,
        callsMade: 0,
        successRate: 0,
        launchDate: new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000),
        createdBy: 'Shreya Joshi',
        scriptId: 'script-airline-003',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 3
        },
        triggerType: 'scheduled',
        scheduledTime: new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000),
        channel: 'voice'
      },
      {
        id: 'camp-airline-004',
        name: 'Post-Flight Feedback Collection',
        description: 'Collect customer feedback after completed flights',
        campaignType: 'overdue_loan_followup',
        status: 'running',
        totalContacts: 650,
        callsMade: 490,
        successRate: 67.3,
        launchDate: new Date(baseDate.getTime() - 18 * 24 * 60 * 60 * 1000),
        createdBy: 'Manish Agarwal',
        scriptId: 'script-airline-004',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 2
        },
        triggerType: 'manual',
        channel: 'voice'
      }
    ],
    hotels: [
      {
        id: 'camp-hotel-001',
        name: 'Reservation Confirmation Calls',
        description: 'Confirm hotel reservations and check-in details',
        campaignType: 'welcome_call',
        status: 'running',
        totalContacts: 1100,
        callsMade: 825,
        successRate: 89.4,
        launchDate: new Date(baseDate.getTime() - 14 * 24 * 60 * 60 * 1000),
        createdBy: 'Deepika Malhotra',
        scriptId: 'script-hotel-001',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 2
        },
        triggerType: 'scheduled',
        channel: 'voice'
      },
      {
        id: 'camp-hotel-002',
        name: 'Loyalty Program Promotion',
        description: 'Promote hotel loyalty program to frequent guests',
        campaignType: 'cross_sell',
        status: 'running',
        totalContacts: 750,
        callsMade: 562,
        successRate: 42.8,
        launchDate: new Date(baseDate.getTime() - 22 * 24 * 60 * 60 * 1000),
        createdBy: 'Rohit Saxena',
        scriptId: 'script-hotel-002',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 3
        },
        triggerType: 'manual',
        channel: 'voice'
      },
      {
        id: 'camp-hotel-003',
        name: 'Guest Feedback Collection',
        description: 'Collect feedback from guests after their stay',
        campaignType: 'overdue_loan_followup',
        status: 'completed',
        totalContacts: 900,
        callsMade: 900,
        successRate: 74.2,
        launchDate: new Date(baseDate.getTime() - 35 * 24 * 60 * 60 * 1000),
        createdBy: 'Priyanka Sharma',
        scriptId: 'script-hotel-003',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 2
        },
        triggerType: 'manual',
        channel: 'voice'
      },
      {
        id: 'camp-hotel-004',
        name: 'Special Package Offers',
        description: 'Promote seasonal packages and special offers',
        campaignType: 'cross_sell',
        status: 'scheduled',
        totalContacts: 1800,
        callsMade: 0,
        successRate: 0,
        launchDate: new Date(baseDate.getTime() + 10 * 24 * 60 * 60 * 1000),
        createdBy: 'Sandeep Yadav',
        scriptId: 'script-hotel-004',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 3
        },
        triggerType: 'scheduled',
        scheduledTime: new Date(baseDate.getTime() + 10 * 24 * 60 * 60 * 1000),
        channel: 'voice'
      }
    ],
    hospitals: [
      {
        id: 'camp-hospital-001',
        name: 'Appointment Reminder Campaign',
        description: 'Remind patients about upcoming medical appointments',
        campaignType: 'loan_emi_reminder',
        status: 'running',
        totalContacts: 2800,
        callsMade: 2100,
        successRate: 78.9,
        launchDate: new Date(baseDate.getTime() - 7 * 24 * 60 * 60 * 1000),
        createdBy: 'Dr. Sunita Rao',
        scriptId: 'script-hospital-001',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 3
        },
        triggerType: 'scheduled',
        channel: 'voice'
      },
      {
        id: 'camp-hospital-002',
        name: 'Health Checkup Follow-ups',
        description: 'Follow up with patients after health screenings',
        campaignType: 'overdue_loan_followup',
        status: 'running',
        totalContacts: 1600,
        callsMade: 1200,
        successRate: 65.4,
        launchDate: new Date(baseDate.getTime() - 16 * 24 * 60 * 60 * 1000),
        createdBy: 'Dr. Ramesh Patel',
        scriptId: 'script-hospital-002',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 2
        },
        triggerType: 'manual',
        channel: 'voice'
      },
      {
        id: 'camp-hospital-003',
        name: 'Insurance Verification Calls',
        description: 'Verify insurance details and coverage information',
        campaignType: 'document_reminder',
        status: 'running',
        totalContacts: 1200,
        callsMade: 900,
        successRate: 82.1,
        launchDate: new Date(baseDate.getTime() - 11 * 24 * 60 * 60 * 1000),
        createdBy: 'Meera Jain',
        scriptId: 'script-hospital-003',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 2
        },
        triggerType: 'scheduled',
        channel: 'voice'
      },
      {
        id: 'camp-hospital-004',
        name: 'Wellness Program Enrollment',
        description: 'Invite patients to join preventive wellness programs',
        campaignType: 'cross_sell',
        status: 'scheduled',
        totalContacts: 2000,
        callsMade: 0,
        successRate: 0,
        launchDate: new Date(baseDate.getTime() + 12 * 24 * 60 * 60 * 1000),
        createdBy: 'Dr. Anita Singh',
        scriptId: 'script-hospital-004',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 3
        },
        triggerType: 'scheduled',
        scheduledTime: new Date(baseDate.getTime() + 12 * 24 * 60 * 60 * 1000),
        channel: 'voice'
      }
    ],
    automotive: [
      {
        id: 'camp-auto-001',
        name: 'Quarterly Service Reminder Campaign',
        description: 'Automated reminders for scheduled vehicle maintenance',
        campaignType: 'loan_emi_reminder',
        status: 'running',
        totalContacts: 1900,
        callsMade: 1425,
        successRate: 76.8,
        launchDate: new Date(baseDate.getTime() - 9 * 24 * 60 * 60 * 1000),
        createdBy: 'David Thompson',
        scriptId: 'script-auto-001',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 3
        },
        triggerType: 'scheduled',
        channel: 'voice'
      },
      {
        id: 'camp-auto-002',
        name: 'New Lead Qualification Drive',
        description: 'Follow up with potential customers and schedule test drives',
        campaignType: 'cross_sell',
        status: 'running',
        totalContacts: 850,
        callsMade: 637,
        successRate: 52.3,
        launchDate: new Date(baseDate.getTime() - 13 * 24 * 60 * 60 * 1000),
        createdBy: 'Sarah Wilson',
        scriptId: 'script-auto-002',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 4
        },
        triggerType: 'manual',
        channel: 'voice'
      },
      {
        id: 'camp-auto-003',
        name: 'Warranty Expiration Alerts',
        description: 'Notify customers about expiring warranties and service packages',
        campaignType: 'document_reminder',
        status: 'completed',
        totalContacts: 1100,
        callsMade: 1100,
        successRate: 68.5,
        launchDate: new Date(baseDate.getTime() - 28 * 24 * 60 * 60 * 1000),
        createdBy: 'Mark Johnson',
        scriptId: 'script-auto-003',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 2
        },
        triggerType: 'scheduled',
        channel: 'voice'
      },
      {
        id: 'camp-auto-004',
        name: 'Vehicle Trade-In Campaign',
        description: 'Promote trade-in offers for current vehicle owners',
        campaignType: 'cross_sell',
        status: 'scheduled',
        totalContacts: 1650,
        callsMade: 0,
        successRate: 0,
        launchDate: new Date(baseDate.getTime() + 8 * 24 * 60 * 60 * 1000),
        createdBy: 'Jennifer Martinez',
        scriptId: 'script-auto-004',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 3
        },
        triggerType: 'scheduled',
        scheduledTime: new Date(baseDate.getTime() + 8 * 24 * 60 * 60 * 1000),
        channel: 'voice'
      }
    ],
    insurance: [
      {
        id: 'camp-ins-001',
        name: 'Q1 Premium Collection Drive',
        description: 'Quarterly campaign for premium payment reminders',
        campaignType: 'loan_emi_reminder',
        status: 'running',
        totalContacts: 1800,
        callsMade: 1350,
        successRate: 75.0,
        launchDate: new Date(baseDate.getTime() - 10 * 24 * 60 * 60 * 1000),
        createdBy: 'Sarah Mitchell',
        scriptId: 'script-ins-001',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 3
        },
        triggerType: 'scheduled',
        channel: 'voice'
      },
      {
        id: 'camp-ins-002',
        name: 'Claim Status Notification Campaign',
        description: 'Automated updates for claim processing status',
        campaignType: 'document_reminder',
        status: 'running',
        totalContacts: 600,
        callsMade: 540,
        successRate: 90.0,
        launchDate: new Date(baseDate.getTime() - 6 * 24 * 60 * 60 * 1000),
        createdBy: 'Michael Rodriguez',
        scriptId: 'script-ins-002',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 2
        },
        triggerType: 'manual',
        channel: 'voice'
      },
      {
        id: 'camp-ins-003',
        name: 'Annual Policy Renewal Campaign',
        description: 'Renewal reminders for expiring insurance policies',
        campaignType: 'overdue_loan_followup',
        status: 'completed',
        totalContacts: 950,
        callsMade: 950,
        successRate: 76.1,
        launchDate: new Date(baseDate.getTime() - 28 * 24 * 60 * 60 * 1000),
        createdBy: 'Lisa Thompson',
        scriptId: 'script-ins-003',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 2
        },
        triggerType: 'scheduled',
        channel: 'voice'
      },
      {
        id: 'camp-ins-004',
        name: 'New Policy Cross-sell Campaign',
        description: 'Promote additional insurance coverage to existing policyholders',
        campaignType: 'cross_sell',
        status: 'scheduled',
        totalContacts: 1500,
        callsMade: 0,
        successRate: 0,
        launchDate: new Date(baseDate.getTime() + 6 * 24 * 60 * 60 * 1000),
        createdBy: 'David Williams',
        scriptId: 'script-ins-004',
        targetLanguage: 'en',
        retryLogic: {
          enabled: true,
          maxAttempts: 3
        },
        triggerType: 'scheduled',
        scheduledTime: new Date(baseDate.getTime() + 6 * 24 * 60 * 60 * 1000),
        channel: 'voice'
      }
    ]
  };

  return campaigns[industry] || campaigns.banking;
};
