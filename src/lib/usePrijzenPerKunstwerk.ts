'use client';

import { useEffect, useState } from 'react';

interface PrijsRegel {
  materiaalId: string;
  maatId: string;
  prijs: number;
}

export interface UsePrijzenPerKunstwerkResult {
  prijzenPerKunstwerk: Record<string, PrijsRegel[]> | null;
  // A failed fetch resolves prijzenPerKunstwerk to {} (no prices for any kunstwerk), which
  // is indistinguishable from a legitimately empty matrix -- error lets a caller tell the
  // two apart instead of silently rendering "every kunstwerk is unpriced".
  error: boolean;
}

export function usePrijzenPerKunstwerk(): UsePrijzenPerKunstwerkResult {
  const [prijzen, setPrijzen] = useState<Record<string, PrijsRegel[]> | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/kunstwerken/prijzen')
      .then((response) => {
        if (!response.ok) {
          if (!cancelled) setError(true);
          console.error(`usePrijzenPerKunstwerk: GET /api/kunstwerken/prijzen returned ${response.status}`);
          return {};
        }
        return response.json();
      })
      .then((body) => {
        if (!cancelled) setPrijzen(body);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(true);
          setPrijzen({});
        }
        console.error('usePrijzenPerKunstwerk: GET /api/kunstwerken/prijzen failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { prijzenPerKunstwerk: prijzen, error };
}
