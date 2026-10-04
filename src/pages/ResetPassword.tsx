import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Logo } from '@/components/ui/logo';
import { supabaseAuthClient } from '@/lib/supabaseAuthClient';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Session 14.1 — handles the landing page for a Supabase Auth password-
 * recovery email link. Supabase's JS client auto-detects the recovery
 * tokens in the URL on load (detectSessionInUrl, default on) and fires
 * a `PASSWORD_RECOVERY` auth event with a temporary session — this page
 * waits for that, then lets the user set a new password via
 * `supabase.auth.updateUser({ password })`, which is the supported way
 * to complete a recovery flow (never handles the raw token itself).
 *
 * Deliberately NOT wrapped in ProtectedRoute/AuthContext's normal
 * identity resolution — a recovery session is not a normal sign-in.
 */
const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      const { data } = await supabaseAuthClient.auth.getSession();
      if (!active) return;
      setStatus(data.session ? 'ready' : 'invalid');
    };
    void checkSession();

    const { data: subscription } = supabaseAuthClient.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        setStatus('ready');
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    const { error: updateError } = await supabaseAuthClient.auth.updateUser({ password });
    setIsSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
    // Clear the temporary recovery session — the user signs in fresh
    // with their new password, no confusing half-authenticated state left behind.
    await supabaseAuthClient.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-card flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <Logo size="md" className="mx-auto mb-3" />
        </div>
        <Card className="shadow-xl border-0 bg-card">
          <CardHeader className="space-y-3 text-center">
            <CardTitle className="text-2xl font-bold text-slate-900">Set a new password</CardTitle>
            <CardDescription className="text-slate-600">
              {status === 'ready' && !success && 'Choose a new password for your account.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {status === 'checking' && (
              <p className="text-sm text-muted-foreground text-center py-4">Checking your reset link…</p>
            )}

            {status === 'invalid' && (
              <div className="space-y-4">
                <Alert variant="destructive">
                  <AlertDescription>
                    This reset link is invalid or has expired. Request a new one from the sign-in page.
                  </AlertDescription>
                </Alert>
                <Button className="w-full h-11" onClick={() => navigate('/', { replace: true })}>
                  Back to sign in
                </Button>
              </div>
            )}

            {status === 'ready' && success && (
              <div className="space-y-4">
                <Alert>
                  <AlertDescription>Your password has been updated. Sign in with your new password.</AlertDescription>
                </Alert>
                <Button className="w-full h-11" onClick={() => navigate('/', { replace: true })}>
                  Go to sign in
                </Button>
              </div>
            )}

            {status === 'ready' && !success && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password" className="text-sm font-medium text-slate-700">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-sm font-medium text-slate-700">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    placeholder="Re-enter your new password"
                    className="h-11"
                  />
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="w-full h-11 text-base" disabled={isSubmitting}>
                  {isSubmitting ? 'Updating…' : 'Update password'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
