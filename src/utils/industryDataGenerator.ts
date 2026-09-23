import { Industry, INDUSTRY_CONFIGS } from '@/types/industry';

// Campaign type mappings for each industry
export const getIndustryCampaignTypes = (industry: Industry) => {
  const campaignTypeMap = {
    banking: [
      { value: 'loan_emi_reminder', label: 'EMI Reminder' },
      { value: 'overdue_loan_followup', label: 'Overdue Follow-up' },
      { value: 'document_reminder', label: 'Document Reminder' },
      { value: 'cross_sell', label: 'Cross-sell' },
      { value: 'welcome_call', label: 'Welcome Call' }
    ],
    telecom: [
      { value: 'bill_payment_reminder', label: 'Bill Payment Reminder' },
      { value: 'plan_upgrade', label: 'Plan Upgrade' },
      { value: 'service_activation', label: 'Service Activation' },
      { value: 'network_update', label: 'Network Update' },
      { value: 'welcome_call', label: 'Welcome Call' }
    ],
    airlines: [
      { value: 'flight_reminder', label: 'Flight Reminder' },
      { value: 'booking_confirmation', label: 'Booking Confirmation' },
      { value: 'loyalty_program', label: 'Loyalty Program' },
      { value: 'checkin_notification', label: 'Check-in Notification' },
      { value: 'welcome_call', label: 'Welcome Call' }
    ],
    hotels: [
      { value: 'reservation_confirmation', label: 'Reservation Confirmation' },
      { value: 'checkin_reminder', label: 'Check-in Reminder' },
      { value: 'loyalty_program', label: 'Loyalty Program' },
      { value: 'feedback_collection', label: 'Feedback Collection' },
      { value: 'welcome_call', label: 'Welcome Call' }
    ],
    hospitals: [
      { value: 'appointment_reminder', label: 'Appointment Reminder' },
      { value: 'health_checkup', label: 'Health Checkup' },
      { value: 'insurance_verification', label: 'Insurance Verification' },
      { value: 'followup_care', label: 'Follow-up Care' },
      { value: 'welcome_call', label: 'Welcome Call' }
    ],
    automotive: [
      { value: 'service_reminder', label: 'Service Reminder' },
      { value: 'lead_followup', label: 'Lead Follow-up' },
      { value: 'test_drive', label: 'Test Drive Booking' },
      { value: 'warranty_alert', label: 'Warranty Alert' },
      { value: 'welcome_call', label: 'Welcome Call' }
    ],
    insurance: [
      { value: 'premium_reminder', label: 'Premium Reminder' },
      { value: 'claim_update', label: 'Claim Status Update' },
      { value: 'policy_renewal', label: 'Policy Renewal' },
      { value: 'new_policy_offer', label: 'New Policy Offer' },
      { value: 'welcome_call', label: 'Welcome Call' }
    ]
  };

  return campaignTypeMap[industry] || campaignTypeMap.banking;
};

export const generateIndustrySpecificCampaigns = (industry: Industry) => {
  const config = INDUSTRY_CONFIGS[industry];
  
  const baseCampaigns = [
    {
      id: '1',
      name: `${config.features.campaigns[0]} - Q1 2024`,
      campaignType: config.features.campaigns[0],
      status: 'running' as const,
      totalContacts: 1500,
      callsMade: 15420,
      successful: 12336,
      pending: 2084,
      failed: 1000,
      successRate: 80,
      description: `Automated ${config.features.campaigns[0].toLowerCase()} campaign targeting ${config.features.terminology.customer.toLowerCase()}s`,
      createdAt: '2024-01-15',
      createdBy: 'System Admin',
      launchDate: '2024-01-15',
      scriptId: '1',
      agentId: `${industry}-agent-1`,
      contactListId: '1',
      industry,
      targetLanguage: 'english' as const,
      retryLogic: { enabled: true, maxAttempts: 3, retryDelay: 60 },
      triggerType: 'scheduled' as const,
      channel: 'voice' as const,
      scheduledTime: '2024-01-15T09:00:00Z'
    },
    {
      id: '2',
      name: `${config.features.campaigns[1]} Campaign`,
      campaignType: config.features.campaigns[1],
      status: 'paused' as const,
      totalContacts: 800,
      callsMade: 8932,
      successful: 7145,
      pending: 892,
      failed: 895,
      successRate: 80,
      description: `${config.features.campaigns[1]} outreach for existing ${config.features.terminology.customer.toLowerCase()}s`,
      createdAt: '2024-02-01',
      createdBy: 'System Admin',
      launchDate: '2024-02-01',
      scriptId: '2',
      agentId: `${industry}-agent-2`,
      contactListId: '2',
      industry,
      targetLanguage: 'english' as const,
      retryLogic: { enabled: true, maxAttempts: 2, retryDelay: 30 },
      triggerType: 'manual' as const,
      channel: 'voice' as const,
      scheduledTime: null
    },
    {
      id: '3',
      name: `${config.features.campaigns[2]} Drive`,
      campaignType: config.features.campaigns[2],
      status: 'completed' as const,
      totalContacts: 1200,
      callsMade: 12450,
      successful: 9960,
      pending: 0,
      failed: 2490,
      successRate: 80,
      description: `${config.features.campaigns[2]} campaign with personalized offers`,
      createdAt: '2024-01-10',
      createdBy: 'System Admin',
      launchDate: '2024-01-10',
      scriptId: '3',
      agentId: `${industry}-agent-3`,
      contactListId: '3',
      industry,
      targetLanguage: 'english' as const,
      retryLogic: { enabled: false, maxAttempts: 1, retryDelay: 0 },
      triggerType: 'scheduled' as const,
      channel: 'voice' as const,
      scheduledTime: '2024-01-10T10:00:00Z'
    }
  ];

  return baseCampaigns;
};

