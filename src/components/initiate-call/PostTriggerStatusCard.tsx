
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, RefreshCw, X } from 'lucide-react';
import { formatStatusLabel } from '@/lib/format';
import type { LastTriggeredCall } from '@/hooks/useInitiateCall';

interface PostTriggerStatusCardProps {
  call: LastTriggeredCall;
  liveStatus?: string;
  isPolling?: boolean;
  isPollCapped?: boolean;
  onRefresh: () => void;
  onDismiss: () => void;
}

/**
 * Session 3.5 §3: closes the Session 2 gap where the post-trigger
 * polling infrastructure existed but was never consumed by the
 * Initiate Call UI. Shows destination/agent/interaction ID immediately
 * from the trigger response, then the polled live status. The 60s cap
 * is a UI safety cap only — it never implies the call failed or
 * completed, and manual refresh keeps working after it.
 */
export const PostTriggerStatusCard: React.FC<PostTriggerStatusCardProps> = ({
  call,
  liveStatus,
  isPolling,
  isPollCapped,
  onRefresh,
  onDismiss,
}) => {
  const displayStatus = liveStatus ?? call.initialStatus;

  return (
    <Card className="border-green-200 bg-green-50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-green-900">
            <CheckCircle2 className="h-5 w-5" />
            Call Initiated
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onDismiss} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-muted-foreground">Destination:</span> {call.phoneNumber}
          </div>
          <div>
            <span className="text-muted-foreground">Agent:</span> {call.agentDisplayName}
          </div>
          <div className="col-span-2">
            <span className="text-muted-foreground">Interaction ID:</span>{' '}
            <span className="font-mono text-xs">{call.interactionId}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="text-muted-foreground">Status:</span>
          <Badge variant={displayStatus === 'completed' ? 'default' : 'secondary'}>
            {formatStatusLabel(displayStatus)}
          </Badge>
          {isPolling && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <Button variant="ghost" size="sm" onClick={onRefresh} className="h-7 px-2 ml-auto">
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
        </div>
        {isPollCapped && (
          <p className="text-xs text-amber-700">
            This call is still active. Live updates have paused after 60s to avoid excessive
            polling — use Refresh to check the latest status.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
