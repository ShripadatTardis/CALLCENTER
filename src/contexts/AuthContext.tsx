
import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '@/types/auth';
import { sampleUsers } from '@/data/sampleUsers';

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
  const result = user?.permissions?.includes(permission) || false;
  console.log('DEBUG: hasPermission check:', {
    user: user?.name,
    permission,
    userPermissions: user?.permissions,
    result
  });
  return result;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const savedUser = localStorage.getItem('tardis_user');
    console.log('DEBUG: Loading saved user from localStorage:', savedUser);
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      console.log('DEBUG: Parsed user:', parsedUser);
      setUser(parsedUser);
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    console.log('DEBUG: Attempting login for:', email);
    // Simple authentication - in real app this would be API call
    const foundUser = sampleUsers.find(u => u.email === email);
    console.log('DEBUG: Found user:', foundUser);
    if (foundUser && password === 'password123') {
      console.log('DEBUG: Login successful, setting user:', foundUser);
      setUser(foundUser);
      localStorage.setItem('tardis_user', JSON.stringify(foundUser));
      return true;
    }
    console.log('DEBUG: Login failed');
    return false;
  };

  const logout = () => {
    console.log('DEBUG: Logging out user');
    setUser(null);
    localStorage.removeItem('tardis_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};