export const generateIndustrySpecificScripts = (industry: Industry) => {
  const config = INDUSTRY_CONFIGS[industry];
  const campaignTypes = getIndustryCampaignTypes(industry);
  
  const scriptTemplates = {
    banking: {
      loan_emi_reminder: {
        content: `Hello {{customer_name}}, this is a reminder from ${config.name}. Your EMI of ₹{{emi_amount}} for your {{loan_type}} is due on {{due_date}}. Please ensure timely payment to avoid late fees.`,
        placeholders: ['customer_name', 'emi_amount', 'loan_type', 'due_date']
      },
      overdue_loan_followup: {
        content: `Dear {{customer_name}}, your {{loan_type}} EMI of ₹{{emi_amount}} was due on {{due_date}} and is now overdue. Please contact us immediately to avoid penalties.`,
        placeholders: ['customer_name', 'loan_type', 'emi_amount', 'due_date']
      },
      document_reminder: {
        content: `Hi {{customer_name}}, we need your {{document_type}} for your {{application_type}}. Please submit it by {{deadline}} to avoid delays.`,
        placeholders: ['customer_name', 'document_type', 'application_type', 'deadline']
      },
      cross_sell: {
        content: `Hello {{customer_name}}, as a valued customer, you're eligible for our {{product_name}} with special benefits. Would you like to know more?`,
        placeholders: ['customer_name', 'product_name']
      },
      welcome_call: {
        content: `Welcome to ${config.name}, {{customer_name}}! Thank you for choosing our {{service_type}}. We're here to assist you with any questions.`,
        placeholders: ['customer_name', 'service_type']
      }
    },
    telecom: {
      bill_payment_reminder: {
        content: `Hi {{customer_name}}, your mobile bill of ₹{{bill_amount}} is due on {{due_date}}. Pay now to avoid service disruption.`,
        placeholders: ['customer_name', 'bill_amount', 'due_date']
      },
      plan_upgrade: {
        content: `Hello {{customer_name}}, upgrade to our {{plan_name}} and get {{benefits}}. Special offer valid till {{expiry_date}}.`,
        placeholders: ['customer_name', 'plan_name', 'benefits', 'expiry_date']
      },
      service_activation: {
        content: `Hi {{customer_name}}, your {{service_name}} has been activated. You can start using it immediately. Need help? Call us anytime.`,
        placeholders: ['customer_name', 'service_name']
      },
      network_update: {
        content: `Dear {{customer_name}}, we're upgrading our network in {{area}} on {{date}}. You may experience brief service interruptions.`,
        placeholders: ['customer_name', 'area', 'date']
      },
      welcome_call: {
        content: `Welcome to ${config.name}, {{customer_name}}! Your new connection is ready. Enjoy our premium services and 24/7 support.`,
        placeholders: ['customer_name']
      }
    },
    airlines: {
      flight_reminder: {
        content: `Dear {{passenger_name}}, your flight {{flight_number}} from {{origin}} to {{destination}} is scheduled for {{departure_date}} at {{departure_time}}.`,
        placeholders: ['passenger_name', 'flight_number', 'origin', 'destination', 'departure_date', 'departure_time']
      },
      booking_confirmation: {
        content: `Hi {{passenger_name}}, your booking {{booking_reference}} is confirmed for {{flight_number}} on {{travel_date}}. Safe travels!`,
        placeholders: ['passenger_name', 'booking_reference', 'flight_number', 'travel_date']
      },
      loyalty_program: {
        content: `Hello {{passenger_name}}, you've earned {{miles}} miles! Join our loyalty program to enjoy exclusive benefits and faster boarding.`,
        placeholders: ['passenger_name', 'miles']
      },
      checkin_notification: {
        content: `Hi {{passenger_name}}, online check-in is now open for flight {{flight_number}}. Check in now to secure your preferred seat.`,
        placeholders: ['passenger_name', 'flight_number']
      },
      welcome_call: {
        content: `Welcome aboard ${config.name}, {{passenger_name}}! Thank you for choosing us for your travel needs. Fly safe, fly comfortable.`,
        placeholders: ['passenger_name']
      }
    },
    hotels: {
      reservation_confirmation: {
        content: `Dear {{guest_name}}, your reservation {{booking_id}} at ${config.name} from {{checkin_date}} to {{checkout_date}} is confirmed.`,
        placeholders: ['guest_name', 'booking_id', 'checkin_date', 'checkout_date']
      },
      checkin_reminder: {
        content: `Hi {{guest_name}}, looking forward to welcoming you tomorrow at {{checkin_time}}. Your room {{room_type}} is ready!`,
        placeholders: ['guest_name', 'checkin_time', 'room_type']
      },
      loyalty_program: {
        content: `Hello {{guest_name}}, join our loyalty program and earn {{points}} points on this stay. Enjoy exclusive member benefits!`,
        placeholders: ['guest_name', 'points']
      },
      feedback_collection: {
        content: `Dear {{guest_name}}, thank you for staying with us. We'd love your feedback about your {{stay_duration}} day experience.`,
        placeholders: ['guest_name', 'stay_duration']
      },
      welcome_call: {
        content: `Welcome to ${config.name}, {{guest_name}}! We're delighted to host you and ensure you have a memorable stay.`,
        placeholders: ['guest_name']
      }
    },
    hospitals: {
      appointment_reminder: {
        content: `Dear {{patient_name}}, this is a reminder for your appointment with Dr. {{doctor_name}} on {{appointment_date}} at {{appointment_time}}.`,
        placeholders: ['patient_name', 'doctor_name', 'appointment_date', 'appointment_time']
      },
      health_checkup: {
        content: `Hi {{patient_name}}, it's time for your annual {{checkup_type}}. Schedule your appointment today for better health monitoring.`,
        placeholders: ['patient_name', 'checkup_type']
      },
      insurance_verification: {
        content: `Dear {{patient_name}}, we need to verify your insurance details for {{procedure_name}}. Please bring your insurance card.`,
        placeholders: ['patient_name', 'procedure_name']
      },
      followup_care: {
        content: `Hi {{patient_name}}, this is a follow-up for your recent {{treatment_type}}. How are you feeling? Any concerns to discuss?`,
        placeholders: ['patient_name', 'treatment_type']
      },
      welcome_call: {
        content: `Welcome to ${config.name}, {{patient_name}}! We're committed to providing you with the best healthcare services.`,
        placeholders: ['patient_name']
      }
    },
    automotive: {
      service_reminder: {
        content: `Hello {{customer_name}}, your {{vehicle_model}} is due for its {{service_type}} service on {{service_date}}. Would you like to schedule an appointment?`,
        placeholders: ['customer_name', 'vehicle_model', 'service_type', 'service_date']
      },
      lead_followup: {
        content: `**Peugeot UAE Lead Qualification Call**

Greeting:
"Good morning, this is Ava calling from Peugeot UAE. I'm reaching out regarding your recent interest in purchasing a Peugeot vehicle. May I speak with {{customer_name}}?"

Enquiry Confirmation:
- "Did you recently submit an enquiry for a Peugeot car?"
- "May I know which model or variant you're most interested in?"

Customer Information Verification:
- Confirm mobile number and email address
- Purchase timeframe: Within 30 days, 3 months, or longer?
- Monthly income verification (above Four Thousand Dirhams)
- Current Emirate of residence
- Valid UAE driving license holder?

Purchase Type:
"Would this purchase be made in your name or through a company name?"

Qualified Response:
"Thank you for confirming all the details. Based on this, I'll forward your interest to one of our Peugeot sales advisors who will contact you shortly."

Behavior Notes:
- All amounts spoken in full words only (no digits)
- Professional, courteous, and helpful tone
- If customer asks car details: "All your queries will be answered by the sales representative that reaches out to you"`,
        placeholders: ['customer_name']
      },
      test_drive: {
        content: `Hello {{customer_name}}, we have the {{vehicle_model}} available for a test drive this {{day}}. What time works best for you?`,
        placeholders: ['customer_name', 'vehicle_model', 'day']
      },
      warranty_alert: {
        content: `Dear {{customer_name}}, your {{warranty_type}} warranty expires on {{expiry_date}}. Would you like to extend coverage or learn about service packages?`,
        placeholders: ['customer_name', 'warranty_type', 'expiry_date']
      },
      welcome_call: {
        content: `Welcome to ${config.name}, {{customer_name}}! Thank you for choosing us for your automotive needs. We're here to serve you.`,
        placeholders: ['customer_name']
      }
    },
    insurance: {
      premium_reminder: {
        content: `Dear {{customer_name}}, your insurance premium of \${{amount}} is due on {{due_date}}. Please make the payment to keep your {{policy_type}} policy active.`,
        placeholders: ['customer_name', 'amount', 'due_date', 'policy_type']
      },
      claim_update: {
        content: `Hello {{customer_name}}, your claim {{claim_number}} has been {{claim_status}}. Expected processing time: {{processing_time}} days.`,
        placeholders: ['customer_name', 'claim_number', 'claim_status', 'processing_time']
      },
      policy_renewal: {
        content: `Dear {{customer_name}}, your {{policy_type}} policy expires on {{expiry_date}}. Renew now to continue enjoying comprehensive coverage.`,
        placeholders: ['customer_name', 'policy_type', 'expiry_date']
      },
      new_policy_offer: {
        content: `Hi {{customer_name}}, we have a new {{policy_type}} policy with {{benefit}} coverage. Would you like to know more about special rates?`,
        placeholders: ['customer_name', 'policy_type', 'benefit']
      },
      welcome_call: {
        content: `Welcome to ${config.name}, {{customer_name}}! Thank you for trusting us with your insurance needs. We're committed to protecting what matters most.`,
        placeholders: ['customer_name']
      }
    }
  };

  const industryScripts = scriptTemplates[industry] || scriptTemplates.banking;
  
  return campaignTypes.map((campaignType, index) => {
    const scriptKey = campaignType.value as keyof typeof industryScripts;
    const scriptData = industryScripts[scriptKey] || industryScripts[Object.keys(industryScripts)[0] as keyof typeof industryScripts];
    
    return {
      id: `${industry}-script-${index + 1}`,
      name: `${campaignType.label} Script`,
      content: scriptData.content,
      placeholders: scriptData.placeholders,
      campaignType: campaignType.value,
      industry,
      intent: config.features.intents[index % config.features.intents.length]
    };
  });
};

