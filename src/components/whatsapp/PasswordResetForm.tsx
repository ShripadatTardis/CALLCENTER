
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

interface PasswordResetFormProps {
  phoneNumber: string;
  newPassword: string;
  confirmPassword: string;
  otpCode: string;
  loading: boolean;
  otpSent: boolean;
  isPhoneReadOnly: boolean;
  onPhoneChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onOtpCodeChange: (value: string) => void;
  onSendOtp: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onBackToLogin: () => void;
}

export const PasswordResetForm: React.FC<PasswordResetFormProps> = ({
  phoneNumber,
  newPassword,
  confirmPassword,
  otpCode,
  loading,
  otpSent,
  isPhoneReadOnly,
  onPhoneChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onOtpCodeChange,
  onSendOtp,
  onSubmit,
  onBackToLogin,
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

      {!otpSent ? (
        <>
          <div>
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => onNewPasswordChange(e.target.value)}
              placeholder="Enter new password"
              required
            />
          </div>
          
          <div>
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => onConfirmPasswordChange(e.target.value)}
              placeholder="Confirm new password"
              required
            />
          </div>
          
          <Button 
            onClick={onSendOtp} 
            className="w-full" 
            disabled={loading || !newPassword || newPassword !== confirmPassword}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send OTP
          </Button>
        </>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Alert className="bg-blue-50 border-blue-200">
            <AlertDescription className="text-blue-800">
              OTP has been sent to your WhatsApp number. Please enter the 6-digit code below.
            </AlertDescription>
          </Alert>
          
          <div>
            <Label htmlFor="otp">OTP Code</Label>
            <Input
              id="otp"
              type="text"
              value={otpCode}
              onChange={(e) => onOtpCodeChange(e.target.value)}
              placeholder="Enter 6-digit OTP"
              maxLength={6}
              required
            />
          </div>
          
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verify & Set Password
          </Button>
        </form>
      )}
      
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onBackToLogin}
      >
        Back to Login
      </Button>
    </div>
  );
};
