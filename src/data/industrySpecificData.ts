import { Industry } from '@/types/industry';

// Base templates that can be customized per industry
export const getIndustrySpecificScripts = (industry: Industry) => {
  const baseScripts = {
    banking: [
      {
        id: 'emi-reminder',
        name: 'EMI Reminder Script',
        content: 'Hello, this is a reminder about your upcoming EMI payment of ${amount} due on ${date}. Would you like to make the payment now?',
        variables: ['amount', 'date'],
        intent: 'Payment Reminder'
      },
      {
        id: 'loan-status',
        name: 'Loan Status Inquiry',
        content: 'I can help you check your loan application status. May I have your application reference number?',
        variables: ['application_id'],
        intent: 'Loan Status'
      }
    ],
    telecom: [
      {
        id: 'bill-reminder',
        name: 'Bill Payment Reminder',
        content: 'Hello, this is a reminder about your upcoming bill payment of ${amount} due on ${date}. Would you like to make the payment now?',
        variables: ['amount', 'date'],
        intent: 'Bill Payment Reminder'
      },
      {
        id: 'service-upgrade',
        name: 'Service Plan Upgrade',
        content: 'I see you\'re eligible for a service plan upgrade. Would you like to hear about our new plans with better data and calling benefits?',
        variables: ['current_plan', 'new_plan'],
        intent: 'Service Upgrade'
      }
    ],
    airlines: [
      {
        id: 'flight-reminder',
        name: 'Flight Reminder',
        content: 'This is a reminder for your flight ${flight_number} on ${date}. Check-in is now available. Would you like me to help you check in?',
        variables: ['flight_number', 'date'],
        intent: 'Flight Reminder'
      },
      {
        id: 'booking-confirmation',
        name: 'Booking Confirmation',
        content: 'Your flight booking has been confirmed. Flight ${flight_number} from ${origin} to ${destination} on ${date}.',
        variables: ['flight_number', 'origin', 'destination', 'date'],
        intent: 'Booking Confirmation'
      }
    ],
    hotels: [
      {
        id: 'reservation-reminder',
        name: 'Reservation Reminder',
        content: 'This is a reminder for your hotel reservation at ${hotel_name} on ${date}. Would you like to confirm your check-in time?',
        variables: ['hotel_name', 'date'],
        intent: 'Reservation Reminder'
      },
      {
        id: 'loyalty-offer',
        name: 'Loyalty Program Offer',
        content: 'As a valued guest, you\'re eligible for our loyalty program benefits. Would you like to hear about exclusive offers?',
        variables: ['guest_name', 'points'],
        intent: 'Loyalty Program'
      }
    ],
    hospitals: [
      {
        id: 'appointment-reminder',
        name: 'Appointment Reminder',
        content: 'This is a reminder for your appointment with Dr. ${doctor_name} on ${date} at ${time}. Please confirm your attendance.',
        variables: ['doctor_name', 'date', 'time'],
        intent: 'Appointment Reminder'
      },
      {
        id: 'health-checkup',
        name: 'Health Checkup Follow-up',
        content: 'Your recent health checkup results are ready. Would you like to schedule a follow-up consultation?',
        variables: ['patient_name', 'test_results'],
        intent: 'Health Checkup'
      }
    ],
    automotive: [
      {
        id: 'service-reminder',
        name: 'Service Reminder Script',
        content: 'Hello ${customer_name}, this is a reminder that your ${vehicle_model} is due for its ${service_type} on ${service_date}. Would you like to schedule an appointment?',
        variables: ['customer_name', 'vehicle_model', 'service_type', 'service_date'],
        intent: 'Service Booking'
      },
      {
        id: 'lead-qualification',
        name: 'Lead Qualification Follow-up',
        content: 'Hi ${customer_name}, thank you for your interest in the ${vehicle_model}. I\'m calling to answer any questions and schedule a test drive at your convenience.',
        variables: ['customer_name', 'vehicle_model'],
        intent: 'Lead Qualification'
      }
    ],
    insurance: [
      {
        id: 'premium-reminder',
        name: 'Premium Reminder Script',
        content: 'Dear ${customer_name}, your insurance premium of ${amount} is due on ${due_date}. Please make the payment to keep your policy active.',
        variables: ['customer_name', 'amount', 'due_date'],
        intent: 'Premium Payment'
      },
      {
        id: 'claim-status',
        name: 'Claim Status Update Script',
        content: 'Hello ${customer_name}, your claim ${claim_number} has been ${claim_status}. Expected processing time: ${processing_time} days.',
        variables: ['customer_name', 'claim_number', 'claim_status', 'processing_time'],
        intent: 'Claim Status'
      },
      {
        id: 'policy-renewal',
        name: 'Policy Renewal Script',
        content: 'Dear ${customer_name}, your ${policy_type} policy expires on ${expiry_date}. Renew now to continue enjoying coverage.',
        variables: ['customer_name', 'policy_type', 'expiry_date'],
        intent: 'Policy Renewal'
      }
    ]
  };

  return baseScripts[industry] || baseScripts.banking;
};