export const generateIndustrySpecificAgents = (industry: Industry) => {
  const industryAgents = {
    banking: [
      { id: 'ea240698-3315-4b99-90c8-3e7ef3a9a3cf', name: 'EMI Reminder Agent', description: 'Agent for EMI payment reminders and follow-ups' },
      { id: '06e75445-e9fc-4ef2-aea6-2e38aa562032', name: 'Overdue Loan Follow-Up', description: 'Agent for following up on overdue loan payments' },
      { id: '66f2bdf3-f083-4e3c-9089-106cc619f553', name: 'Document Submission Reminder', description: 'Agent for reminding customers about pending document submissions' },
      { id: 'c886e8b8-0047-4c53-b265-54c9ef395c89', name: 'Credit Card Upgrade Offers', description: 'Agent for promoting credit card upgrade offers' },
      { id: '5ec9c2f7-4d2d-45b5-acbd-a8387a071798', name: 'Transaction Verification', description: 'Agent for verifying suspicious transactions' },
      { id: 'f317726d-76f7-4dae-a8e5-07dbe3d4f477', name: 'Insurance Premium Reminder', description: 'Agent for insurance premium payment reminders' }
    ],
    telecom: [
      { id: '68415537-d862-445f-95d5-b50c79b46e25', name: 'Plan Upgrade Offer', description: 'Agent focused on plan upgrades and service enhancements' },
      { id: 'telecom-bill-payment', name: 'Bill Payment Reminder', description: 'Specialized agent for bill payment reminders and follow-ups' },
      { id: 'telecom-network-feedback', name: 'Network Quality Feedback', description: 'Agent for collecting network quality feedback and service improvements' }
    ],
    airlines: [
      { id: '07976957-c391-4706-a369-9c02bc0e645b', name: 'Flight Time Change Notification', description: 'Agent for notifying passengers about flight schedule changes' },
      { id: 'airlines-checkin-reminder', name: 'Check-In Reminder', description: 'Agent for automated check-in reminders and boarding notifications' },
      { id: 'airlines-ff-reengagement', name: 'Frequent Flyer Re-engagement', description: 'Agent for re-engaging frequent flyer members with exclusive offers' }
    ],
    hotels: [
      { id: 'b744d1b9-aafd-4956-b8ad-e6be55e4d995', name: 'Booking Confirmation', description: 'Agent for confirming reservations and providing booking details' },
      { id: 'hotels-post-stay-feedback', name: 'Post-Stay Feedback', description: 'Agent for collecting guest feedback after their stay' },
      { id: 'hotels-special-offer', name: 'Special Offer', description: 'Agent for promoting special offers and loyalty program benefits' }
    ],
    hospitals: [
      { id: '1236afb3-bfef-4a7e-9b51-ced032aab0fc', name: 'Appointment No-Show Follow-Up', description: 'Agent for following up on missed appointments and rescheduling' },
      { id: 'hospitals-health-checkup', name: 'Annual Health Check-Up Reminder', description: 'Agent for reminding patients about annual health check-ups' },
      { id: 'hospitals-lab-report', name: 'Lab Report Collection Reminder', description: 'Agent for notifying patients about ready lab reports' }
    ],
    automotive: [
      { id: 'd5714bb3-1233-42d5-8229-210299fb0814', name: 'Lead Qualification Agent', description: 'Agent for qualifying leads and scheduling test drives' },
      { id: '72f085f3-502f-4861-9b35-ea44bd3bf127', name: 'Service Reminder Agent', description: 'Agent for reminding customers about scheduled vehicle maintenance' },
      { id: 'automotive-trade-in', name: 'Trade-In Evaluation', description: 'Agent for evaluating trade-in vehicles and providing quotes' }
    ],
    insurance: [
      { id: 'f317726d-76f7-4dae-a8e5-07dbe3d4f477', name: 'Insurance Premium Reminder', description: 'Agent for insurance premium payment reminders' },
      { id: 'insurance-claim-processing', name: 'Claim Status Update', description: 'Agent for updating customers on claim processing status' },
      { id: 'insurance-policy-renewal', name: 'Policy Renewal Reminder', description: 'Agent for reminding customers about upcoming policy renewals' }
    ]
  };

  return industryAgents[industry]?.map(agent => ({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    industry,
    capabilities: []
  })) || [];
};

export const generateIndustrySpecificContacts = (industry: Industry) => {
  const config = INDUSTRY_CONFIGS[industry];
  
  const sampleContacts = [
    { name: 'John Smith', phone: '+1-555-0101' },
    { name: 'Sarah Johnson', phone: '+1-555-0102' },
    { name: 'Michael Brown', phone: '+1-555-0103' },
    { name: 'Emily Davis', phone: '+1-555-0104' },
    { name: 'David Wilson', phone: '+1-555-0105' }
  ];

  return sampleContacts.map((contact, index) => ({
    id: index + 1,
    name: contact.name,
    phone: contact.phone,
    customerType: config.features.terminology.customer,
    status: index % 3 === 0 ? 'active' : index % 3 === 1 ? 'pending' : 'contacted',
    lastContact: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
    industry
  }));
};

export const generateIndustrySpecificCallLogs = (industry: Industry) => {
  const config = INDUSTRY_CONFIGS[industry];
  const contacts = generateIndustrySpecificContacts(industry);
  
  return contacts.map((contact, index) => ({
    id: `call-${index + 1}`,
    customerName: contact.name,
    phoneNumber: contact.phone,
    duration: Math.floor(Math.random() * 300) + 60, // 1-5 minutes
    status: ['completed', 'failed', 'busy', 'no-answer'][Math.floor(Math.random() * 4)] as any,
    intent: config.features.intents[Math.floor(Math.random() * config.features.intents.length)],
    timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    campaignName: config.features.campaigns[Math.floor(Math.random() * config.features.campaigns.length)],
    industry
  }));
};

// New functions for Live View data generation
export const generateIndustrySpecificLiveViewCalls = (industry: Industry) => {
  const config = INDUSTRY_CONFIGS[industry];
  const industryIntents = config.features.intents;
  
  const industryScenarios = {
    banking: [
      { name: 'John Smith', phone: '+1-555-0101', intent: 'loan_inquiry', context: 'Checking loan application status', escalationTrigger: 'Complex Eligibility Issue' },
      { name: 'Sarah Johnson', phone: '+1-555-0102', intent: 'emi_reminder', context: 'EMI payment due tomorrow', escalationTrigger: 'Payment Dispute' },
      { name: 'Michael Brown', phone: '+1-555-0103', intent: 'credit_card_offer', context: 'Premium card upgrade offer', escalationTrigger: 'Rate Negotiation' },
      { name: 'Emily Davis', phone: '+1-555-0104', intent: 'account_balance', context: 'Account balance inquiry', escalationTrigger: 'Transaction Discrepancy' },
      { name: 'David Wilson', phone: '+1-555-0105', intent: 'loan_inquiry', context: 'New personal loan application', escalationTrigger: 'Document Verification' }
    ],
    telecom: [
      { name: 'Alex Chen', phone: '+1-555-0201', intent: 'bill_payment', context: 'Monthly bill payment reminder', escalationTrigger: 'Billing Error Dispute' },
      { name: 'Maria Garcia', phone: '+1-555-0202', intent: 'plan_upgrade', context: 'Eligible for 5G plan upgrade', escalationTrigger: 'Coverage Area Concern' },
      { name: 'James Miller', phone: '+1-555-0203', intent: 'service_activation', context: 'New connection activation', escalationTrigger: 'Technical Installation Issue' },
      { name: 'Lisa Wang', phone: '+1-555-0204', intent: 'network_issue', context: 'Reporting network connectivity issues', escalationTrigger: 'Service Outage Complaint' },
      { name: 'Tom Anderson', phone: '+1-555-0205', intent: 'bill_payment', context: 'Overdue bill payment follow-up', escalationTrigger: 'Financial Hardship' }
    ],
    airlines: [
      { name: 'Robert Taylor', phone: '+1-555-0301', intent: 'flight_booking', context: 'Flight booking confirmation', escalationTrigger: 'Seat Assignment Issue' },
      { name: 'Jennifer Lee', phone: '+1-555-0302', intent: 'check_in_reminder', context: 'Check-in available for tomorrow flight', escalationTrigger: 'Special Assistance Request' },
      { name: 'Mark Johnson', phone: '+1-555-0303', intent: 'loyalty_program', context: 'Frequent flyer miles update', escalationTrigger: 'Miles Calculation Dispute' },
      { name: 'Amanda White', phone: '+1-555-0304', intent: 'flight_status', context: 'Flight delay notification', escalationTrigger: 'Flight Delay Complaint' },
      { name: 'Chris Brown', phone: '+1-555-0305', intent: 'flight_booking', context: 'Seat upgrade availability', escalationTrigger: 'Upgrade Pricing Concern' }
    ],
    hotels: [
      { name: 'Diana Ross', phone: '+1-555-0401', intent: 'reservation_booking', context: 'Weekend reservation confirmation', escalationTrigger: 'Room Type Unavailable' },
      { name: 'Kevin Hart', phone: '+1-555-0402', intent: 'check_in_reminder', context: 'Check-in reminder for tonight', escalationTrigger: 'Early Check-in Request' },
      { name: 'Sophie Turner', phone: '+1-555-0403', intent: 'loyalty_program', context: 'VIP membership benefits', escalationTrigger: 'Benefits Clarification' },
      { name: 'Ryan Reynolds', phone: '+1-555-0404', intent: 'feedback_request', context: 'Post-stay experience feedback', escalationTrigger: 'Service Quality Complaint' },
      { name: 'Emma Stone', phone: '+1-555-0405', intent: 'reservation_booking', context: 'Room upgrade offer', escalationTrigger: 'Pricing Discrepancy' }
    ],
    hospitals: [
      { name: 'Dr. Patricia Moore', phone: '+1-555-0501', intent: 'appointment_booking', context: 'Annual health checkup reminder', escalationTrigger: 'Specialist Referral Needed' },
      { name: 'Susan Clark', phone: '+1-555-0502', intent: 'health_checkup', context: 'Lab results ready for pickup', escalationTrigger: 'Abnormal Results Concern' },
      { name: 'Richard Davis', phone: '+1-555-0503', intent: 'insurance_verification', context: 'Insurance pre-authorization needed', escalationTrigger: 'Coverage Dispute' },
      { name: 'Nancy Wilson', phone: '+1-555-0504', intent: 'follow_up', context: 'Post-surgery follow-up appointment', escalationTrigger: 'Recovery Complications' },
      { name: 'Paul Martinez', phone: '+1-555-0505', intent: 'appointment_booking', context: 'Specialist consultation scheduling', escalationTrigger: 'Urgent Medical Concern' }
    ],
    automotive: [
      { name: 'Michael Thompson', phone: '+1-555-0601', intent: 'service_booking', context: '15,000-mile service reminder', escalationTrigger: 'Price Negotiation' },
      { name: 'Jessica Parker', phone: '+1-555-0602', intent: 'lead_qualification', context: 'Test drive for new sedan', escalationTrigger: 'Financing Inquiry' },
      { name: 'Christopher Lee', phone: '+1-555-0603', intent: 'test_drive', context: 'SUV test drive scheduling', escalationTrigger: 'Trade-in Valuation' },
      { name: 'Amanda Rodriguez', phone: '+1-555-0604', intent: 'warranty_inquiry', context: 'Extended warranty offer', escalationTrigger: 'Coverage Clarification' },
      { name: 'Daniel Martinez', phone: '+1-555-0605', intent: 'service_booking', context: 'Brake service appointment', escalationTrigger: 'Urgent Repair Needed' }
    ]
  };

  const scenarios = industryScenarios[industry] || industryScenarios.banking;
  const callStages = ['connecting', 'in-progress', 'escalated', 'complete'];
  
  return scenarios.map((scenario, index) => ({
    id: `live-call-${index + 1}`,
    callerName: scenario.name,
    callerNumber: scenario.phone,
    intent: scenario.intent,
    aiAgentId: `${industry}-agent-${(index % 3) + 1}`,
    duration: Math.floor(Math.random() * 180) + 30, // 30 seconds to 3 minutes
    stage: callStages[Math.floor(Math.random() * callStages.length)] as any,
    sentimentScore: Math.random() * 0.6 + 0.4, // 40% to 100%
    channel: 'voice' as const,
    context: scenario.context,
    escalationTrigger: scenario.escalationTrigger,
    industry
  }));
};

