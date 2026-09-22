
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface CampaignFiltersProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectedCampaignType: string;
  setSelectedCampaignType: (type: string) => void;
  selectedStatus: string;
  setSelectedStatus: (status: string) => void;
}

export const CampaignFilters: React.FC<CampaignFiltersProps> = ({
  searchTerm,
  setSearchTerm,
  selectedCampaignType,
  setSelectedCampaignType,
  selectedStatus,
  setSelectedStatus
}) => {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
            <Input
              placeholder="Search campaigns..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            value={selectedCampaignType}
            onChange={(e) => setSelectedCampaignType(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="all">All Types</option>
            <option value="loan_emi_reminder">EMI Reminder</option>
            <option value="overdue_loan_followup">Overdue Follow-up</option>
            <option value="document_reminder">Document Reminder</option>
            <option value="cross_sell">Cross-sell</option>
            <option value="welcome_call">Welcome Call</option>
          </select>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="paused">Paused</option>
          </select>
        </div>
      </CardContent>
    </Card>
  );
};
