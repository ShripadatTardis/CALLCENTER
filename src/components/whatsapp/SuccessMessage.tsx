
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, MessageSquare } from 'lucide-react';

export const SuccessMessage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-green-600" />
          </div>
          <CardTitle className="text-2xl text-green-600">Authentication Successful!</CardTitle>
          <CardDescription>
            You have been successfully authenticated. Your pending message has been processed and you can continue your WhatsApp conversation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="bg-green-50 border-green-200">
            <MessageSquare className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              You can now return to WhatsApp and continue your conversation. You'll remain authenticated for 5 minutes of inactivity.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
};
