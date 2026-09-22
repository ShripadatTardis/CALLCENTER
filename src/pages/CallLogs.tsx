
import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { AdvancedFilters } from '@/components/call-logs/AdvancedFilters';
import { TranscriptViewer } from '@/components/call-logs/TranscriptViewer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, FileText, TrendingUp, Clock, Target, Users } from 'lucide-react';
import { useIndustryData, useIndustryTerminology } from '@/hooks/useIndustryData';
import { useIndustry } from '@/contexts/IndustryContext';
import { getIndustrySpecificTranscript } from '@/utils/industryTranscriptGenerator';

const CallLogs: React.FC = () => {
  const { callLogs } = useIndustryData();
  const { getTerminology } = useIndustryTerminology();
  const { selectedIndustry } = useIndustry();
  const [selectedCall, setSelectedCall] = useState(null);
  const [showTranscript, setShowTranscript] = useState(false);

  const handleViewTranscript = (call: any) => {
    setSelectedCall(call);
    setShowTranscript(true);
  };

  const handleFiltersChange = (filters: any) => {
    console.log('Filters changed:', filters);
  };

  const handleExport = () => {
    console.log('Exporting call logs...');
  };

  // Convert industry call logs to extended format for display
  const extendedCallLogs = callLogs.map(call => {
    // Generate industry-specific transcript based on selected industry and customer name
    const industryTranscript = getIndustrySpecificTranscript(selectedIndustry, call.customerName);
    
    // Convert industry transcript format to the format expected by TranscriptViewer
    const detailedTranscript = industryTranscript.map((entry, index) => ({
      timestamp: entry.time,
      speaker: entry.speaker.toLowerCase() === 'ai' ? 'ai' : 'customer',
      text: entry.message,
      sentiment: index % 3 === 0 ? 'positive' : index % 3 === 1 ? 'neutral' : 'negative',
      confidence: Math.random() * 0.3 + 0.7 // Random between 0.7-1.0
    }));

    return {
      id: call.id || Math.random().toString(),
      callId: `call_${Math.random().toString().slice(2, 8)}`,
      callerName: call.customerName,
      callerNumber: call.phoneNumber,
      outcome: call.status === 'completed' ? 'resolved' : call.status === 'escalated' ? 'escalated' : 'in_progress',
      fcr: call.status === 'completed',
      aht: call.duration,
      intentAccuracy: Math.random() * 0.3 + 0.7, // Random between 0.7-1.0
      transcript: `${getTerminology('customer')}: ${call.intent} inquiry.\nAI Agent: I'll help you with your ${call.intent} request.`,
      tags: [call.intent, call.campaignName],
      detailedTranscript
    };
  });

  // Calculate statistics from industry call logs
  const totalCalls = extendedCallLogs.length;
  const resolvedCalls = extendedCallLogs.filter(call => call.outcome === 'resolved').length;
  const escalatedCalls = extendedCallLogs.filter(call => call.outcome === 'escalated').length;
  const fcrCalls = extendedCallLogs.filter(call => call.fcr).length;
  
  const fcrRate = ((fcrCalls / totalCalls) * 100).toFixed(1);
  const escalationRate = ((escalatedCalls / totalCalls) * 100).toFixed(1);
  const avgAht = Math.round(extendedCallLogs.reduce((sum, call) => sum + call.aht, 0) / totalCalls);
  const avgIntentAccuracy = (extendedCallLogs.reduce((sum, call) => sum + call.intentAccuracy, 0) / totalCalls * 100).toFixed(1);

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Call Logs & Recordings</h1>
          <p className="text-muted-foreground">
            Complete audit trail of all AI {getTerminology('interactions')}
          </p>
        </div>

        {/* Summary Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">First Call Resolution</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{fcrRate}%</div>
              <p className="text-xs text-muted-foreground">
                {fcrCalls} of {totalCalls} calls resolved
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Handle Time</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Math.floor(avgAht / 60)}m {avgAht % 60}s</div>
              <p className="text-xs text-muted-foreground">
                Across all calls
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Intent Accuracy</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgIntentAccuracy}%</div>
              <p className="text-xs text-muted-foreground">
                AI understanding rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Escalation Rate</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{escalationRate}%</div>
              <p className="text-xs text-muted-foreground">
                {escalatedCalls} calls escalated
              </p>
            </CardContent>
          </Card>
        </div>

        <AdvancedFilters onFiltersChange={handleFiltersChange} onExport={handleExport} />

        {/* Call Logs Cards */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Call History ({totalCalls} calls)</h2>
          </div>
          
          <div className="space-y-3">
            {extendedCallLogs.map((call) => (
              <Card key={call.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="font-semibold text-lg">
                        {call.callerName} - {call.tags[0] || 'General'}
                      </h3>
                      <Badge variant={call.outcome === 'resolved' ? 'default' : 
                                   call.outcome === 'escalated' ? 'destructive' : 'secondary'}>
                        {call.outcome.replace('_', ' ')}
                      </Badge>
                    </div>
                    
                    <div className="text-sm text-muted-foreground mb-2">
                      {call.callId} • {call.callerNumber} • {Math.floor(call.aht / 60)}m {call.aht % 60}s
                    </div>
                    
                    <p className="text-sm mb-3 text-gray-700">
                      {call.transcript}
                    </p>
                    
                    <div className="flex flex-wrap gap-1">
                      {call.tags.map((tag, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end space-y-2 ml-4">
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm">
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleViewTranscript(call)}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="text-right text-xs text-muted-foreground">
                      <div className="flex items-center space-x-1 mb-1">
                        <span>FCR:</span>
                        <span className={call.fcr ? 'text-green-600' : 'text-red-600'}>
                          {call.fcr ? 'Yes' : 'No'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span>Intent:</span>
                        <span className="font-medium">{(call.intentAccuracy * 100).toFixed(0)}%</span>
                        <div className={`w-2 h-2 rounded-full ${
                          call.intentAccuracy >= 0.9 ? 'bg-green-500' :
                          call.intentAccuracy >= 0.8 ? 'bg-yellow-500' : 'bg-red-500'
                        }`} />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <TranscriptViewer
          isOpen={showTranscript}
          onClose={() => setShowTranscript(false)}
          callId={selectedCall?.callId || ''}
          transcript={selectedCall?.detailedTranscript || []}
          duration={selectedCall?.aht || 0}
        />
      </div>
    </Layout>
  );
};

export default CallLogs;
