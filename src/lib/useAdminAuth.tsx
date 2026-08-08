'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useSessionUser } from '@/lib/useSessionUser';

interface AdminUser {
  uid: string;
  email: string | null;
}

interface AdminAuthValue {
  user: AdminUser | null;
  isAdmin: boolean;
  isHydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

function mapMedewerker(raw: unknown): AdminUser | null {
  const medewerker = raw as { id: string; email: string | null } | null;
  return medewerker ? { uid: medewerker.id, email: medewerker.email } : null;
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const { user, isHydrated, setUser, herlaad } = useSessionUser('medewerker', mapMedewerker);

  const value = useMemo<AdminAuthValue>(
    () => ({
      user,
      isAdmin: user !== null,
      isHydrated,
      login: async (email: string, password: string) => {
        const response = await fetch('/api/auth/medewerker-login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (!response.ok) throw new Error('login failed');
        await herlaad();
      },
      logout: async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        setUser(null);
      },
      resetPassword: async (email: string) => {
        await fetch('/api/auth/reset-password/request', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, userType: 'medewerker' }),
        });
      },
    }),
    // setUser/herlaad zijn stabiel genoeg voor deze provider; hun identiteit
    // verandert alleen mee met `user`, dat hier al in staat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, isHydrated]
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthValue {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
}
