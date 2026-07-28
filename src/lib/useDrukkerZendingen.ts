'use client';

import { useEffect, useState } from 'react';

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
        const response = await fetch(`/api/drukkers/${drukkerId}/zendingen`);
        if (!response.ok) throw new Error('load failed');
        const rows = (await response.json()) as Array<{
          id: string;
          verzondenOp: string | null;
          onderwerp: string;
          body: string;
          bestellingIds: string[];
          aantalKlanten: number;
          aantalRegels: number;
          verzondDoor: string;
        }>;
        if (cancelled) return;
        setZendingen(
          rows.map((row) => ({
            id: row.id,
            verzondenOp: row.verzondenOp ? new Date(row.verzondenOp) : null,
            onderwerp: row.onderwerp,
            body: row.body,
            bestellingIds: row.bestellingIds ?? [],
            aantalKlanten: row.aantalKlanten,
            aantalRegels: row.aantalRegels,
            verzondDoor: row.verzondDoor,
          }))
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
