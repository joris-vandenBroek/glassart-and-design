'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { PrijsgroepAanpassing } from '@/lib/prijsgroep';
import { useSessionUser } from '@/lib/useSessionUser';

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

// `isCustomer` hangt aan de status, maar die hoort niet in de gebruikersvorm die
// de rest van de app ziet -- vandaar dit tussenmodel.
interface IngelogdeKlant {
  user: CustomerUser;
  isCustomer: boolean;
}

function mapKlant(raw: unknown): IngelogdeKlant | null {
  const klant = raw as
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
  if (!klant) return null;
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
  const { user: ingelogd, isHydrated, setUser, herlaad } = useSessionUser('klant', mapKlant);

  const value = useMemo<CustomerAuthValue>(
    () => ({
      user: ingelogd?.user ?? null,
      isCustomer: ingelogd?.isCustomer ?? false,
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
        await herlaad();
        return body.status;
      },
      logout: async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        setUser(null);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ingelogd, isHydrated]
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
