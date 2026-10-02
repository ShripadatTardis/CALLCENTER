
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { CallConfigurationForm } from '@/components/initiate-call/CallConfigurationForm';
import { CallHistoryList } from '@/components/initiate-call/CallHistoryList';
import { PostTriggerStatusCard } from '@/components/initiate-call/PostTriggerStatusCard';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useInitiateCall } from '@/hooks/useInitiateCall';
import { useAuth } from '@/contexts/AuthContext';
import { fetchCallData } from '@/services/calls/callsService';
import { InteractionDetailDialog } from '@/components/call-logs/InteractionDetailDialog';

const MAX_LOOKUP_PAGES = 3;
const LOOKUP_PAGE_SIZE = 100;

/**
 * Session 13.1 (DEC-CUST-03 / LIVE-02) — the same proven
 * call_sid-equals-call_id correlation already used by CustomerDetail.tsx
 * and CampaignDetail.tsx for exactly this problem: /call-data has no
 * call_id-keyed lookup param, only `search` (phone/caller name), so a
 * single call is found by searching the authoritative phone number just
 * dialed and filtering the bounded, paged results down to the exact
 * call_sid returned by Trigger Call. No new correlation mechanism, and
 * no guess by time — the id itself is the real, returned call_sid.
 */
async function findCallBySidAndPhone(phone: string, callSid: string, role: string) {
  for (let page = 1; page <= MAX_LOOKUP_PAGES; page += 1) {
    const result = await fetchCallData({ search: phone, page, page_size: LOOKUP_PAGE_SIZE }, role);
    const match = result.interactions.find((i) => i.interactionId === callSid);
    if (match) return match;
    if (page >= result.pagination.total_pages) break;
  }
  return null;
}

const CallDetailLookupDialog: React.FC<{ callSid: string; phone: string; onClose: () => void }> = ({ callSid, phone, onClose }) => {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';
  const { data: interaction, isLoading, isError } = useQuery({
    queryKey: ['initiate-call', 'call-detail-lookup', callSid, phone, role],
    queryFn: () => findCallBySidAndPhone(phone, callSid, role),
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="bg-card rounded-lg p-6 flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading call…
        </div>
      </div>
    );
  }

  if (isError || !interaction) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
        <div className="bg-card rounded-lg p-6 max-w-sm text-sm text-muted-foreground" onClick={(e) => e.stopPropagation()}>
          This call hasn't been recorded in Call Data yet — it may still be in progress, or Call Data hasn't
          materialized it. Try again shortly.
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      </div>
    );
  }

  return <InteractionDetailDialog isOpen onClose={onClose} interaction={interaction} />;
};

const InitiateCall: React.FC = () => {
  const [viewingCallDetail, setViewingCallDetail] = useState(false);
  const {
    config,
    isLoading,
    callHistory,
    isCallHistoryLoading,
    callHistoryError,
    refetchCallHistory,
    updatePhoneNumber,
    updateSelectedAgent,
    initiateCall,
    isInitiateCallDisabled,
    lastTriggeredCall,
    dismissLastTriggeredCall,
    triggerError,
    postTriggerStatus,
    isPostTriggerPollCapped,
    isPostTriggerPolling,
    refetchPostTriggerStatus,
  } = useInitiateCall();

  return (
    <Layout>
      <div className="bg-background min-h-full text-foreground p-4 space-y-3">
        {triggerError && (
          <div className="rounded-md border border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            Call could not be initiated: {triggerError}
          </div>
        )}

        {lastTriggeredCall && (
          <PostTriggerStatusCard
            call={lastTriggeredCall}
            liveStatus={postTriggerStatus}
            isPolling={isPostTriggerPolling}
            isPollCapped={isPostTriggerPollCapped}
            onRefresh={() => refetchPostTriggerStatus()}
            onDismiss={dismissLastTriggeredCall}
            onViewCallDetail={() => setViewingCallDetail(true)}
          />
        )}

        {viewingCallDetail && lastTriggeredCall && (
          <CallDetailLookupDialog
            callSid={lastTriggeredCall.interactionId}
            phone={lastTriggeredCall.phoneNumber}
            onClose={() => setViewingCallDetail(false)}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card className="bg-card border-border">
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-semibold text-foreground">Call Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <CallConfigurationForm
                config={config}
                onPhoneNumberChange={updatePhoneNumber}
                onAgentChange={updateSelectedAgent}
                onInitiateCall={initiateCall}
                isLoading={isLoading}
                isDisabled={isInitiateCallDisabled}
              />
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-semibold text-foreground">Recent Calls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {callHistoryError && (
                <QueryErrorBanner
                  error={callHistoryError}
                  onRetry={() => refetchCallHistory()}
                  hasStaleData={callHistory.length > 0}
                />
              )}
              <CallHistoryList callHistory={callHistory} isLoading={isCallHistoryLoading} />
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default InitiateCall;