export const generateIndustrySpecificLiveViewAgents = (industry: Industry) => {
  const config = INDUSTRY_CONFIGS[industry];
  
  const industryAgentConfigs = {
    banking: [
      { id: 'banking-emi-agent', name: 'EMI Assistant', cluster: 'Payment Services', status: 'engaged', engagementTime: 145 },
      { id: 'banking-loan-agent', name: 'Loan Specialist', cluster: 'Loan Services', status: 'idle', engagementTime: 0 },
      { id: 'banking-card-agent', name: 'Card Services', cluster: 'Credit Products', status: 'awaiting_input', engagementTime: 78 }
    ],
    telecom: [
      { id: 'telecom-bill-agent', name: 'Bill Assistant', cluster: 'Billing Services', status: 'engaged', engagementTime: 167 },
      { id: 'telecom-plan-agent', name: 'Plan Advisor', cluster: 'Service Plans', status: 'idle', engagementTime: 0 },
      { id: 'telecom-tech-agent', name: 'Tech Support', cluster: 'Technical Support', status: 'engaged', engagementTime: 203 }
    ],
    airlines: [
      { id: 'airlines-booking-agent', name: 'Booking Assistant', cluster: 'Reservations', status: 'engaged', engagementTime: 189 },
      { id: 'airlines-checkin-agent', name: 'Check-in Helper', cluster: 'Flight Services', status: 'awaiting_input', engagementTime: 92 },
      { id: 'airlines-loyalty-agent', name: 'Loyalty Specialist', cluster: 'Frequent Flyer', status: 'idle', engagementTime: 0 }
    ],
    hotels: [
      { id: 'hotels-booking-agent', name: 'Reservation Assistant', cluster: 'Bookings', status: 'engaged', engagementTime: 156 },
      { id: 'hotels-guest-agent', name: 'Guest Services', cluster: 'Guest Relations', status: 'idle', engagementTime: 0 },
      { id: 'hotels-feedback-agent', name: 'Feedback Collector', cluster: 'Quality Assurance', status: 'awaiting_input', engagementTime: 45 }
    ],
    hospitals: [
      { id: 'hospitals-appointment-agent', name: 'Appointment Scheduler', cluster: 'Scheduling', status: 'engaged', engagementTime: 134 },
      { id: 'hospitals-results-agent', name: 'Results Notifier', cluster: 'Lab Services', status: 'idle', engagementTime: 0 },
      { id: 'hospitals-followup-agent', name: 'Follow-up Coordinator', cluster: 'Patient Care', status: 'engaged', engagementTime: 198 }
    ],
    automotive: [
      { id: 'automotive-service-agent', name: 'Service Scheduler', cluster: 'Maintenance', status: 'engaged', engagementTime: 172 },
      { id: 'automotive-sales-agent', name: 'Sales Assistant', cluster: 'Vehicle Sales', status: 'awaiting_input', engagementTime: 88 },
      { id: 'automotive-parts-agent', name: 'Parts Specialist', cluster: 'Parts & Accessories', status: 'idle', engagementTime: 0 }
    ]
  };

  const agentConfigs = industryAgentConfigs[industry] || industryAgentConfigs.banking;
  
  return agentConfigs.map(agentConfig => ({
    id: agentConfig.id,
    name: agentConfig.name,
    intentCluster: agentConfig.cluster,
    status: agentConfig.status as 'engaged' | 'idle' | 'awaiting_input' | 'escalation_triggered',
    successRate: Math.random() * 0.15 + 0.85, // 85% to 100%
    engagementTime: agentConfig.engagementTime,
    industry
  }));
};

export const generateIndustrySpecificTranscripts = (industry: Industry) => {
  const transcriptExamples = {
    banking: {
      customer: "Hi, I need help with my account balance and recent transactions.",
      agent: "I'd be happy to help you with your account balance. Can you please verify your account number for security purposes?",
      customer2: "Sure, it's 1234567890. I also wanted to check about my recent EMI payment.",
      agent2: "Thank you for the verification. I can see your current balance is $1,250.75. Your last EMI payment of $450 was processed successfully on the 15th."
    },
    telecom: {
      customer: "Hello, I received a notification about my bill payment being due soon.",
      agent: "Yes, I can help you with that. Your monthly bill of $89.99 is due on the 25th. Would you like to make the payment now?",
      customer2: "Actually, I'm also interested in upgrading my data plan. What options do I have?",
      agent2: "Great! Based on your usage, I recommend our unlimited 5G plan for just $20 more per month. It includes unlimited data and faster speeds."
    },
    airlines: {
      customer: "I got a call about my flight tomorrow. Is there any issue?",
      agent: "Let me check your booking. Your flight AI123 from New York to Los Angeles is on schedule. I'm calling to remind you that online check-in is now available.",
      customer2: "Perfect! Can you also tell me about my frequent flyer miles?",
      agent2: "Absolutely! You currently have 12,450 miles. This flight will add 2,500 more miles to your account, bringing you closer to our Gold status."
    },
    hotels: {
      customer: "Hi, I have a reservation for this weekend and wanted to confirm the details.",
      agent: "Of course! I have your reservation for the Grand Suite from Friday to Sunday. Check-in is at 3 PM. Would you like any special arrangements?",
      customer2: "That sounds perfect. Are there any spa services available?",
      agent2: "Yes! Our spa offers various treatments. As a VIP guest, you're eligible for a 20% discount on all spa services during your stay."
    },
    hospitals: {
      customer: "I received a call about my appointment with Dr. Smith tomorrow.",
      agent: "Yes, this is a reminder for your appointment with Dr. Smith at 2 PM tomorrow. Please arrive 15 minutes early for check-in.",
      customer2: "Great. I also wanted to ask about my recent lab results.",
      agent2: "Your lab results are ready for pickup. Dr. Smith will review them with you during tomorrow's appointment. Please bring your insurance card."
    },
    automotive: {
      customer: "Hello, I got a reminder about my vehicle service. What's included?",
      agent: "Your 2023 Honda Accord is due for its 15,000-mile service. This includes oil change, tire rotation, brake inspection, and a complimentary multi-point inspection.",
      customer2: "That sounds good. Also, I'm interested in the new SUV models. Can I schedule a test drive?",
      agent2: "Absolutely! We have the 2024 CR-V available. I can schedule a test drive for this Saturday at 10 AM. Our sales team will also discuss financing options and trade-in values."
    }
  };

  return transcriptExamples[industry] || transcriptExamples.banking;
};

