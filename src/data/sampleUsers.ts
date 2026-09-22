
import { User } from '@/types/auth';

export const sampleUsers: User[] = [
  {
    id: '1',
    email: 'sarah.connor@tardis.ai',
    name: 'Sarah Connor',
    role: 'call_center_head',
    permissions: [
      'view_all_dashboards', 
      'manage_users', 
      'view_analytics', 
      'manage_settings', 
      'view_call_logs', 
      'manage_escalations', 
      'monitor_real_time',
      'manage_outbound_campaigns',
      'view_campaign_reports',
      'upload_customer_lists',
      'view_csat_analytics',
      'export_reports',
      'view_executive_reports',
      'manage_csat_settings',
      'manage_nps_campaigns',
      'view_nps_analytics',
      'create_nps_surveys',
      'export_nps_reports',
      'test_bound_calls',
      'manage_whatsapp_messages',
      // AI Conversation Orchestrator Permissions
      'orchestrator_view',
      'orchestrator_edit',
      'orchestrator_approve',
      'orchestrator_publish',
      'orchestrator_delete',
      'orchestrator_manage_integrations',
      'orchestrator_run_simulation',
      // Comprehensive Reports Permissions
      'view_reports',
      'view_executive_reports',
      'view_campaign_reports',
      'view_nps_analytics',
      'view_financial_reports',
      'view_compliance_reports',
      'view_system_metrics',
      'schedule_reports',
      'export_all_reports',
      'create_custom_reports'
    ]
  },
  {
    id: '2',
    email: 'mike.qa@tardis.ai',
    name: 'Mike Rodriguez',
    role: 'qa_reviewer',
    permissions: [
      'view_call_logs', 
      'review_transcripts', 
      'tag_conversations', 
      'quality_scoring', 
      'feedback_ai',
      'view_csat_analytics',
      'test_bound_calls',
      'manage_whatsapp_messages',
      // AI Conversation Orchestrator Permissions (Limited)
      'orchestrator_view',
      'orchestrator_run_simulation',
      // Limited Reports Permissions
      'view_reports',
      'view_campaign_reports',
      'export_reports'
    ]
  }
];
