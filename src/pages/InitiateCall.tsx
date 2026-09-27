
import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { CallConfigurationForm } from '@/components/initiate-call/CallConfigurationForm';
import { CallHistoryList } from '@/components/initiate-call/CallHistoryList';
import { PostTriggerStatusCard } from '@/components/initiate-call/PostTriggerStatusCard';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useInitiateCall } from '@/hooks/useInitiateCall';

const InitiateCall: React.FC = () => {
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
