'use client';

import { useCallback, useEffect, useState } from 'react';

export interface UseApiDocumentOptions<T> {
  seed?: T;
}

export interface UseApiDocumentResult<T> {
  data: T | null;
  error: 'load' | 'action' | null;
  save: (data: T) => Promise<boolean>;
}

export function useApiDocument<T>(
  resource: string,
  id: string,
  options?: UseApiDocumentOptions<T>
): UseApiDocumentResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<'load' | 'action' | null>(null);

  const fetchDoc = useCallback(async () => {
    try {
      const response = await fetch(`/api/${resource}/${id}`);
      if (!response.ok) throw new Error('load failed');
      setData(await response.json());
      setError(null);
      return true;
    } catch {
      setError('load');
      return false;
    }
  }, [resource, id]);

  useEffect(() => {
    fetchDoc();
  }, [fetchDoc]);

  const save = useCallback(
    async (newData: T) => {
      try {
        const response = await fetch(`/api/${resource}/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(newData),
        });
        if (!response.ok) throw new Error('save failed');
        setData(newData);
        setError(null);
        return true;
      } catch {
        setError('action');
        return false;
      }
    },
    [resource, id]
  );

  return { data, error, save };
}