// NPS Campaign Generation
export const generateIndustrySpecificNPSCampaigns = (industry: Industry) => {
  const config = INDUSTRY_CONFIGS[industry];
  const baseTimestamp = Date.now();

  switch (industry) {
    case 'banking':
      return [
        {
          id: 'nps_banking_001',
          name: 'Q4 Customer Loyalty Survey',
          description: 'Quarterly NPS survey for retail banking customers',
          campaignType: 'nps_survey',
          createdBy: 'sarah.connor@tardis.ai',
          launchDate: new Date(baseTimestamp - 7 * 24 * 60 * 60 * 1000),
          status: 'running',
          targetChannel: 'voice',
          totalContacts: 250,
          responseCount: 187,
          npsScore: 42,
          promoters: 89,
          passives: 62,
          detractors: 36,
          lastRunTimestamp: new Date(baseTimestamp - 2 * 60 * 60 * 1000),
          targetLanguage: 'English',
          scriptId: 'nps_voice_banking_v1',
          retryLogic: { enabled: true, maxAttempts: 3 },
          triggerType: 'manual'
        },
        {
          id: 'nps_banking_002',
          name: 'Premium Banking NPS',
          description: 'NPS survey for premium banking customers',
          campaignType: 'nps_survey',
          createdBy: 'sarah.connor@tardis.ai',
          launchDate: new Date(baseTimestamp - 14 * 24 * 60 * 60 * 1000),
          status: 'completed',
          targetChannel: 'whatsapp',
          totalContacts: 150,
          responseCount: 142,
          npsScore: 67,
          promoters: 95,
          passives: 32,
          detractors: 15,
          lastRunTimestamp: new Date(baseTimestamp - 24 * 60 * 60 * 1000),
          targetLanguage: 'English',
          scriptId: 'nps_whatsapp_banking',
          retryLogic: { enabled: true, maxAttempts: 2 },
          triggerType: 'scheduled',
          scheduledTime: new Date(baseTimestamp - 14 * 24 * 60 * 60 * 1000)
        },
        {
          id: 'nps_banking_003',
          name: 'Digital Banking Experience',
          description: 'NPS survey for mobile app users',
          campaignType: 'nps_survey',
          createdBy: 'sarah.connor@tardis.ai',
          launchDate: new Date(baseTimestamp + 3 * 24 * 60 * 60 * 1000),
          status: 'scheduled',
          targetChannel: 'sms',
          totalContacts: 500,
          responseCount: 0,
          npsScore: 0,
          promoters: 0,
          passives: 0,
          detractors: 0,
          targetLanguage: 'English',
          scriptId: 'nps_sms_banking_v1',
          retryLogic: { enabled: true, maxAttempts: 2 },
          triggerType: 'scheduled',
          scheduledTime: new Date(baseTimestamp + 3 * 24 * 60 * 60 * 1000)
        }
      ];

    case 'telecom':
      return [
        {
          id: 'nps_telecom_001',
          name: 'Network Quality Survey',
          description: '5G/4G service experience feedback',
          campaignType: 'nps_survey',
          createdBy: 'sarah.connor@tardis.ai',
          launchDate: new Date(baseTimestamp - 5 * 24 * 60 * 60 * 1000),
          status: 'running',
          targetChannel: 'sms',
          totalContacts: 800,
          responseCount: 520,
          npsScore: 55,
          promoters: 312,
          passives: 156,
          detractors: 52,
          lastRunTimestamp: new Date(baseTimestamp - 1 * 60 * 60 * 1000),
          targetLanguage: 'English',
          scriptId: 'nps_sms_telecom_v1',
          retryLogic: { enabled: true, maxAttempts: 3 },
          triggerType: 'manual'
        },
        {
          id: 'nps_telecom_002',
          name: 'Customer Service NPS',
          description: 'Support interaction satisfaction survey',
          campaignType: 'nps_survey',
          createdBy: 'sarah.connor@tardis.ai',
          launchDate: new Date(baseTimestamp - 10 * 24 * 60 * 60 * 1000),
          status: 'completed',
          targetChannel: 'voice',
          totalContacts: 200,
          responseCount: 178,
          npsScore: 48,
          promoters: 85,
          passives: 64,
          detractors: 29,
          lastRunTimestamp: new Date(baseTimestamp - 48 * 60 * 60 * 1000),
          targetLanguage: 'English',
          scriptId: 'nps_voice_telecom_v1',
          retryLogic: { enabled: true, maxAttempts: 2 },
          triggerType: 'manual'
        },
        {
          id: 'nps_telecom_003',
          name: 'Plan Value Survey',
          description: 'Data plan value assessment',
          campaignType: 'nps_survey',
          createdBy: 'sarah.connor@tardis.ai',
          launchDate: new Date(baseTimestamp + 5 * 24 * 60 * 60 * 1000),
          status: 'scheduled',
          targetChannel: 'whatsapp',
          totalContacts: 450,
          responseCount: 0,
          npsScore: 0,
          promoters: 0,
          passives: 0,
          detractors: 0,
          targetLanguage: 'English',
          scriptId: 'nps_whatsapp_telecom',
          retryLogic: { enabled: true, maxAttempts: 2 },
          triggerType: 'scheduled',
          scheduledTime: new Date(baseTimestamp + 5 * 24 * 60 * 60 * 1000)
        }
      ];

    case 'airlines':
      return [
        {
          id: 'nps_airlines_001',
          name: 'Flight Experience Survey',
          description: 'Recent passenger satisfaction survey',
          campaignType: 'nps_survey',
          createdBy: 'sarah.connor@tardis.ai',
          launchDate: new Date(baseTimestamp - 3 * 24 * 60 * 60 * 1000),
          status: 'running',
          targetChannel: 'email',
          totalContacts: 650,
          responseCount: 423,
          npsScore: 62,
          promoters: 280,
          passives: 101,
          detractors: 42,
          lastRunTimestamp: new Date(baseTimestamp - 4 * 60 * 60 * 1000),
          targetLanguage: 'English',
          scriptId: 'nps_email_airlines_v1',
          retryLogic: { enabled: true, maxAttempts: 2 },
          triggerType: 'manual'
        },
        {
          id: 'nps_airlines_002',
          name: 'Frequent Flyer NPS',
          description: 'Loyalty program member satisfaction',
          campaignType: 'nps_survey',
          createdBy: 'sarah.connor@tardis.ai',
          launchDate: new Date(baseTimestamp - 20 * 24 * 60 * 60 * 1000),
          status: 'completed',
          targetChannel: 'voice',
          totalContacts: 180,
          responseCount: 165,
          npsScore: 73,
          promoters: 121,
          passives: 33,
          detractors: 11,
          lastRunTimestamp: new Date(baseTimestamp - 15 * 24 * 60 * 60 * 1000),
          targetLanguage: 'English',
          scriptId: 'nps_voice_airlines_v1',
          retryLogic: { enabled: true, maxAttempts: 3 },
          triggerType: 'scheduled',
          scheduledTime: new Date(baseTimestamp - 20 * 24 * 60 * 60 * 1000)
        },
        {
          id: 'nps_airlines_003',
          name: 'In-Flight Service Survey',
          description: 'Service quality feedback from passengers',
          campaignType: 'nps_survey',
          createdBy: 'sarah.connor@tardis.ai',
          launchDate: new Date(baseTimestamp + 2 * 24 * 60 * 60 * 1000),
          status: 'scheduled',
          targetChannel: 'whatsapp',
          totalContacts: 400,
          responseCount: 0,
          npsScore: 0,
          promoters: 0,
          passives: 0,
          detractors: 0,
          targetLanguage: 'English',
          scriptId: 'nps_whatsapp_airlines',
          retryLogic: { enabled: true, maxAttempts: 2 },
          triggerType: 'scheduled',
          scheduledTime: new Date(baseTimestamp + 2 * 24 * 60 * 60 * 1000)
        }
      ];

    case 'hotels':
      return [
        {
          id: 'nps_hotels_001',
          name: 'Guest Satisfaction Survey',
          description: 'Post-stay experience feedback',
          campaignType: 'nps_survey',
          createdBy: 'sarah.connor@tardis.ai',
          launchDate: new Date(baseTimestamp - 6 * 24 * 60 * 60 * 1000),
          status: 'running',
          targetChannel: 'whatsapp',
          totalContacts: 320,
          responseCount: 256,
          npsScore: 58,
          promoters: 154,
          passives: 77,
          detractors: 25,
          lastRunTimestamp: new Date(baseTimestamp - 3 * 60 * 60 * 1000),
          targetLanguage: 'English',
          scriptId: 'nps_whatsapp_hotels',
          retryLogic: { enabled: true, maxAttempts: 2 },
          triggerType: 'manual'
        },
        {
          id: 'nps_hotels_002',
          name: 'Loyalty Member NPS',
          description: 'Rewards program member survey',
          campaignType: 'nps_survey',
          createdBy: 'sarah.connor@tardis.ai',
          launchDate: new Date(baseTimestamp - 12 * 24 * 60 * 60 * 1000),
          status: 'completed',
          targetChannel: 'email',
          totalContacts: 220,
          responseCount: 198,
          npsScore: 69,
          promoters: 138,
          passives: 44,
          detractors: 16,
          lastRunTimestamp: new Date(baseTimestamp - 8 * 24 * 60 * 60 * 1000),
          targetLanguage: 'English',
          scriptId: 'nps_email_hotels_v1',
          retryLogic: { enabled: true, maxAttempts: 2 },
          triggerType: 'scheduled',
          scheduledTime: new Date(baseTimestamp - 12 * 24 * 60 * 60 * 1000)
        },
        {
          id: 'nps_hotels_003',
          name: 'Amenities Feedback Survey',
          description: 'Facilities and services experience',
          campaignType: 'nps_survey',
          createdBy: 'sarah.connor@tardis.ai',
          launchDate: new Date(baseTimestamp + 4 * 24 * 60 * 60 * 1000),
          status: 'scheduled',
          targetChannel: 'voice',
          totalContacts: 280,
          responseCount: 0,
          npsScore: 0,
          promoters: 0,
          passives: 0,
          detractors: 0,
          targetLanguage: 'English',
          scriptId: 'nps_voice_hotels_v1',
          retryLogic: { enabled: true, maxAttempts: 3 },
          triggerType: 'scheduled',
          scheduledTime: new Date(baseTimestamp + 4 * 24 * 60 * 60 * 1000)
        }
      ];

    case 'hospitals':
      return [
        {
          id: 'nps_hospitals_001',
          name: 'Patient Experience Survey',
          description: 'Post-treatment satisfaction survey',
          campaignType: 'nps_survey',
          createdBy: 'sarah.connor@tardis.ai',
          launchDate: new Date(baseTimestamp - 4 * 24 * 60 * 60 * 1000),
          status: 'running',
          targetChannel: 'voice',
          totalContacts: 180,
          responseCount: 134,
          npsScore: 71,
          promoters: 95,
          passives: 28,
          detractors: 11,
          lastRunTimestamp: new Date(baseTimestamp - 6 * 60 * 60 * 1000),
          targetLanguage: 'English',
          scriptId: 'nps_voice_hospitals_v1',
          retryLogic: { enabled: true, maxAttempts: 2 },
          triggerType: 'manual'
        },
        {
          id: 'nps_hospitals_002',
          name: 'Healthcare Quality NPS',
          description: 'Treatment and care quality assessment',
          campaignType: 'nps_survey',
          createdBy: 'sarah.connor@tardis.ai',
          launchDate: new Date(baseTimestamp - 18 * 24 * 60 * 60 * 1000),
          status: 'completed',
          targetChannel: 'sms',
          totalContacts: 240,
          responseCount: 215,
          npsScore: 64,
          promoters: 138,
          passives: 56,
          detractors: 21,
          lastRunTimestamp: new Date(baseTimestamp - 14 * 24 * 60 * 60 * 1000),
          targetLanguage: 'English',
          scriptId: 'nps_sms_hospitals_v1',
          retryLogic: { enabled: true, maxAttempts: 2 },
          triggerType: 'scheduled',
          scheduledTime: new Date(baseTimestamp - 18 * 24 * 60 * 60 * 1000)
        },
        {
          id: 'nps_hospitals_003',
          name: 'Facility Services Survey',
          description: 'Hospital facilities and staff feedback',
          campaignType: 'nps_survey',
          createdBy: 'sarah.connor@tardis.ai',
          launchDate: new Date(baseTimestamp + 6 * 24 * 60 * 60 * 1000),
          status: 'scheduled',
          targetChannel: 'whatsapp',
          totalContacts: 300,
          responseCount: 0,
          npsScore: 0,
          promoters: 0,
          passives: 0,
          detractors: 0,
          targetLanguage: 'English',
          scriptId: 'nps_whatsapp_hospitals',
          retryLogic: { enabled: true, maxAttempts: 2 },
          triggerType: 'scheduled',
          scheduledTime: new Date(baseTimestamp + 6 * 24 * 60 * 60 * 1000)
        }
      ];

    case 'automotive':
      return [
        {
          id: 'nps_automotive_001',
          name: 'Service Experience Survey',
          description: 'Recent service customer satisfaction',
          campaignType: 'nps_survey',
          createdBy: 'sarah.connor@tardis.ai',
          launchDate: new Date(baseTimestamp - 8 * 24 * 60 * 60 * 1000),
          status: 'running',
          targetChannel: 'voice',
          totalContacts: 290,
          responseCount: 217,
          npsScore: 53,
          promoters: 119,
          passives: 72,
          detractors: 26,
          lastRunTimestamp: new Date(baseTimestamp - 5 * 60 * 60 * 1000),
          targetLanguage: 'English',
          scriptId: 'nps_voice_automotive_v1',
          retryLogic: { enabled: true, maxAttempts: 3 },
          triggerType: 'manual'
        },
        {
          id: 'nps_automotive_002',
          name: 'Purchase Satisfaction NPS',
          description: 'New vehicle buyer satisfaction survey',
          campaignType: 'nps_survey',
          createdBy: 'sarah.connor@tardis.ai',
          launchDate: new Date(baseTimestamp - 16 * 24 * 60 * 60 * 1000),
          status: 'completed',
          targetChannel: 'whatsapp',
          totalContacts: 135,
          responseCount: 127,
          npsScore: 75,
          promoters: 95,
          passives: 24,
          detractors: 8,
          lastRunTimestamp: new Date(baseTimestamp - 12 * 24 * 60 * 60 * 1000),
          targetLanguage: 'English',
          scriptId: 'nps_whatsapp_automotive',
          retryLogic: { enabled: true, maxAttempts: 2 },
          triggerType: 'scheduled',
          scheduledTime: new Date(baseTimestamp - 16 * 24 * 60 * 60 * 1000)
        },
        {
          id: 'nps_automotive_003',
          name: 'Dealership Experience Survey',
          description: 'Overall dealership interaction feedback',
          campaignType: 'nps_survey',
          createdBy: 'sarah.connor@tardis.ai',
          launchDate: new Date(baseTimestamp + 7 * 24 * 60 * 60 * 1000),
          status: 'scheduled',
          targetChannel: 'sms',
          totalContacts: 380,
          responseCount: 0,
          npsScore: 0,
          promoters: 0,
          passives: 0,
          detractors: 0,
          targetLanguage: 'English',
          scriptId: 'nps_sms_automotive_v1',
          retryLogic: { enabled: true, maxAttempts: 2 },
          triggerType: 'scheduled',
          scheduledTime: new Date(baseTimestamp + 7 * 24 * 60 * 60 * 1000)
        }
      ];

    case 'insurance':
      return [
        {
          id: 'nps_insurance_001',
          name: 'Claim Processing Experience',
          description: 'Customer satisfaction with claim handling',
          campaignType: 'nps_survey',
          createdBy: 'sarah.connor@tardis.ai',
          launchDate: new Date(baseTimestamp - 4 * 24 * 60 * 60 * 1000),
          status: 'running',
          targetChannel: 'voice',
          totalContacts: 400,
          responseCount: 280,
          npsScore: 52,
          promoters: 140,
          passives: 98,
          detractors: 42,
          lastRunTimestamp: new Date(baseTimestamp - 2 * 60 * 60 * 1000),
          targetLanguage: 'English',
          scriptId: 'nps_voice_insurance_v1',
          retryLogic: { enabled: true, maxAttempts: 3 },
          triggerType: 'manual'
        },
        {
          id: 'nps_insurance_002',
          name: 'Policy Renewal Satisfaction',
          description: 'Feedback on policy renewal process',
          campaignType: 'nps_survey',
          createdBy: 'sarah.connor@tardis.ai',
          launchDate: new Date(baseTimestamp - 15 * 24 * 60 * 60 * 1000),
          status: 'completed',
          targetChannel: 'sms',
          totalContacts: 550,
          responseCount: 467,
          npsScore: 61,
          promoters: 308,
          passives: 112,
          detractors: 47,
          lastRunTimestamp: new Date(baseTimestamp - 10 * 24 * 60 * 60 * 1000),
          targetLanguage: 'English',
          scriptId: 'nps_sms_insurance_v1',
          retryLogic: { enabled: true, maxAttempts: 2 },
          triggerType: 'scheduled',
          scheduledTime: new Date(baseTimestamp - 15 * 24 * 60 * 60 * 1000)
        },
        {
          id: 'nps_insurance_003',
          name: 'Customer Service NPS',
          description: 'Overall customer service satisfaction survey',
          campaignType: 'nps_survey',
          createdBy: 'sarah.connor@tardis.ai',
          launchDate: new Date(baseTimestamp + 7 * 24 * 60 * 60 * 1000),
          status: 'scheduled',
          targetChannel: 'email',
          totalContacts: 720,
          responseCount: 0,
          npsScore: 0,
          promoters: 0,
          passives: 0,
          detractors: 0,
          targetLanguage: 'English',
          scriptId: 'nps_email_insurance_v1',
          retryLogic: { enabled: true, maxAttempts: 2 },
          triggerType: 'scheduled',
          scheduledTime: new Date(baseTimestamp + 7 * 24 * 60 * 60 * 1000)
        }
      ];

    default:
      return generateIndustrySpecificNPSCampaigns('banking');
  }
};

