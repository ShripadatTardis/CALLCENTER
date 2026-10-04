import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from '@/types/auth';
import { supabaseAuthClient } from '@/lib/supabaseAuthClient';
import { setAccessToken } from '@/lib/authToken';
import { request } from '@/services/transport/httpClient';
import { deriveLegacyRole } from '@/lib/legacyRole';

/**
 * Session 14.1 — real identity. Supabase Auth is used purely as the
 * (replaceable) authentication provider: sign-in/sign-out and session
 * tokens. The actual Call Centre identity — profile, roles, effective
 * permissions — is the app's own, fetched from /api/me (which resolves
 * the verified JWT to a call_center.user_profiles row server-side; see
 * api/_auth.ts). A Supabase Auth account existing is not sufficient on
 * its own — only a deliberately-provisioned profile grants access.
 */

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const hasPermission = (user: User | null, permission: string): boolean => {
  return user?.permissions?.includes(permission) ?? false;
};

interface MeResponseData {
  id: string;
  email: string;
  displayName: string | null;
  status: 'active' | 'inactive';
  roles: string[];
  permissions: string[];
}

function toUser(data: MeResponseData): User {
  return {
    id: data.id,
    email: data.email,
    name: data.displayName || data.email,
    role: deriveLegacyRole(data.roles),
    roles: data.roles,
    permissions: data.permissions,
    status: data.status,
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /** Throws if there's no valid session or no Call Centre profile — callers decide how to handle that. */
  const fetchProfile = useCallback(async (): Promise<User> => {
    const res = await request<{ data: MeResponseData }>('/admin', { query: { resource: 'me' } });
    return toUser(res.data);
  }, []);

  const resolveProfile = useCallback(async (): Promise<void> => {
    try {
      setUser(await fetchProfile());
    } catch {
      // No valid session, or a Supabase Auth account with no Call Centre
      // profile — either way, not signed in as far as this app is
      // concerned. Never fabricate a profile client-side.
      setUser(null);
    }
  }, [fetchProfile]);

  useEffect(() => {
    let active = true;

    const init = async () => {
      const { data } = await supabaseAuthClient.auth.getSession();
      setAccessToken(data.session?.access_token ?? null);
      if (data.session) {
        await resolveProfile();
      }
      if (active) setIsLoading(false);
    };
    void init();

    const { data: subscription } = supabaseAuthClient.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token ?? null);
      if (session) {
        void resolveProfile();
      } else {
        setUser(null);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [resolveProfile]);

  const login = async (email: string, password: string): Promise<boolean> => {
    const { data, error } = await supabaseAuthClient.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return false;
    }
    setAccessToken(data.session.access_token);
    try {
      setUser(await fetchProfile());
    } catch {
      // Authenticated with Supabase, but no Call Centre profile exists
      // for this identity — sign back out rather than leaving a
      // half-authenticated state with no usable identity.
      await supabaseAuthClient.auth.signOut();
      setAccessToken(null);
      setUser(null);
      return false;
    }
    return true;
  };

  const logout = () => {
    void supabaseAuthClient.auth.signOut();
    setAccessToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};
