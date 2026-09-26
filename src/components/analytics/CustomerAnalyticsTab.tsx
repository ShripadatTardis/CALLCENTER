import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useCustomerAnalytics } from '@/hooks/analytics/useCustomerAnalytics';
import { MetricSourceCaption } from './MetricSourceCaption';
import { AnalyticsExportButton } from './AnalyticsExportButton';

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

/**
 * Session 7 §12 — intentionally small. Reuses the authorized Customer
 * 360 list unchanged; no demographic/marketing analytics, no CRM
 * dashboard. Customer 360 itself remains the operational detail view.
 */
export const CustomerAnalyticsTab: React.FC = () => {
  const { isLoading, summary } = useCustomerAnalytics();

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground my-8 mx-auto" />;
  if (!summary) return <p className="text-sm text-muted-foreground py-8 text-center">No data available.</p>;

  const truncated = summary.sampleSize < summary.totalCount;

  const exportRows = [
    { metric: 'Unique Customers (authorized)', value: summary.totalCount },
    { metric: 'Customers with >1 Interaction', value: summary.customersWithMultipleInteractions },
    { metric: 'Escalated Customers', value: summary.escalatedCustomers },
    { metric: 'Inbound Interactions', value: summary.inboundCount },
    { metric: 'Outbound Interactions', value: summary.outboundCount },
    { metric: 'Voice Channel Customers', value: summary.voiceCount },
    { metric: 'Chat Channel Customers', value: summary.chatCount },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AnalyticsExportButton rows={exportRows} headers={['metric', 'value']} filename="customer-summary.csv" label="Export Customer Summary CSV" />
      </div>
      {truncated && (
        <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Showing figures derived from the first {summary.sampleSize} of {summary.totalCount} authorized customers.
        </p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Tile label="Unique Customers (authorized)" value={String(summary.totalCount)} />
        <Tile label="Customers with >1 Interaction" value={String(summary.customersWithMultipleInteractions)} />
        <Tile label="Escalated Customers" value={String(summary.escalatedCustomers)} />
        <Tile label="Inbound Interactions" value={String(summary.inboundCount)} />
        <Tile label="Outbound Interactions" value={String(summary.outboundCount)} />
        <Tile label="Voice / Chat Channel Mix" value={`${summary.voiceCount} / ${summary.chatCount}`} />
      </div>
      <MetricSourceCaption
        origin="server-aggregate"
        source="call_center_list_customers (authorized aggregate, Session 4/5.2) — reshaped client-side, no new authorization logic"
      />
    </div>
  );
};
