import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AnalyticsTimeWindowControl } from '@/components/analytics/AnalyticsTimeWindowControl';
import { AnalyticsOverviewTab } from '@/components/analytics/AnalyticsOverviewTab';
import { VoiceAnalyticsTab } from '@/components/analytics/VoiceAnalyticsTab';
import { ChatAnalyticsTab } from '@/components/analytics/ChatAnalyticsTab';
import { CampaignAnalyticsTab } from '@/components/analytics/CampaignAnalyticsTab';
import { CustomerAnalyticsTab } from '@/components/analytics/CustomerAnalyticsTab';
import type { AnalyticsMetricsQueryDto } from '@/types/api/analytics';

/**
 * Session 7 — real Analytics/Reports, rebuilt entirely on confirmed data
 * sources. Replaces the prior 100%-mock implementation (useIndustryData,
 * Math.random(), hardcoded trend labels, fabricated Customer
 * Satisfaction/Second Call Resolution/AI Learning content — see
 * docs/CALL_CENTRE_SESSION7_ANALYTICS_REPORTS_PLAN.md §1/§2 for the
 * full prior-state audit).
 *
 * Authorization (plan §16, revised for Session 6.2): GET
 * /analytics/metrics has no agent_id/category_id/domain filter, so its
 * aggregates are GLOBAL. Each tab that touches it
 * (Overview/Voice) branches on the current role's classification
 * (useClassification().allCategories) and only shows the global
 * aggregate to all-access roles — a scoped role gets metrics derived
 * from its own authorized call-data/chat-sessions sample instead, never
 * the global figures. See useVoiceAnalytics/useChatAnalytics and
 * src/services/analytics/scopedAnalyticsAggregator.ts.
 *
 * One sidebar item ("Analytics"), tabs for Overview/Voice/Chat/
 * Campaigns/Customers — no separate "Reports" page; export lives inside
 * each tab. Session 7.1 (smart search, faceted filtering, collapsible
 * panels) is explicitly out of scope here.
 */
const Analytics: React.FC = () => {
  const [query, setQuery] = useState<AnalyticsMetricsQueryDto>({ window: '24h' });

  return (
    <Layout>
      <div className="bg-background min-h-full text-foreground p-4 space-y-3">
        <AnalyticsTimeWindowControl query={query} onChange={setQuery} />

        <Tabs defaultValue="overview">
          <TabsList className="bg-card border border-border h-9">
            <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-muted data-[state=active]:text-foreground">Overview</TabsTrigger>
            <TabsTrigger value="voice" className="text-xs data-[state=active]:bg-muted data-[state=active]:text-foreground">Voice</TabsTrigger>
            <TabsTrigger value="chat" className="text-xs data-[state=active]:bg-muted data-[state=active]:text-foreground">Chat</TabsTrigger>
            <TabsTrigger value="campaigns" className="text-xs data-[state=active]:bg-muted data-[state=active]:text-foreground">Campaigns</TabsTrigger>
            <TabsTrigger value="customers" className="text-xs data-[state=active]:bg-muted data-[state=active]:text-foreground">Customers</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-3">
            <AnalyticsOverviewTab query={query} />
          </TabsContent>
          <TabsContent value="voice" className="mt-4">
            <VoiceAnalyticsTab query={query} />
          </TabsContent>
          <TabsContent value="chat" className="mt-4">
            <ChatAnalyticsTab />
          </TabsContent>
          <TabsContent value="campaigns" className="mt-4">
            <CampaignAnalyticsTab />
          </TabsContent>
          <TabsContent value="customers" className="mt-4">
            <CustomerAnalyticsTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Analytics;
