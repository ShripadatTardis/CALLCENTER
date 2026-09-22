
import { Report } from '@/types/reports';

export const sampleReports: Report[] = [
  // Executive Reports
  {
    id: 'exec-dashboard',
    name: 'Executive Dashboard',
    description: 'High-level KPIs and business metrics overview',
    category: 'executive',
    type: 'dashboard',
    permissions: ['view_executive_reports'],
    icon: 'BarChart3',
    estimatedTime: '2-3 minutes',
    dataSource: ['calls', 'campaigns', 'agents', 'csat'],
    exportFormats: ['pdf', 'powerpoint'],
    lastGenerated: new Date(Date.now() - 2 * 60 * 60 * 1000)
  },
  {
    id: 'monthly-summary',
    name: 'Monthly Business Summary',
    description: 'Comprehensive monthly performance summary',
    category: 'executive',
    type: 'summary',
    permissions: ['view_executive_reports'],
    icon: 'TrendingUp',
    estimatedTime: '5-7 minutes',
    dataSource: ['calls', 'campaigns', 'revenue', 'costs'],
    exportFormats: ['pdf', 'powerpoint', 'excel']
  },
  
  // Campaign Performance Reports
  {
    id: 'outbound-performance',
    name: 'Outbound Campaign Performance',
    description: 'Detailed analysis of outbound campaign effectiveness',
    category: 'campaign_performance',
    type: 'detailed',
    permissions: ['view_campaign_reports'],
    icon: 'PhoneCall',
    estimatedTime: '3-4 minutes',
    dataSource: ['outbound_campaigns', 'contacts', 'outcomes'],
    exportFormats: ['excel', 'csv', 'pdf']
  },
  {
    id: 'nps-analytics',
    name: 'NPS Campaign Analytics',
    description: 'Net Promoter Score trends and customer feedback analysis',
    category: 'campaign_performance',
    type: 'trend',
    permissions: ['view_nps_analytics'],
    icon: 'UserCheck',
    estimatedTime: '4-5 minutes',
    dataSource: ['nps_campaigns', 'nps_responses', 'customer_feedback'],
    exportFormats: ['excel', 'pdf', 'powerpoint']
  },
  {
    id: 'campaign-roi',
    name: 'Campaign ROI Analysis',
    description: 'Return on investment analysis for all campaigns',
    category: 'campaign_performance',
    type: 'comparison',
    permissions: ['view_campaign_reports', 'view_financial_reports'],
    icon: 'DollarSign',
    estimatedTime: '6-8 minutes',
    dataSource: ['campaigns', 'costs', 'revenue', 'conversions'],
    exportFormats: ['excel', 'pdf']
  },
  
  // Customer Experience Reports
  {
    id: 'csat-trends',
    name: 'Customer Satisfaction Trends',
    description: 'CSAT score trends and customer feedback analysis',
    category: 'customer_experience',
    type: 'trend',
    permissions: ['view_csat_analytics'],
    icon: 'Heart',
    estimatedTime: '3-4 minutes',
    dataSource: ['csat_scores', 'feedback', 'call_outcomes'],
    exportFormats: ['excel', 'pdf', 'csv']
  },
  {
    id: 'customer-journey',
    name: 'Customer Journey Analysis',
    description: 'End-to-end customer interaction mapping',
    category: 'customer_experience',
    type: 'detailed',
    permissions: ['view_analytics'],
    icon: 'MapPin',
    estimatedTime: '5-6 minutes',
    dataSource: ['calls', 'touchpoints', 'outcomes', 'timeline'],
    exportFormats: ['pdf', 'excel']
  },
  {
    id: 'escalation-analysis',
    name: 'Escalation Pattern Analysis',
    description: 'Analysis of call escalations and resolution patterns',
    category: 'customer_experience',
    type: 'drill_down',
    permissions: ['manage_escalations'],
    icon: 'AlertTriangle',
    estimatedTime: '4-5 minutes',
    dataSource: ['escalations', 'resolutions', 'agents', 'call_logs'],
    exportFormats: ['excel', 'csv', 'pdf']
  },
  
  // AI Performance Reports
  {
    id: 'ai-agent-performance',
    name: 'AI Agent Performance',
    description: 'Comprehensive AI agent efficiency and accuracy metrics',
    category: 'ai_performance',
    type: 'detailed',
    permissions: ['manage_ai_agents'],
    icon: 'Activity',
    estimatedTime: '4-5 minutes',
    dataSource: ['ai_agents', 'calls', 'accuracy_scores', 'response_times'],
    exportFormats: ['excel', 'pdf', 'csv']
  },
  {
    id: 'intent-recognition',
    name: 'Intent Recognition Accuracy',
    description: 'Analysis of AI intent recognition performance',
    category: 'ai_performance',
    type: 'comparison',
    permissions: ['manage_ai_agents'],
    icon: 'Target',
    estimatedTime: '3-4 minutes',
    dataSource: ['intents', 'accuracy_scores', 'training_data'],
    exportFormats: ['excel', 'csv']
  },
  {
    id: 'ai-training-insights',
    name: 'AI Training & Optimization',
    description: 'Insights for improving AI model performance',
    category: 'ai_performance',
    type: 'drill_down',
    permissions: ['manage_ai_agents', 'view_analytics'],
    icon: 'Brain',
    estimatedTime: '6-8 minutes',
    dataSource: ['training_data', 'model_performance', 'feedback'],
    exportFormats: ['pdf', 'excel']
  },
  
  // Operational Reports
  {
    id: 'call-volume-trends',
    name: 'Call Volume & Trends',
    description: 'Historical call volume patterns and forecasting',
    category: 'operational',
    type: 'trend',
    permissions: ['view_analytics'],
    icon: 'TrendingUp',
    estimatedTime: '3-4 minutes',
    dataSource: ['calls', 'timestamps', 'channels'],
    exportFormats: ['excel', 'pdf', 'csv']
  },
  {
    id: 'agent-productivity',
    name: 'Agent Productivity Report',
    description: 'Individual and team productivity metrics',
    category: 'operational',
    type: 'detailed',
    permissions: ['view_performance_metrics'],
    icon: 'Users',
    estimatedTime: '4-5 minutes',
    dataSource: ['agents', 'calls', 'handling_times', 'outcomes'],
    exportFormats: ['excel', 'pdf']
  },
  {
    id: 'system-utilization',
    name: 'System Utilization Report',
    description: 'Infrastructure usage and capacity planning',
    category: 'operational',
    type: 'dashboard',
    permissions: ['view_system_metrics'],
    icon: 'Server',
    estimatedTime: '2-3 minutes',
    dataSource: ['system_metrics', 'capacity', 'performance'],
    exportFormats: ['pdf', 'excel']
  },
  
  // QA & Compliance Reports
  {
    id: 'quality-scorecard',
    name: 'Quality Assurance Scorecard',
    description: 'Quality scores and improvement recommendations',
    category: 'qa_compliance',
    type: 'summary',
    permissions: ['quality_scoring'],
    icon: 'CheckCircle',
    estimatedTime: '4-5 minutes',
    dataSource: ['qa_scores', 'transcripts', 'feedback'],
    exportFormats: ['excel', 'pdf']
  },
  {
    id: 'compliance-audit',
    name: 'Compliance Audit Report',
    description: 'Regulatory compliance tracking and violations',
    category: 'qa_compliance',
    type: 'detailed',
    permissions: ['view_compliance_reports'],
    icon: 'Shield',
    estimatedTime: '5-7 minutes',
    dataSource: ['compliance_checks', 'violations', 'remediation'],
    exportFormats: ['pdf', 'excel']
  },
  
  // Financial Reports
  {
    id: 'cost-analysis',
    name: 'Operational Cost Analysis',
    description: 'Breakdown of operational costs and optimization opportunities',
    category: 'financial',
    type: 'detailed',
    permissions: ['view_financial_reports'],
    icon: 'DollarSign',
    estimatedTime: '5-6 minutes',
    dataSource: ['costs', 'resources', 'campaigns', 'efficiency'],
    exportFormats: ['excel', 'pdf']
  },
  {
    id: 'revenue-impact',
    name: 'Revenue Impact Report',
    description: 'Revenue attribution and impact analysis',
    category: 'financial',
    type: 'comparison',
    permissions: ['view_financial_reports'],
    icon: 'TrendingUp',
    estimatedTime: '6-8 minutes',
    dataSource: ['revenue', 'campaigns', 'conversions', 'attribution'],
    exportFormats: ['excel', 'pdf', 'powerpoint']
  },
  
  // Technical Reports
  {
    id: 'system-performance',
    name: 'System Performance Report',
    description: 'Technical performance metrics and health status',
    category: 'technical',
    type: 'dashboard',
    permissions: ['view_system_metrics'],
    icon: 'Monitor',
    estimatedTime: '3-4 minutes',
    dataSource: ['system_logs', 'performance_metrics', 'uptime'],
    exportFormats: ['pdf', 'excel']
  },
  {
    id: 'integration-status',
    name: 'Integration Health Report',
    description: 'Status and performance of external integrations',
    category: 'technical',
    type: 'summary',
    permissions: ['manage_settings'],
    icon: 'Zap',
    estimatedTime: '2-3 minutes',
    dataSource: ['integrations', 'api_calls', 'errors', 'latency'],
    exportFormats: ['pdf', 'csv']
  }
];

export const reportCategories = [
  { id: 'executive', name: 'Executive Reports', icon: 'Crown' },
  { id: 'campaign_performance', name: 'Campaign Performance', icon: 'Target' },
  { id: 'customer_experience', name: 'Customer Experience', icon: 'Heart' },
  { id: 'ai_performance', name: 'AI Performance', icon: 'Activity' },
  { id: 'operational', name: 'Operational', icon: 'Settings' },
  { id: 'qa_compliance', name: 'QA & Compliance', icon: 'Shield' },
  { id: 'financial', name: 'Financial', icon: 'DollarSign' },
  { id: 'technical', name: 'Technical', icon: 'Monitor' },
  { id: 'custom', name: 'Custom Reports', icon: 'Plus' }
];
