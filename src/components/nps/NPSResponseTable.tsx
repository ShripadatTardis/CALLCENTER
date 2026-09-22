
import React from 'react';
import { Button } from '@/components/ui/button';
import { NPSBadge } from './NPSBadge';
import { format } from 'date-fns';

interface NPSResponseTableProps {
  responses: any[];
  campaignChannel: string;
  onTranscriptClick: (response: any) => void;
  onRecordingClick: (response: any) => void;
}

export const NPSResponseTable: React.FC<NPSResponseTableProps> = ({
  responses,
  campaignChannel,
  onTranscriptClick,
  onRecordingClick
}) => {
  const handleTranscriptClick = (e: React.MouseEvent, response: any) => {
    console.log('NPSResponseTable: Transcript button clicked for response:', response.id);
    e.preventDefault();
    e.stopPropagation();
    onTranscriptClick(response);
  };

  const handleRecordingClick = (e: React.MouseEvent, response: any) => {
    console.log('NPSResponseTable: Recording button clicked for response:', response.id);
    e.preventDefault();
    e.stopPropagation();
    onRecordingClick(response);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-3 px-4 font-medium text-slate-700">Name</th>
            <th className="text-left py-3 px-4 font-medium text-slate-700">Mobile</th>
            <th className="text-left py-3 px-4 font-medium text-slate-700">NPS Score</th>
            <th className="text-left py-3 px-4 font-medium text-slate-700">Response Time</th>
            <th className="text-left py-3 px-4 font-medium text-slate-700">Duration</th>
            <th className="text-center py-3 px-4 font-medium text-slate-700">Actions</th>
          </tr>
        </thead>
        <tbody>
          {responses.slice(0, 10).map((response) => (
            <tr key={response.id} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="py-3 px-4 text-slate-700">{response.name}</td>
              <td className="py-3 px-4 text-slate-600">{response.mobileNumber}</td>
              <td className="py-3 px-4">
                <NPSBadge score={response.npsScore} variant="compact" />
              </td>
              <td className="py-3 px-4 text-slate-600">
                {format(response.responseTimestamp, 'MMM dd, HH:mm')}
              </td>
              <td className="py-3 px-4 text-slate-600">
                {response.callDuration}s
              </td>
              <td className="py-3 px-4 text-center">
                <div className="flex justify-center space-x-1">
                  {campaignChannel === 'voice' && (
                    <>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-xs"
                        onClick={(e) => handleTranscriptClick(e, response)}
                        type="button"
                      >
                        Transcript
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-xs"
                        onClick={(e) => handleRecordingClick(e, response)}
                        type="button"
                      >
                        Recording
                      </Button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
