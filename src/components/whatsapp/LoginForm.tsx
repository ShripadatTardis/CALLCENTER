
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface LoginFormProps {
  phoneNumber: string;
  password: string;
  loading: boolean;
  isPhoneReadOnly: boolean;
  onPhoneChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onModeChange: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  phoneNumber,
  password,
  loading,
  isPhoneReadOnly,
  onPhoneChange,
  onPasswordChange,
  onSubmit,
  onModeChange,
}) => {
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="phone">WhatsApp Number</Label>
        <Input
          id="phone"
          type="text"
          value={phoneNumber}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder="+1234567890"
          className="bg-gray-50"
          readOnly={isPhoneReadOnly}
        />
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="Enter your password"
            required
          />
        </div>
        
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Sign In
        </Button>
        
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onModeChange}
        >
          Set/Reset Password
        </Button>
      </form>
    </div>
  );
};