// NPS Scripts Generation
export const generateIndustrySpecificNPSScripts = (industry: Industry) => {
  const placeholderMap = {
    banking: 'bank_name',
    telecom: 'operator_name',
    airlines: 'airline_name',
    hotels: 'hotel_name',
    hospitals: 'hospital_name',
    automotive: 'dealership_name',
    insurance: 'insurance_company'
  };

  const entityName = placeholderMap[industry];
  const contextMap = {
    banking: 'banking services',
    telecom: 'network service',
    airlines: 'for air travel',
    hotels: 'for accommodation',
    hospitals: 'for healthcare services',
    automotive: 'for vehicle services',
    insurance: 'for insurance services'
  };
  const context = contextMap[industry];

  return [
    {
      id: `nps_voice_${industry}_v1`,
      name: `Standard Voice NPS Survey`,
      type: 'voice' as const,
      content: `Hello {{name}}, this is {{${entityName}}}. On a scale from 0 to 10, where 10 means extremely likely and 0 means not at all likely, how likely are you to recommend {{${entityName}}} ${context} to a friend or colleague? Please press the number on your keypad or say the number clearly.`,
      language: 'English',
      version: '1.0',
      placeholders: ['name', entityName]
    },
    {
      id: `nps_whatsapp_${industry}`,
      name: `WhatsApp NPS Quick Survey`,
      type: 'whatsapp' as const,
      content: `Hi {{name}}! 👋 How likely are you to recommend {{${entityName}}} to others? Please reply with a number from 0-10. We value your feedback! 🌟`,
      language: 'English',
      version: '1.0',
      placeholders: ['name', entityName]
    },
    {
      id: `nps_sms_${industry}_v1`,
      name: `Standard SMS NPS Survey`,
      type: 'sms' as const,
      content: `{{${entityName}}}: Rate us 0-10! How likely are you to recommend us to others? Reply with just the number. Thank you {{name}}!`,
      language: 'English',
      version: '1.0',
      placeholders: ['name', entityName]
    },
    {
      id: `nps_email_${industry}_v1`,
      name: `Email NPS Survey`,
      type: 'email' as const,
      content: `Dear {{name}}, we value your opinion! Please click the link below to rate how likely you are to recommend {{${entityName}}} to others on a scale of 0-10. [Survey Link]`,
      language: 'English',
      version: '1.0',
      placeholders: ['name', entityName]
    }
  ];
};

