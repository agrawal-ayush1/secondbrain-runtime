import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService, UserProfile } from '../services/authService';

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isAuthModalOpen: boolean;
  authError: string | null;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // Check initial user session on mount
    authService.getCurrentUser().then((u) => {
      if (u) {
        setUser(u);
      }
    });
  }, []);

  const openAuthModal = () => {
    setAuthError(null);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
    setAuthError(null);
  };

  const requestOtp = async (email: string) => {
    setAuthError(null);
    try {
      await authService.requestOtp(email);
    } catch (err: any) {
      const msg = err.message || 'Failed to send verification code.';
      setAuthError(msg);
      throw err;
    }
  };

  const verifyOtp = async (email: string, otp: string) => {
    setAuthError(null);
    try {
      const res = await authService.verifyOtp(email, otp);
      setUser(res.user);
      setIsAuthModalOpen(false);
    } catch (err: any) {
      const msg = err.message || 'Failed to verify verification code.';
      setAuthError(msg);
      throw err;
    }
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  const clearError = () => {
    setAuthError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAuthModalOpen,
        authError,
        openAuthModal,
        closeAuthModal,
        requestOtp,
        verifyOtp,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
