
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIndustry } from '@/contexts/IndustryContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { HeroSection } from './HeroSection';
import { LoginFormFields } from './LoginFormFields';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { IndustrySelector } from './IndustrySelector';
import { Industry } from '@/types/industry';

export const LoginForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');
  const { login } = useAuth();
  const { selectedIndustry, setIndustry } = useIndustry();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const success = await login(email, password);
    if (success) {
      // Always redirect to dashboard after successful login
      navigate('/dashboard', { replace: true });
    } else {
      setError('Invalid email or password');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-card">
      {/* Hero Section with Background Pattern */}
      <div className="h-screen flex overflow-hidden">
        {/* Left Side - Hero Content */}
        <HeroSection />

        {/* Right Side - Login Form */}
        <div className="flex-1 flex items-center justify-center px-4 py-4 lg:px-8">
          <div className="w-full max-w-md space-y-4">
            {/* Mobile Logo */}
            <div className="lg:hidden text-center">
              <Logo size="md" className="mx-auto mb-3" />
              <h2 className="text-2xl font-bold text-slate-900">TARDIS VoiceForce®</h2>
              <p className="text-slate-600 mt-1">Call Center Management</p>
            </div>

            <Card className="shadow-xl border-0 bg-card">
              <CardHeader className="space-y-3 text-center lg:text-left">
                {/* Logo positioned above Welcome back for desktop */}
                <div className="hidden lg:block">
                  <img 
                    src="/lovable-uploads/2ddcb52e-08c8-408c-b26b-7863a86fa467.png" 
                    alt="TARDIS Logo" 
                    className="h-12 w-auto mb-3"
                  />
                </div>
                <CardTitle className="text-2xl font-bold text-slate-900">{mode === 'signin' ? 'Welcome back' : 'Reset your password'}</CardTitle>
                <CardDescription className="text-slate-600">
                  {mode === 'signin' ? 'Sign in to access your AI-powered call center dashboard' : "We'll email you a link to set a new password"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {mode === 'signin' ? (
                  <div className="space-y-5">
                    {/* Industry Selection */}
                    <IndustrySelector
                      selectedIndustry={selectedIndustry}
                      onIndustryChange={setIndustry}
                    />

                    {/* Login Form */}
                    <LoginFormFields
                      email={email}
                      password={password}
                      error={error}
                      isLoading={isLoading}
                      onEmailChange={setEmail}
                      onPasswordChange={setPassword}
                      onSubmit={handleSubmit}
                    />
                    <Button type="button" variant="link" className="w-full h-auto p-0 text-sm" onClick={() => setMode('forgot')}>
                      Forgot password?
                    </Button>
                  </div>
                ) : (
                  <ForgotPasswordForm onBackToSignIn={() => setMode('signin')} />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
