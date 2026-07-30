'use client';

import { useEffect, useState } from 'react';

interface PrijsRegel {
  materiaalId: string;
  maatId: string;
  prijs: number;
}

export function usePrijzenPerKunstwerk(): Record<string, PrijsRegel[]> | null {
  const [prijzen, setPrijzen] = useState<Record<string, PrijsRegel[]> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/kunstwerken/prijzen')
      .then((response) => (response.ok ? response.json() : {}))
      .then((body) => {
        if (!cancelled) setPrijzen(body);
      })
      .catch(() => {
        if (!cancelled) setPrijzen({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return prijzen;
}
