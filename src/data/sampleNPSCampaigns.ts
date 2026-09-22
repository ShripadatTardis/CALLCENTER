
import { NPSCampaign } from '@/types/auth';

export const sampleNPSCampaigns: NPSCampaign[] = [
  {
    id: 'nps_001',
    name: 'Q4 Customer Loyalty Survey',
    description: 'Quarterly NPS survey for retail banking customers',
    campaignType: 'nps_survey',
    createdBy: 'sarah.connor@tardis.ai',
    launchDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    status: 'running',
    targetChannel: 'voice',
    totalContacts: 250,
    responseCount: 187,
    npsScore: 42,
    promoters: 89,
    passives: 62,
    detractors: 36,
    lastRunTimestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    targetLanguage: 'English',
    scriptId: 'nps_voice_standard_v1',
    retryLogic: {
      enabled: true,
      maxAttempts: 3
    },
    triggerType: 'manual'
  },
  {
    id: 'nps_002',
    name: 'Premium Banking NPS',
    description: 'NPS survey for premium banking customers',
    campaignType: 'nps_survey',
    createdBy: 'sarah.connor@tardis.ai',
    launchDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    status: 'completed',
    targetChannel: 'whatsapp',
    totalContacts: 150,
    responseCount: 142,
    npsScore: 67,
    promoters: 95,
    passives: 32,
    detractors: 15,
    lastRunTimestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
    targetLanguage: 'English',
    scriptId: 'nps_whatsapp_template',
    retryLogic: {
      enabled: true,
      maxAttempts: 2
    },
    triggerType: 'scheduled',
    scheduledTime: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  },
  {
    id: 'nps_003',
    name: 'Digital Banking Experience',
    description: 'NPS survey for mobile app users',
    campaignType: 'nps_survey',
    createdBy: 'sarah.connor@tardis.ai',
    launchDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    status: 'scheduled',
    targetChannel: 'sms',
    totalContacts: 500,
    responseCount: 0,
    npsScore: 0,
    promoters: 0,
    passives: 0,
    detractors: 0,
    targetLanguage: 'English',
    scriptId: 'nps_sms_standard_v1',
    retryLogic: {
      enabled: true,
      maxAttempts: 2
    },
    triggerType: 'scheduled',
    scheduledTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  }
];