// Salesforce Campaign Generation
export const generateIndustrySpecificSalesforceCampaigns = (industry: Industry) => {
  const salesforceCampaigns = {
    banking: [
      { id: 'sf_bank_001', name: 'Q1 2025 Personal Loan Campaign', status: 'Active', leads: 1250 },
      { id: 'sf_bank_002', name: 'Credit Card Cross-Sell Q4', status: 'Active', leads: 890 },
      { id: 'sf_bank_003', name: 'Home Loan Pre-Approved Leads', status: 'Active', leads: 456 },
      { id: 'sf_bank_004', name: 'Digital Banking Adoption Drive', status: 'Paused', leads: 320 }
    ],
    telecom: [
      { id: 'sf_telecom_001', name: '5G Plan Upgrade Campaign', status: 'Active', leads: 2100 },
      { id: 'sf_telecom_002', name: 'Postpaid to Prepaid Migration', status: 'Active', leads: 780 },
      { id: 'sf_telecom_003', name: 'Family Plan Offers', status: 'Active', leads: 1450 },
      { id: 'sf_telecom_004', name: 'Business Account Leads', status: 'Active', leads: 620 }
    ],
    airlines: [
      { id: 'sf_airlines_001', name: 'Frequent Flyer Reactivation', status: 'Active', leads: 3200 },
      { id: 'sf_airlines_002', name: 'Premium Cabin Upgrade Offers', status: 'Active', leads: 890 },
      { id: 'sf_airlines_003', name: 'Seasonal Route Promotions', status: 'Active', leads: 1560 },
      { id: 'sf_airlines_004', name: 'Corporate Travel Leads', status: 'Paused', leads: 420 }
    ],
    hotels: [
      { id: 'sf_hotels_001', name: 'Loyalty Program Enrollment', status: 'Active', leads: 1890 },
      { id: 'sf_hotels_002', name: 'Wedding & Event Packages', status: 'Active', leads: 340 },
      { id: 'sf_hotels_003', name: 'Extended Stay Promotions', status: 'Active', leads: 670 },
      { id: 'sf_hotels_004', name: 'Corporate Account Leads', status: 'Active', leads: 510 }
    ],
    hospitals: [
      { id: 'sf_hospitals_001', name: 'Annual Health Checkup Campaign', status: 'Active', leads: 2450 },
      { id: 'sf_hospitals_002', name: 'Specialist Consultation Leads', status: 'Active', leads: 890 },
      { id: 'sf_hospitals_003', name: 'Wellness Program Enrollment', status: 'Active', leads: 1120 },
      { id: 'sf_hospitals_004', name: 'Insurance Network Referrals', status: 'Paused', leads: 560 }
    ],
    automotive: [
      { id: 'sf_auto_001', name: 'Peugeot New Model Launch Leads', status: 'Active', leads: 1850 },
      { id: 'sf_auto_002', name: 'Test Drive Request Follow-ups', status: 'Active', leads: 920 },
      { id: 'sf_auto_003', name: 'Trade-In Evaluation Leads', status: 'Active', leads: 650 },
      { id: 'sf_auto_004', name: 'Service Plan Renewals', status: 'Active', leads: 1240 },
      { id: 'sf_auto_005', name: 'SUV Buyer Interest Campaign', status: 'Paused', leads: 780 }
    ],
    insurance: [
      { id: 'sf_insurance_001', name: 'Policy Renewal Leads - Q1', status: 'Active', leads: 3100 },
      { id: 'sf_insurance_002', name: 'New Policy Cross-Sell Campaign', status: 'Active', leads: 1450 },
      { id: 'sf_insurance_003', name: 'Claim Closure Follow-ups', status: 'Active', leads: 890 },
      { id: 'sf_insurance_004', name: 'Life Insurance Enquiries', status: 'Active', leads: 670 }
    ]
  };

  return salesforceCampaigns[industry] || salesforceCampaigns.banking;
};

