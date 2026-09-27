
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Phone, User, History, Loader2 } from 'lucide-react';
import { Interaction } from '@/types/interaction';
import { formatTimestamp, formatStatusLabel, formatPhoneNumber } from '@/lib/format';

interface CallHistoryListProps {
  callHistory: Interaction[];
  isLoading?: boolean;
}

export const CallHistoryList: React.FC<CallHistoryListProps> = ({ callHistory, isLoading }) => {
  return (
    <Card className="w-full bg-card border-border min-h-[200px] max-h-[600px] flex flex-col">
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          Recent Calls ({callHistory.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 flex-1 flex flex-col overflow-hidden">
        {isLoading ? (
          <div className="text-center py-8 flex-1 flex flex-col items-center justify-center">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        ) : callHistory.length === 0 ? (
          <div className="text-center py-8 flex-1 flex flex-col justify-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Phone className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">No calls yet</p>
            <p className="text-muted-foreground text-xs mt-1">Calls you initiate will appear here</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {callHistory.map((call) => (
              <div
                key={call.interactionId}
                className="flex items-center justify-between p-2.5 bg-muted/50 rounded-md border border-border hover:bg-muted transition-colors"
              >
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    <div className="w-7 h-7 bg-primary/10 rounded-full flex items-center justify-center">
                      <Phone className="w-3.5 h-3.5 text-primary" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-medium text-foreground truncate">
                        {formatPhoneNumber(call.phoneNumber)}
                      </span>
                      <Badge variant="secondary" className="text-xs whitespace-nowrap">
                        {formatStatusLabel(call.status)}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <div className="flex items-center space-x-1">
                        <User className="w-3 h-3" />
                        <span className="truncate">{call.agentDisplayName ?? call.agentId ?? 'Unknown agent'}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatTimestamp(call.startTime)}</span>
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
