'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

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

async function loadMe(): Promise<AdminUser | null> {
  const response = await fetch('/api/auth/me?type=medewerker');
  const body = await response.json();
  const medewerker = body.user as { id: string; email: string | null } | null;
  return medewerker ? { uid: medewerker.id, email: medewerker.email } : null;
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMe().then((loaded) => {
      if (!cancelled) {
        setUser(loaded);
        setIsHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
        setUser(await loadMe());
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
