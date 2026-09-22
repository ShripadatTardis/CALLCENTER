
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Phone, User, History } from 'lucide-react';
import { InitiatedCall } from '@/types/initiateCall';

interface CallHistoryListProps {
  callHistory: InitiatedCall[];
}

export const CallHistoryList: React.FC<CallHistoryListProps> = ({ callHistory }) => {
  const formatTimestamp = (timestamp: Date) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <Card className="w-full bg-white shadow-lg border border-gray-200 min-h-[200px] max-h-[600px] flex flex-col">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <History className="h-5 w-5 text-blue-600" />
          Call History ({callHistory.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 flex-1 flex flex-col overflow-hidden">
        {callHistory.length === 0 ? (
          <div className="text-center py-8 flex-1 flex flex-col justify-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Phone className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm">No calls initiated yet</p>
            <p className="text-gray-400 text-xs mt-1">Your recent calls will appear here</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {callHistory.map((call) => (
              <div
                key={call.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <Phone className="w-4 h-4 text-blue-600" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-medium text-gray-900 truncate">
                        {call.phoneNumber}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {call.status}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <div className="flex items-center space-x-1">
                        <User className="w-3 h-3" />
                        <span className="truncate">{call.agentName}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatTimestamp(call.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
