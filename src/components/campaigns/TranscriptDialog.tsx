
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, User, Bot } from 'lucide-react';
import { useIndustry } from '@/contexts/IndustryContext';
import { getIndustrySpecificTranscript } from '@/utils/industryTranscriptGenerator';

interface TranscriptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: {
    name: string;
    mobileNumber: string;
    callTimestamp?: Date;
    callDuration?: number;
    transcriptId?: string;
    aiSummary?: string;
  } | null;
}

export const TranscriptDialog: React.FC<TranscriptDialogProps> = ({ open, onOpenChange, contact }) => {
  const { selectedIndustry } = useIndustry();

  if (!contact) return null;

  // Get industry-specific transcript
  const transcript = getIndustrySpecificTranscript(selectedIndustry, contact.name);

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Call Transcript</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Call Details */}
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <span className="font-medium">Customer:</span>
                  <div className="text-sm text-muted-foreground">{contact.name}</div>
                </div>
                <div>
                  <span className="font-medium">Phone:</span>
                  <div className="text-sm text-muted-foreground">{contact.mobileNumber}</div>
                </div>
                <div>
                  <span className="font-medium">Time:</span>
                  <div className="text-sm text-muted-foreground">
                    {contact.callTimestamp ? new Intl.DateTimeFormat('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }).format(contact.callTimestamp) : 'N/A'}
                  </div>
                </div>
                <div>
                  <span className="font-medium">Duration:</span>
                  <div className="text-sm text-muted-foreground">
                    {contact.callDuration ? formatDuration(contact.callDuration) : 'N/A'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Summary */}
          {contact.aiSummary && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-start space-x-2">
                  <Bot className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div>
                    <div className="font-medium mb-2">AI Summary</div>
                    <div className="text-sm text-muted-foreground">{contact.aiSummary}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Transcript */}
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-4">
                <div className="font-medium mb-4">Call Transcript</div>
                {transcript.map((entry, index) => (
                  <div key={index} className="flex space-x-3">
                    <div className="flex items-center space-x-2 min-w-0 flex-shrink-0">
                      {entry.speaker === 'AI' ? (
                        <Bot className="h-4 w-4 text-blue-500" />
                      ) : (
                        <User className="h-4 w-4 text-green-500" />
                      )}
                      <Badge variant="outline" className="text-xs">
                        {entry.speaker}
                      </Badge>
                      <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{entry.time}</span>
                      </div>
                    </div>
                    <div className="flex-1 text-sm">
                      {entry.message}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};
