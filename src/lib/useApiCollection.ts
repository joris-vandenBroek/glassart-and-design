'use client';

import { useCallback, useEffect, useState } from 'react';

export interface UseApiCollectionOptions {
  skip?: boolean;
}

export interface UseApiCollectionResult<T> {
  items: T[] | null;
  error: 'load' | 'action' | null;
  // De foutcode uit de laatste mislukte mutatie (add/update/remove), bijv. 'code-bestaat-al'.
  // Additief naast `error`: bestaande callers die alleen de boolean van add/update/remove
  // gebruiken zien geen verschil. `null` zolang er geen mislukte mutatie is geweest, of
  // wanneer de server geen `error`-veld in de responsebody teruggaf.
  lastMutationErrorCode: string | null;
  add: (data: Omit<T, 'id'>) => Promise<boolean>;
  update: (id: string, data: Partial<Omit<T, 'id'>>) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  refetch: () => Promise<boolean>;
}

/**
 * Leest `error` uit een niet-ok responsebody, zonder te gooien als de body geen
 * (geldige) JSON is -- een generieke 500 van bijvoorbeeld een proxy heeft dat niet.
 */
async function leesFoutcode(response: Response): Promise<string | null> {
  try {
    const body = (await response.clone().json()) as { error?: unknown };
    return typeof body.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}

export function useApiCollection<T extends { id: string }>(
  resource: string,
  options?: UseApiCollectionOptions
): UseApiCollectionResult<T> {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<'load' | 'action' | null>(null);
  const [lastMutationErrorCode, setLastMutationErrorCode] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const response = await fetch(`/api/${resource}`);
      if (!response.ok) throw new Error('load failed');
      setItems((await response.json()) as T[]);
      setError(null);
      return true;
    } catch {
      setError('load');
      return false;
    }
  }, [resource]);

  useEffect(() => {
    if (options?.skip) return;
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchItems, options?.skip]);

  const add = useCallback(
    async (data: Omit<T, 'id'>) => {
      // Wist het foutcode van een eerdere mutatie meteen, niet pas bij een geslaagde
      // response: als deze fetch zelf al faalt (offline, DNS, aborted) komt de code
      // hieronder nooit meer langs de plek die het veld zou opschonen, en zou de
      // modal anders de foutmelding van een vorige, ongerelateerde mutatie tonen.
      setLastMutationErrorCode(null);
      try {
        const response = await fetch(`/api/${resource}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          setLastMutationErrorCode(await leesFoutcode(response));
          throw new Error('add failed');
        }
        return await fetchItems();
      } catch {
        setError('action');
        return false;
      }
    },
    [resource, fetchItems]
  );

  const update = useCallback(
    async (id: string, data: Partial<Omit<T, 'id'>>) => {
      // Zie de toelichting in add() hierboven: wissen moet vóór de fetch, anders blijft
      // de foutcode van een eerdere mutatie staan als deze fetch zelf al faalt.
      setLastMutationErrorCode(null);
      try {
        const response = await fetch(`/api/${resource}/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          setLastMutationErrorCode(await leesFoutcode(response));
          throw new Error('update failed');
        }
        return await fetchItems();
      } catch {
        setError('action');
        return false;
      }
    },
    [resource, fetchItems]
  );

  const remove = useCallback(
    async (id: string) => {
      // Zie de toelichting in add() hierboven: wissen moet vóór de fetch, anders blijft
      // de foutcode van een eerdere mutatie staan als deze fetch zelf al faalt.
      setLastMutationErrorCode(null);
      try {
        const response = await fetch(`/api/${resource}/${id}`, { method: 'DELETE' });
        if (!response.ok) {
          setLastMutationErrorCode(await leesFoutcode(response));
          throw new Error('delete failed');
        }
        return await fetchItems();
      } catch {
        setError('action');
        return false;
      }
    },
    [resource, fetchItems]
  );

  return { items, error, lastMutationErrorCode, add, update, remove, refetch: fetchItems };
}
