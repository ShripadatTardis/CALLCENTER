
import React from 'react';
import { Shield } from 'lucide-react';
import { CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface AuthenticationHeaderProps {
  mode: 'login' | 'reset';
}

export const AuthenticationHeader: React.FC<AuthenticationHeaderProps> = ({ mode }) => {
  return (
    <CardHeader className="text-center">
      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Shield className="w-8 h-8 text-blue-600" />
      </div>
      <CardTitle className="text-2xl">WhatsApp Authentication</CardTitle>
      <CardDescription>
        {mode === 'login' 
          ? 'Enter your password to continue your conversation'
          : 'Set or reset your password for WhatsApp access'
        }
      </CardDescription>
    </CardHeader>
  );
};
