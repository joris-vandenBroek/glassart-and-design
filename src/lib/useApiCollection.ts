'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseApiCollectionOptions<T> {
  seed?: Omit<T, 'id'>[];
  skip?: boolean;
}

export interface UseApiCollectionResult<T> {
  items: T[] | null;
  error: 'load' | 'action' | null;
  add: (data: Omit<T, 'id'>) => Promise<boolean>;
  update: (id: string, data: Partial<Omit<T, 'id'>>) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  refetch: () => Promise<boolean>;
}

export function useApiCollection<T extends { id: string }>(
  resource: string,
  options?: UseApiCollectionOptions<T>
): UseApiCollectionResult<T> {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<'load' | 'action' | null>(null);
  const seedRef = useRef(options?.seed);
  seedRef.current = options?.seed;

  const fetchItems = useCallback(async () => {
    try {
      const response = await fetch(`/api/${resource}`);
      if (!response.ok) throw new Error('load failed');
      let loaded = (await response.json()) as T[];
      const seed = seedRef.current;
      if (loaded.length === 0 && seed && seed.length > 0) {
        for (const seedItem of seed) {
          await fetch(`/api/${resource}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(seedItem),
          });
        }
        const reseededResponse = await fetch(`/api/${resource}`);
        loaded = (await reseededResponse.json()) as T[];
      }
      setItems(loaded);
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
      try {
        const response = await fetch(`/api/${resource}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error('add failed');
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
      try {
        const response = await fetch(`/api/${resource}/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error('update failed');
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
      try {
        const response = await fetch(`/api/${resource}/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('delete failed');
        return await fetchItems();
      } catch {
        setError('action');
        return false;
      }
    },
    [resource, fetchItems]
  );

  return { items, error, add, update, remove, refetch: fetchItems };
}
