
export interface Report {
  id: string;
  name: string;
  description: string;
  category: ReportCategory;
  type: ReportType;
  permissions: string[];
  icon: string;
  lastGenerated?: Date;
  schedule?: ReportSchedule;
  isFavorite?: boolean;
  estimatedTime: string;
  dataSource: string[];
  exportFormats: ExportFormat[];
}

export type ReportCategory = 
  | 'executive'
  | 'campaign_performance'
  | 'customer_experience'
  | 'ai_performance'
  | 'operational'
  | 'qa_compliance'
  | 'financial'
  | 'technical'
  | 'custom';

export type ReportType = 
  | 'dashboard'
  | 'detailed'
  | 'summary'
  | 'trend'
  | 'comparison'
  | 'drill_down';

export type ExportFormat = 'pdf' | 'excel' | 'csv' | 'powerpoint';

export interface ReportSchedule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  time: string;
  recipients: string[];
  enabled: boolean;
}

export interface ReportFilter {
  dateRange?: {
    start: Date;
    end: Date;
  };
  campaigns?: string[];
  agents?: string[];
  channels?: string[];
  departments?: string[];
}
