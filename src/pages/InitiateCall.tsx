
import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { CallConfigurationForm } from '@/components/initiate-call/CallConfigurationForm';
import { CallHistoryList } from '@/components/initiate-call/CallHistoryList';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useInitiateCall } from '@/hooks/useInitiateCall';

const InitiateCall: React.FC = () => {
  const {
    config,
    isLoading,
    callHistory,
    isCallHistoryLoading,
    updatePhoneNumber,
    updateSelectedAgent,
    initiateCall,
    isInitiateCallDisabled
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
            <CardContent>
              <CallHistoryList callHistory={callHistory} isLoading={isCallHistoryLoading} />
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default InitiateCall;