// NPS Responses Generation
export const generateIndustrySpecificNPSResponses = (industry: Industry) => {
  const campaigns = generateIndustrySpecificNPSCampaigns(industry);
  const baseTimestamp = Date.now();

  const feedbackMap = {
    banking: {
      promoter: [
        'Excellent banking service! Great mobile app.',
        'Outstanding! I will definitely recommend this bank to my friends and family.',
        'Very satisfied with the AI agent interaction.',
        'Perfect! Love the premium banking service.'
      ],
      passive: [
        'It was okay, nothing special but got the job done.',
        'Good service, could be faster though.',
        'Good but could improve response time.'
      ],
      detractor: [
        'The service was slow and I had to wait too long. Not satisfied.',
        'Had some issues with the mobile app integration.'
      ]
    },
    telecom: {
      promoter: [
        'Network coverage is excellent in my area!',
        'Best data speeds I\'ve ever experienced.',
        'Customer support was very helpful and quick.',
        'Love the affordable plans and reliable service.'
      ],
      passive: [
        'Service is okay, but could be more consistent.',
        'Network is decent, sometimes drops in certain areas.',
        'Fair pricing, but customer service needs improvement.'
      ],
      detractor: [
        'Data speeds could be much better.',
        'Frequent network outages in my neighborhood.',
        'Billing issues and poor support response.'
      ]
    },
    airlines: {
      promoter: [
        'Flight was on time, crew was very professional!',
        'Comfortable seats and excellent in-flight service.',
        'Smooth check-in and boarding process.',
        'Best airline experience I\'ve had in years!'
      ],
      passive: [
        'Flight was fine, nothing exceptional.',
        'Crew was friendly but boarding took longer than expected.',
        'Decent experience, but legroom could be better.'
      ],
      detractor: [
        'Baggage handling needs major improvement.',
        'Flight delayed by 3 hours with no proper communication.',
        'Uncomfortable seats and poor meal quality.'
      ]
    },
    hotels: {
      promoter: [
        'Room was spotless, staff incredibly friendly!',
        'Amazing amenities and excellent location.',
        'Best hotel stay in a long time, will definitely return.',
        'Outstanding service from check-in to check-out!'
      ],
      passive: [
        'Room was clean, nothing extraordinary.',
        'Good location, but service could be friendlier.',
        'Decent stay, but WiFi was slow.'
      ],
      detractor: [
        'Check-in process took way too long.',
        'Room was not as advertised, quite disappointing.',
        'Noisy environment, couldn\'t sleep properly.'
      ]
    },
    hospitals: {
      promoter: [
        'Doctors were caring and very attentive to my needs.',
        'Excellent treatment and follow-up care.',
        'Clean facilities and professional staff.',
        'Best healthcare experience, very impressed!'
      ],
      passive: [
        'Treatment was good, but waiting time was long.',
        'Doctors were professional, but staff could be friendlier.',
        'Satisfied with care, but facilities need updating.'
      ],
      detractor: [
        'Waiting time was excessive, over 4 hours!',
        'Staff seemed rushed and not very attentive.',
        'Billing process was confusing and frustrating.'
      ]
    },
    automotive: {
      promoter: [
        'Service was quick, mechanic explained everything clearly!',
        'Best dealership experience, no pressure sales.',
        'Quality work and transparent pricing.',
        'Excellent service department, highly recommend!'
      ],
      passive: [
        'Service was okay, took longer than estimated.',
        'Decent experience, but pricing could be more competitive.',
        'Good service, but waiting area needs improvement.'
      ],
      detractor: [
        'Parts took way too long to arrive.',
        'Felt pressured during the sales process.',
        'Service was expensive and not up to standard.'
      ]
    },
    insurance: {
      promoter: [
        'Claim was processed quickly and smoothly. Very professional service.',
        'Excellent customer support and transparent policy terms.',
        'Best insurance company I\'ve dealt with, highly recommend!',
        'Claims process was hassle-free, very impressed!'
      ],
      passive: [
        'Service was okay but claim took longer than expected.',
        'Good coverage, but customer service could be faster.',
        'Satisfied with policy, but premium is a bit high.'
      ],
      detractor: [
        'Too much paperwork and unclear claim process.',
        'Claim was denied without proper explanation.',
        'Premium increased significantly without notice.'
      ]
    }
  };

  const feedback = feedbackMap[industry];
  const responses: any[] = [];

  // Generate responses for first 2 campaigns (skip scheduled ones)
  campaigns.slice(0, 2).forEach((campaign, campaignIndex) => {
    const responseCount = Math.min(campaign.responseCount, 10);
    const promoterCount = Math.ceil(responseCount * 0.5);
    const passiveCount = Math.ceil(responseCount * 0.3);
    const detractorCount = responseCount - promoterCount - passiveCount;

    // Promoters
    for (let i = 0; i < promoterCount; i++) {
      const responseId = `nps_resp_${industry}_${campaignIndex * 10 + i + 1}`;
      responses.push({
        id: responseId,
        campaignId: campaign.id,
        contactId: `contact_${industry}_${i + 1}`,
        name: `Customer ${i + 1}`,
        mobileNumber: `+25470${Math.floor(1000000 + Math.random() * 9000000)}`,
        email: campaign.targetChannel === 'email' || campaign.targetChannel === 'whatsapp' ? `customer${i + 1}@email.com` : undefined,
        npsScore: 9 + Math.floor(Math.random() * 2),
        category: 'promoter',
        feedback: feedback.promoter[i % feedback.promoter.length],
        responseTimestamp: new Date(baseTimestamp - (i + 1) * 3 * 60 * 60 * 1000),
        channel: campaign.targetChannel,
        callDuration: campaign.targetChannel === 'voice' ? 90 + Math.floor(Math.random() * 60) : undefined,
        transcriptId: campaign.targetChannel === 'voice' ? `transcript_${responseId}` : undefined,
        recordingId: campaign.targetChannel === 'voice' ? `recording_${responseId}` : undefined,
        escalated: false,
        vipTagged: i % 3 === 0
      });
    }

    // Passives
    for (let i = 0; i < passiveCount; i++) {
      const responseId = `nps_resp_${industry}_${campaignIndex * 10 + promoterCount + i + 1}`;
      responses.push({
        id: responseId,
        campaignId: campaign.id,
        contactId: `contact_${industry}_${promoterCount + i + 1}`,
        name: `Customer ${promoterCount + i + 1}`,
        mobileNumber: `+25470${Math.floor(1000000 + Math.random() * 9000000)}`,
        email: campaign.targetChannel === 'email' || campaign.targetChannel === 'whatsapp' ? `customer${promoterCount + i + 1}@email.com` : undefined,
        npsScore: 7 + Math.floor(Math.random() * 2),
        category: 'passive',
        feedback: feedback.passive[i % feedback.passive.length],
        responseTimestamp: new Date(baseTimestamp - (promoterCount + i + 1) * 3 * 60 * 60 * 1000),
        channel: campaign.targetChannel,
        callDuration: campaign.targetChannel === 'voice' ? 60 + Math.floor(Math.random() * 40) : undefined,
        transcriptId: campaign.targetChannel === 'voice' ? `transcript_${responseId}` : undefined,
        recordingId: campaign.targetChannel === 'voice' ? `recording_${responseId}` : undefined,
        escalated: false,
        vipTagged: false
      });
    }

    // Detractors
    for (let i = 0; i < detractorCount; i++) {
      const responseId = `nps_resp_${industry}_${campaignIndex * 10 + promoterCount + passiveCount + i + 1}`;
      responses.push({
        id: responseId,
        campaignId: campaign.id,
        contactId: `contact_${industry}_${promoterCount + passiveCount + i + 1}`,
        name: `Customer ${promoterCount + passiveCount + i + 1}`,
        mobileNumber: `+25470${Math.floor(1000000 + Math.random() * 9000000)}`,
        email: campaign.targetChannel === 'email' || campaign.targetChannel === 'whatsapp' ? `customer${promoterCount + passiveCount + i + 1}@email.com` : undefined,
        npsScore: Math.floor(Math.random() * 7),
        category: 'detractor',
        feedback: feedback.detractor[i % feedback.detractor.length],
        responseTimestamp: new Date(baseTimestamp - (promoterCount + passiveCount + i + 1) * 3 * 60 * 60 * 1000),
        channel: campaign.targetChannel,
        callDuration: campaign.targetChannel === 'voice' ? 50 + Math.floor(Math.random() * 50) : undefined,
        transcriptId: campaign.targetChannel === 'voice' ? `transcript_${responseId}` : undefined,
        recordingId: campaign.targetChannel === 'voice' ? `recording_${responseId}` : undefined,
        escalated: i === 0,
        vipTagged: false
      });
    }
  });

  return responses;
};
