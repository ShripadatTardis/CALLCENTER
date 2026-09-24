
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
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Initiate Call</h1>
          <p className="text-muted-foreground">
            Start a new voice AI call with customized settings
          </p>
        </div>

        {triggerError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Call Configuration</CardTitle>
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

          <Card>
            <CardHeader>
              <CardTitle>Recent Calls</CardTitle>
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
