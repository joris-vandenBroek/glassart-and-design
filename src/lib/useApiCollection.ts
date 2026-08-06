'use client';

import { useCallback, useEffect, useState } from 'react';

export interface UseApiCollectionOptions {
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
  options?: UseApiCollectionOptions
): UseApiCollectionResult<T> {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<'load' | 'action' | null>(null);

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
