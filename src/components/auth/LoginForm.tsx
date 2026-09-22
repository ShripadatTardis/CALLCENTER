
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIndustry } from '@/contexts/IndustryContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { sampleUsers } from '@/lib/auth';
import { Logo } from '@/components/ui/logo';
import { HeroSection } from './HeroSection';
import { UserSelectionRadio } from './UserSelectionRadio';
import { LoginFormFields } from './LoginFormFields';
import { IndustrySelector } from './IndustrySelector';
import { Industry } from '@/types/industry';

export const LoginForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState('');
  const { login } = useAuth();
  const { selectedIndustry, setIndustry } = useIndustry();
  const navigate = useNavigate();

  const handleUserSelection = (userId: string) => {
    setSelectedUser(userId);
    const user = sampleUsers.find(u => u.id === userId);
    if (user) {
      setEmail(user.email);
      setPassword('password123');
    }
  };

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
    <div className="min-h-screen bg-white">
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

            <Card className="shadow-xl border-0 bg-white">
              <CardHeader className="space-y-3 text-center lg:text-left">
                {/* Logo positioned above Welcome back for desktop */}
                <div className="hidden lg:block">
                  <img 
                    src="/lovable-uploads/2ddcb52e-08c8-408c-b26b-7863a86fa467.png" 
                    alt="TARDIS Logo" 
                    className="h-12 w-auto mb-3"
                  />
                </div>
                <CardTitle className="text-2xl font-bold text-slate-900">Welcome back</CardTitle>
                <CardDescription className="text-slate-600">
                  Sign in to access your AI-powered call center dashboard
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-5">
                  {/* Industry Selection */}
                  <IndustrySelector
                    selectedIndustry={selectedIndustry}
                    onIndustryChange={setIndustry}
                  />

                  {/* Demo User Selection */}
                  <UserSelectionRadio
                    selectedUser={selectedUser}
                    onUserSelection={handleUserSelection}
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

                  <div className="text-center text-xs text-slate-500">
                    Demo credentials are automatically filled when selecting a user above
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
