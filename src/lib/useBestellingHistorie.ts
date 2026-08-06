'use client';

import { useEffect, useState } from 'react';

export interface BestellingHistorieEntry {
  status: string;
  tijdstip: Date;
}

export function useBestellingHistorie(bestellingId: string | null): {
  historie: BestellingHistorieEntry[] | null;
  error: boolean;
} {
  const [historie, setHistorie] = useState<BestellingHistorieEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!bestellingId) {
      setHistorie(null);
      setError(false);
      return;
    }
    let cancelled = false;
    setHistorie(null);
    setError(false);
    async function load() {
      try {
        const response = await fetch(`/api/bestelheaders/${bestellingId}/statushistorie`);
        if (!response.ok) throw new Error('load failed');
        const rows = (await response.json()) as Array<{ status: string; tijdstip: string }>;
        if (cancelled) return;
        setHistorie(rows.map((row) => ({ status: row.status, tijdstip: new Date(row.tijdstip) })));
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
  }, [bestellingId]);

  return { historie, error };
}
