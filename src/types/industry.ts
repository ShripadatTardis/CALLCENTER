export type Industry = 'banking' | 'telecom' | 'airlines' | 'hotels' | 'hospitals' | 'automotive' | 'insurance';

export interface IndustryConfig {
  id: Industry;
  name: string;
  primaryColor: string;
  description: string;
  features: {
    campaigns: string[];
    intents: string[];
    terminology: Record<string, string>;
  };
}

export interface IndustryContext {
  selectedIndustry: Industry;
  industryConfig: IndustryConfig;
  setIndustry: (industry: Industry) => void;
}

export const INDUSTRY_CONFIGS: Record<Industry, IndustryConfig> = {
  banking: {
    id: 'banking',
    name: 'Banking & Financial Services',
    primaryColor: 'hsl(221, 83%, 53%)',
    description: 'Financial services, loans, and banking solutions',
    features: {
      campaigns: ['EMI Reminders', 'Credit Card Offers', 'Loan Applications', 'Account Updates'],
      intents: ['loan_inquiry', 'emi_reminder', 'credit_card_offer', 'account_balance'],
      terminology: {
        'customer': 'Account Holder',
        'service': 'Financial Product',
        'payment': 'EMI Payment',
        'offer': 'Credit Offer',
        'reminder': 'Payment Reminder',
        'application': 'Loan Application'
      }
    }
  },
  telecom: {
    id: 'telecom',
    name: 'Telecommunications',
    primaryColor: 'hsl(263, 70%, 50%)',
    description: 'Mobile services, plans, and connectivity solutions',
    features: {
      campaigns: ['Bill Payment Reminders', 'Plan Upgrades', 'Service Activations', 'Network Updates'],
      intents: ['bill_payment', 'plan_upgrade', 'service_activation', 'network_issue'],
      terminology: {
        'customer': 'Subscriber',
        'service': 'Service Plan',
        'payment': 'Bill Payment',
        'offer': 'Plan Upgrade',
        'reminder': 'Bill Reminder',
        'application': 'Service Request'
      }
    }
  },
  airlines: {
    id: 'airlines',
    name: 'Airlines & Aviation',
    primaryColor: 'hsl(200, 98%, 39%)',
    description: 'Flight services, bookings, and travel solutions',
    features: {
      campaigns: ['Flight Reminders', 'Booking Confirmations', 'Loyalty Programs', 'Check-in Notifications'],
      intents: ['flight_booking', 'check_in_reminder', 'loyalty_program', 'flight_status'],
      terminology: {
        'customer': 'Passenger',
        'service': 'Flight Service',
        'payment': 'Booking Payment',
        'offer': 'Travel Offer',
        'reminder': 'Flight Reminder',
        'application': 'Booking Request'
      }
    }
  },
  hotels: {
    id: 'hotels',
    name: 'Hotels & Hospitality',
    primaryColor: 'hsl(25, 95%, 53%)',
    description: 'Hotel services, reservations, and hospitality solutions',
    features: {
      campaigns: ['Reservation Confirmations', 'Check-in Reminders', 'Loyalty Programs', 'Feedback Collection'],
      intents: ['reservation_booking', 'check_in_reminder', 'loyalty_program', 'feedback_request'],
      terminology: {
        'customer': 'Guest',
        'service': 'Hotel Service',
        'payment': 'Booking Payment',
        'offer': 'Special Offer',
        'reminder': 'Stay Reminder',
        'application': 'Reservation Request'
      }
    }
  },
  hospitals: {
    id: 'hospitals',
    name: 'Healthcare & Hospitals',
    primaryColor: 'hsl(142, 71%, 45%)',
    description: 'Healthcare services, appointments, and medical solutions',
    features: {
      campaigns: ['Appointment Reminders', 'Health Checkups', 'Insurance Verification', 'Follow-up Care'],
      intents: ['appointment_booking', 'health_checkup', 'insurance_verification', 'follow_up'],
      terminology: {
        'customer': 'Patient',
        'service': 'Medical Service',
        'payment': 'Medical Payment',
        'offer': 'Health Package',
        'reminder': 'Appointment Reminder',
        'application': 'Medical Request'
      }
    }
  },
  automotive: {
    id: 'automotive',
    name: 'Automotive & Dealerships',
    primaryColor: 'hsl(10, 90%, 50%)',
    description: 'Vehicle sales, service reminders, and dealership solutions',
    features: {
      campaigns: ['Service Reminders', 'Lead Follow-ups', 'Test Drive Bookings', 'Warranty Alerts'],
      intents: ['service_booking', 'lead_qualification', 'test_drive', 'warranty_inquiry'],
      terminology: {
        'customer': 'Vehicle Owner',
        'service': 'Service Package',
        'payment': 'Service Payment',
        'offer': 'Promotion',
        'reminder': 'Service Reminder',
        'application': 'Service Request'
      }
    }
  },
  insurance: {
    id: 'insurance',
    name: 'Insurance & Risk Management',
    primaryColor: 'hsl(280, 70%, 55%)',
    description: 'Insurance policies, claims, and risk management solutions',
    features: {
      campaigns: ['Policy Renewal', 'Claim Status Updates', 'Premium Reminders', 'New Policy Offers'],
      intents: ['policy_inquiry', 'claim_status', 'premium_payment', 'policy_renewal'],
      terminology: {
        'customer': 'Policyholder',
        'service': 'Insurance Policy',
        'payment': 'Premium Payment',
        'offer': 'Policy Offer',
        'reminder': 'Premium Reminder',
        'application': 'Policy Application'
      }
    }
  }
};