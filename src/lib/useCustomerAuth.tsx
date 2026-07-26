'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

interface CustomerUser {
  uid: string;
  email: string | null;
  companyName: string | null;
  contactPerson: string | null;
  exclusieveKunstenaarIds: string[];
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
    return onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (!firebaseUser) {
        setUser(null);
        setIsCustomer(false);
        setIsHydrated(true);
        return;
      }
      const klantDoc = await getDoc(doc(db, 'klanten', firebaseUser.uid));
      const klantData = klantDoc.exists()
        ? (klantDoc.data() as {
            status?: string;
            companyName?: string;
            contactPerson?: string;
            exclusieveKunstenaarIds?: string[];
          })
        : null;
      setUser({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        companyName: klantData?.companyName ?? null,
        contactPerson: klantData?.contactPerson ?? null,
        exclusieveKunstenaarIds: klantData?.exclusieveKunstenaarIds ?? [],
      });
      setIsCustomer(klantData?.status === 'Goedgekeurd');
      setIsHydrated(true);
    });
  }, []);

  const value = useMemo<CustomerAuthValue>(
    () => ({
      user,
      isCustomer,
      isHydrated,
      logout: async () => {
        await firebaseSignOut(auth);
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
