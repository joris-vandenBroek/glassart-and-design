'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface CustomerUser {
  uid: string;
  email: string | null;
  companyName: string | null;
  contactPerson: string | null;
  minimaleAfname: number | null;
}

interface CustomerAuthValue {
  user: CustomerUser | null;
  isCustomer: boolean;
  isHydrated: boolean;
  logout: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthValue | null>(null);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CustomerUser | null>(null);
  const [isCustomer, setIsCustomer] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch('/api/auth/me?type=klant');
        const body = await response.json();
        if (cancelled) return;
        const klant = body.user as
          | {
              id: string;
              email: string | null;
              companyName?: string;
              contactPerson?: string;
              status?: string;
              minimaleAfname?: number | null;
            }
          | null;
        if (!klant) {
          setUser(null);
          setIsCustomer(false);
        } else {
          setUser({
            uid: klant.id,
            email: klant.email,
            companyName: klant.companyName ?? null,
            contactPerson: klant.contactPerson ?? null,
            minimaleAfname: klant.minimaleAfname ?? null,
          });
          setIsCustomer(klant.status === 'Goedgekeurd');
        }
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<CustomerAuthValue>(
    () => ({
      user,
      isCustomer,
      isHydrated,
      logout: async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        setUser(null);
        setIsCustomer(false);
      },
    }),
    [user, isCustomer, isHydrated]
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth(): CustomerAuthValue {
  const context = useContext(CustomerAuthContext);
  if (!context) {
    throw new Error('useCustomerAuth must be used within a CustomerAuthProvider');
  }
  return context;
}
