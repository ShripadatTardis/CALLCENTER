import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NPSBadge } from './NPSBadge';
import { format } from 'date-fns';
import { Download, Phone, Clock, User } from 'lucide-react';

interface NPSTranscriptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  response: any;
}

export const NPSTranscriptDialog: React.FC<NPSTranscriptDialogProps> = ({
  open,
  onOpenChange,
  response
}) => {
  console.log('NPSTranscriptDialog render - open:', open, 'response:', response);

  if (!response) {
    console.log('NPSTranscriptDialog: No response provided, returning null');
    return null;
  }

  const handleDownload = () => {
    const content = `NPS Survey Transcript
Campaign: ${response.campaignId}
Participant: ${response.name}
Phone: ${response.mobileNumber}
NPS Score: ${response.npsScore}
Date: ${format(response.responseTimestamp, 'PPpp')}
Duration: ${response.callDuration}s

Transcript:
Agent: Hello ${response.name}, thank you for taking time to participate in our Net Promoter Score survey. On a scale of 0 to 10, how likely are you to recommend our bank to a friend or colleague?

Customer: I would rate it a ${response.npsScore}.

Agent: Thank you for that rating. Could you please tell us what influenced your decision to give us that score?

Customer: ${response.feedback}

Agent: Thank you for your valuable feedback. This helps us improve our services. Have a great day!

Customer: Thank you, goodbye.

--- End of Transcript ---`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nps-transcript-${response.name}-${format(response.responseTimestamp, 'yyyy-MM-dd')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Phone className="h-5 w-5" />
              <span>NPS Survey Transcript</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Call Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Survey Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-slate-500" />
                  <span className="font-medium">Participant:</span>
                  <span>{response.name}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Phone className="h-4 w-4 text-slate-500" />
                  <span className="font-medium">Phone:</span>
                  <span>{response.mobileNumber}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-slate-500" />
                  <span className="font-medium">Duration:</span>
                  <span>{response.callDuration} seconds</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="font-medium">NPS Score:</span>
                  <NPSBadge score={response.npsScore} variant="compact" />
                </div>
                <div className="flex items-center space-x-2">
                  <span className="font-medium">Date:</span>
                  <span>{format(response.responseTimestamp, 'PPp')}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="font-medium">Status:</span>
                  <Badge variant={response.escalated ? 'destructive' : 'default'}>
                    {response.escalated ? 'Escalated' : 'Completed'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Transcript */}
          <Card>
            <CardHeader>
              <CardTitle>Conversation Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-xs font-medium text-blue-600">AI</span>
                  </div>
                  <div className="flex-1">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-sm">
                        Hello {response.name}, thank you for taking time to participate in our Net Promoter Score survey. On a scale of 0 to 10, how likely are you to recommend our bank to a friend or colleague?
                      </p>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {format(response.responseTimestamp, 'HH:mm:ss')}
                    </div>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                    <User className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-sm">
                        I would rate it a {response.npsScore}.
                      </p>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {format(new Date(response.responseTimestamp.getTime() + 15000), 'HH:mm:ss')}
                    </div>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-xs font-medium text-blue-600">AI</span>
                  </div>
                  <div className="flex-1">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-sm">
                        Thank you for that rating. Could you please tell us what influenced your decision to give us that score?
                      </p>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {format(new Date(response.responseTimestamp.getTime() + 25000), 'HH:mm:ss')}
                    </div>
                  </div>
                </div>

                {response.feedback && (
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                      <User className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <div className="bg-green-50 rounded-lg p-3">
                        <p className="text-sm">{response.feedback}</p>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {format(new Date(response.responseTimestamp.getTime() + 45000), 'HH:mm:ss')}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-xs font-medium text-blue-600">AI</span>
                  </div>
                  <div className="flex-1">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-sm">
                        Thank you for your valuable feedback. This helps us improve our services. Have a great day!
                      </p>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {format(new Date(response.responseTimestamp.getTime() + 65000), 'HH:mm:ss')}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Summary */}
          <Card>
            <CardHeader>
              <CardTitle>AI Analysis Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <span className="font-medium text-sm">Sentiment Analysis:</span>
                  <Badge className="ml-2" variant={response.npsScore >= 9 ? 'default' : response.npsScore >= 7 ? 'secondary' : 'destructive'}>
                    {response.npsScore >= 9 ? 'Positive' : response.npsScore >= 7 ? 'Neutral' : 'Negative'}
                  </Badge>
                </div>
                <div>
                  <span className="font-medium text-sm">Key Themes:</span>
                  <div className="mt-1 text-sm text-slate-600">
                    {response.npsScore >= 9 
                      ? "Customer expressed high satisfaction with service quality and professionalism."
                      : response.npsScore >= 7 
                      ? "Customer found the service adequate but suggested areas for improvement."
                      : "Customer highlighted specific pain points requiring immediate attention."
                    }
                  </div>
                </div>
                <div>
                  <span className="font-medium text-sm">Follow-up Required:</span>
                  <span className="ml-2 text-sm">
                    {response.escalated ? "Yes - Escalated to management" : "No - Standard follow-up"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};
