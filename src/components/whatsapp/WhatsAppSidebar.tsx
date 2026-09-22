
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Phone, Info } from 'lucide-react';

export const WhatsAppSidebar: React.FC = () => {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            WhatsApp Sandbox
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Sandbox Number:</p>
              <p className="text-lg font-mono bg-gray-100 p-2 rounded">+1 415 523 8886</p>
            </div>
            <div className="bg-blue-50 p-3 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Setup Instructions:</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Send "join <code>nor-ate</code>" to the sandbox number</li>
                    <li>Wait for confirmation message</li>
                    <li>Start chatting here!</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Connection Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm text-gray-700">Connected to Sandbox</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
