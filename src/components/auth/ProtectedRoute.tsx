
import React from 'react';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { LoginForm } from './LoginForm';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /**
   * Session 14.1 — when set, this route additionally requires the
   * signed-in user to hold this permission, independent of whether the
   * sidebar nav item that would normally link here is even visible
   * (direct URL access must be protected on its own, per plan §20).
   */
  permission?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, permission }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  if (permission && !hasPermission(user, permission)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <h1 className="text-lg font-semibold text-foreground mb-1">Not authorized</h1>
          <p className="text-sm text-muted-foreground">Your account doesn't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