export const getIndustrySpecificCampaigns = (industry: Industry) => {
  const baseCampaigns = {
    banking: [
      {
        name: 'Q4 Loan Collection Drive',
        type: 'Collection',
        description: 'Follow-up on overdue loan payments',
        status: 'active'
      },
      {
        name: 'Credit Card Upgrade Campaign',
        type: 'Upsell',
        description: 'Promote premium credit card features',
        status: 'active'
      }
    ],
    telecom: [
      {
        name: 'Bill Payment Reminder Campaign',
        type: 'Collection',
        description: 'Remind customers about pending bill payments',
        status: 'active'
      },
      {
        name: 'Data Plan Upgrade Campaign',
        type: 'Upsell',
        description: 'Promote higher data plans to eligible customers',
        status: 'active'
      }
    ],
    airlines: [
      {
        name: 'Flight Booking Reminders',
        type: 'Service',
        description: 'Remind passengers about upcoming flights',
        status: 'active'
      },
      {
        name: 'Loyalty Program Enrollment',
        type: 'Upsell',
        description: 'Enroll eligible passengers in loyalty program',
        status: 'active'
      }
    ],
    hotels: [
      {
        name: 'Reservation Confirmations',
        type: 'Service',
        description: 'Confirm hotel reservations and check-in details',
        status: 'active'
      },
      {
        name: 'Room Upgrade Offers',
        type: 'Upsell',
        description: 'Offer room upgrades to premium guests',
        status: 'active'
      }
    ],
    hospitals: [
      {
        name: 'Appointment Reminders',
        type: 'Service',
        description: 'Remind patients about upcoming appointments',
        status: 'active'
      },
      {
        name: 'Health Checkup Follow-ups',
        type: 'Service',
        description: 'Follow up on health checkup results',
        status: 'active'
      }
    ],
    automotive: [
      {
        name: 'Quarterly Service Reminder Campaign',
        type: 'Service',
        description: 'Remind vehicle owners about scheduled maintenance',
        status: 'active'
      },
      {
        name: 'New Lead Qualification Drive',
        type: 'Sales',
        description: 'Follow up with potential customers and schedule test drives',
        status: 'active'
      }
    ],
    insurance: [
      {
        name: 'Q1 Premium Collection Drive',
        type: 'Collection',
        description: 'Quarterly campaign for premium payment reminders',
        status: 'active'
      },
      {
        name: 'Claim Status Notification Campaign',
        type: 'Service',
        description: 'Automated updates for claim processing',
        status: 'active'
      },
      {
        name: 'Annual Policy Renewal Campaign',
        type: 'Service',
        description: 'Renewal reminders for expiring policies',
        status: 'active'
      }
    ]
  };

  return baseCampaigns[industry] || baseCampaigns.banking;
};

export const getIndustrySpecificIntents = (industry: Industry) => {
  const baseIntents = {
    banking: ['Payment Reminder', 'Loan Status', 'Account Balance', 'Transaction History', 'Credit Score'],
    telecom: ['Bill Payment', 'Service Upgrade', 'Network Issues', 'Plan Details', 'Data Usage'],
    airlines: ['Flight Status', 'Booking Confirmation', 'Check-in', 'Baggage Claim', 'Seat Selection'],
    hotels: ['Reservation Status', 'Room Service', 'Check-in/Check-out', 'Amenities', 'Local Information'],
    hospitals: ['Appointment Scheduling', 'Test Results', 'Insurance Verification', 'Prescription Refill', 'Emergency Contact'],
    automotive: ['Service Booking', 'Lead Qualification', 'Test Drive', 'Vehicle Purchase', 'Warranty Inquiry'],
    insurance: ['Premium Payment', 'Claim Status', 'Policy Renewal', 'New Policy Inquiry', 'Coverage Details', 'Document Upload', 'Agent Callback Request']
  };

  return baseIntents[industry] || baseIntents.banking;
};