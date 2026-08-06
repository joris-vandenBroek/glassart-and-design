'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PrijsgroepAanpassing } from '@/lib/prijsgroep';

interface CustomerUser {
  uid: string;
  email: string | null;
  companyName: string | null;
  contactPerson: string | null;
  minimaleAfname: number | null;
  prijsgroep: PrijsgroepAanpassing | null;
}

interface CustomerAuthValue {
  user: CustomerUser | null;
  isCustomer: boolean;
  isHydrated: boolean;
  login: (email: string, password: string) => Promise<string>;
  logout: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthValue | null>(null);

async function loadMe(): Promise<{ user: CustomerUser | null; isCustomer: boolean }> {
  const response = await fetch('/api/auth/me?type=klant');
  const body = await response.json();
  const klant = body.user as
    | {
        id: string;
        email: string | null;
        companyName?: string;
        contactPerson?: string;
        status?: string;
        minimaleAfname?: number | null;
        prijsgroep?: PrijsgroepAanpassing | null;
      }
    | null;
  if (!klant) {
    return { user: null, isCustomer: false };
  }
  return {
    user: {
      uid: klant.id,
      email: klant.email,
      companyName: klant.companyName ?? null,
      contactPerson: klant.contactPerson ?? null,
      minimaleAfname: klant.minimaleAfname ?? null,
      prijsgroep: klant.prijsgroep ?? null,
    },
    isCustomer: klant.status === 'Goedgekeurd',
  };
}

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CustomerUser | null>(null);
  const [isCustomer, setIsCustomer] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Een mislukte /api/auth/me mag niet in "nog aan het laden" blijven hangen: er hangen
    // schermen aan isHydrated (o.a. het mandje, dat per klant geladen wordt) die dan nooit
    // meer verschijnen. Niet kunnen vaststellen wie er inlogt = niet ingelogd.
    loadMe()
      .catch(() => ({ user: null, isCustomer: false }))
      .then((loaded) => {
        if (cancelled) return;
        setUser(loaded.user);
        setIsCustomer(loaded.isCustomer);
        setIsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<CustomerAuthValue>(
    () => ({
      user,
      isCustomer,
      isHydrated,
      // The login form navigates client-side afterwards (router.replace), which does not
      // remount this provider (it lives in the locale layout) -- so the context state has
      // to be refreshed here, not left for a future mount's /api/auth/me call.
      login: async (email: string, password: string) => {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (!response.ok) {
          throw new Error('invalid-credentials');
        }
        const body = (await response.json()) as { status: string };
        const loaded = await loadMe();
        setUser(loaded.user);
        setIsCustomer(loaded.isCustomer);
        return body.status;
      },
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

// Voor providers die de ingelogde klant nodig hebben maar ook zonder CustomerAuthProvider
// erboven moeten kunnen draaien, en dan als "geen ingelogde klant" verdergaan -- zie
// CartProvider, dat in tests los gemonteerd wordt.
export function useOptionalCustomerAuth(): CustomerAuthValue | null {
  return useContext(CustomerAuthContext);
}
