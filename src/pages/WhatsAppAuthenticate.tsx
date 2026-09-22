
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AuthenticationHeader } from '@/components/whatsapp/AuthenticationHeader';
import { LoginForm } from '@/components/whatsapp/LoginForm';
import { PasswordResetForm } from '@/components/whatsapp/PasswordResetForm';
import { SuccessMessage } from '@/components/whatsapp/SuccessMessage';

const WhatsAppAuthenticate: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  const [phoneNumber, setPhoneNumber] = useState('');
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const phone = searchParams.get('phone');
    if (phone) {
      setPhoneNumber(phone);
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('validate-password', {
        body: { phone_number: phoneNumber, password }
      });

      if (error) throw error;

      if (data.success) {
        // Process any pending messages
        await supabase.functions.invoke('process-pending-message', {
          body: { phone_number: phoneNumber }
        });

        setSuccess(true);
        toast({
          title: 'Success',
          description: 'Login successful! Your pending message has been processed.',
        });
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Login failed',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: 'Error',
        description: 'Login failed. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('send-otp', {
        body: { phone_number: phoneNumber }
      });

      if (error) throw error;

      if (data.success) {
        setOtpSent(true);
        toast({
          title: 'Success',
          description: 'OTP sent to your WhatsApp number',
        });
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to send OTP',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Send OTP error:', error);
      toast({
        title: 'Error',
        description: 'Failed to send OTP. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast({
        title: 'Error',
        description: 'Passwords do not match',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('reset-password', {
        body: {
          phone_number: phoneNumber,
          otp_code: otpCode,
          new_password: newPassword
        }
      });

      if (error) throw error;

      if (data.success) {
        // Process any pending messages
        await supabase.functions.invoke('process-pending-message', {
          body: { phone_number: phoneNumber }
        });

        setSuccess(true);
        toast({
          title: 'Success',
          description: 'Password updated successfully! Your pending message has been processed.',
        });
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Password reset failed',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Reset password error:', error);
      toast({
        title: 'Error',
        description: 'Password reset failed. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setMode('login');
    setOtpSent(false);
    setOtpCode('');
    setNewPassword('');
    setConfirmPassword('');
  };

  if (success) {
    return <SuccessMessage />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <AuthenticationHeader mode={mode} />
        <CardContent className="space-y-4">
          {mode === 'login' ? (
            <LoginForm
              phoneNumber={phoneNumber}
              password={password}
              loading={loading}
              isPhoneReadOnly={!!searchParams.get('phone')}
              onPhoneChange={setPhoneNumber}
              onPasswordChange={setPassword}
              onSubmit={handleLogin}
              onModeChange={() => setMode('reset')}
            />
          ) : (
            <PasswordResetForm
              phoneNumber={phoneNumber}
              newPassword={newPassword}
              confirmPassword={confirmPassword}
              otpCode={otpCode}
              loading={loading}
              otpSent={otpSent}
              isPhoneReadOnly={!!searchParams.get('phone')}
              onPhoneChange={setPhoneNumber}
              onNewPasswordChange={setNewPassword}
              onConfirmPasswordChange={setConfirmPassword}
              onOtpCodeChange={setOtpCode}
              onSendOtp={handleSendOtp}
              onSubmit={handleResetPassword}
              onBackToLogin={handleBackToLogin}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WhatsAppAuthenticate;
