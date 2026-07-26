'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from './firebase';

export interface DrukkerZending {
  id: string;
  verzondenOp: Date | null;
  onderwerp: string;
  body: string;
  bestellingIds: string[];
  aantalKlanten: number;
  aantalRegels: number;
  verzondDoor: string;
}

export function useDrukkerZendingen(drukkerId: string | null): { zendingen: DrukkerZending[] | null; error: boolean } {
  const [zendingen, setZendingen] = useState<DrukkerZending[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!drukkerId) {
      setZendingen(null);
      setError(false);
      return;
    }
    let cancelled = false;
    setZendingen(null);
    setError(false);
    async function load() {
      try {
        const snapshot = await getDocs(
          query(collection(db, 'drukkers', drukkerId as string, 'zendingen'), orderBy('verzondenOp', 'desc'))
        );
        if (cancelled) return;
        setZendingen(
          snapshot.docs.map((docSnapshot) => {
            const data = docSnapshot.data();
            return {
              id: docSnapshot.id,
              verzondenOp: data.verzondenOp?.toDate() ?? null,
              onderwerp: data.onderwerp,
              body: data.body,
              bestellingIds: data.bestellingIds ?? [],
              aantalKlanten: data.aantalKlanten,
              aantalRegels: data.aantalRegels,
              verzondDoor: data.verzondDoor,
            };
          })
        );
      } catch {
        if (!cancelled) {
          setError(true);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [drukkerId]);

  return { zendingen, error };
}
