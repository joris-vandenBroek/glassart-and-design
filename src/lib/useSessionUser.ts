'use client';

import { useEffect, useState } from 'react';

/**
 * Het stuk dat `useAdminAuth` en `useCustomerAuth` woord voor woord deelden:
 * bij het monteren `/api/auth/me` ophalen, het antwoord vertalen naar de eigen
 * gebruikersvorm, en bijhouden of dat al gebeurd is (`isHydrated`).
 *
 * De rest -- welke velden een klant of medewerker heeft, en wat "ingelogd"
 * precies betekent -- verschilt wél per rol en blijft in de eigen provider.
 */
export interface SessionUserState<T> {
  user: T | null;
  isHydrated: boolean;
  setUser: (user: T | null) => void;
  /** Haalt /api/auth/me opnieuw op en zet de uitkomst; geeft hem ook terug. */
  herlaad: () => Promise<T | null>;
}

export function useSessionUser<T>(
  type: 'klant' | 'medewerker',
  mapUser: (body: unknown) => T | null
): SessionUserState<T> {
  const [user, setUser] = useState<T | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  async function laad(): Promise<T | null> {
    const response = await fetch(`/api/auth/me?type=${type}`);
    const body = await response.json();
    return mapUser(body.user);
  }

  useEffect(() => {
    let cancelled = false;
    // Een mislukte /api/auth/me mag niet in "nog aan het laden" blijven hangen: er hangen
    // schermen aan isHydrated (o.a. het mandje, dat per klant geladen wordt) die dan nooit
    // meer verschijnen. Niet kunnen vaststellen wie er inlogt = niet ingelogd.
    laad()
      .catch(() => null)
      .then((geladen) => {
        if (cancelled) return;
        setUser(geladen);
        setIsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  return {
    user,
    isHydrated,
    setUser,
    herlaad: async () => {
      const geladen = await laad();
      setUser(geladen);
      return geladen;
    },
  };
}
