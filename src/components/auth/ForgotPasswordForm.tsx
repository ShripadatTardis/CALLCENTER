import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabaseAuthClient } from '@/lib/supabaseAuthClient';

interface ForgotPasswordFormProps {
  onBackToSignIn: () => void;
}

/**
 * Session 14.1 — real Supabase Auth password-recovery request. The
 * redirect target is derived from `window.location.origin`, never
 * hardcoded — this makes it correct automatically in every environment
 * (local dev on whatever port Vite is actually running, a Vercel
 * preview deployment, or production) with no env var to keep in sync.
 */
export const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({ onBackToSignIn }) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    const { error: resetError } = await supabaseAuthClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setIsLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertDescription>
            If an account exists for {email}, a password reset link has been sent. Check your email.
          </AlertDescription>
        </Alert>
        <Button type="button" variant="outline" className="w-full h-11" onClick={onBackToSignIn}>
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">Enter your email and we'll send you a link to reset your password.</p>
      <div className="space-y-2">
        <Label htmlFor="reset-email" className="text-sm font-medium text-slate-700">Email</Label>
        <Input
          id="reset-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="Enter your email"
          className="h-11"
        />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="w-full h-11 text-base" disabled={isLoading}>
        {isLoading ? 'Sending…' : 'Send reset link'}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onBackToSignIn}>
        Back to sign in
      </Button>
    </form>
  );
};
