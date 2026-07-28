'use client';

import { useCallback, useEffect, useState } from 'react';

export interface UseApiRecordOptions<T> {
  seed?: T;
}

export interface UseApiRecordResult<T> {
  data: T | null;
  error: 'load' | 'action' | null;
  save: (data: T) => Promise<boolean>;
}

export function useApiRecord<T>(
  resource: string,
  id: string,
  options?: UseApiRecordOptions<T>
): UseApiRecordResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<'load' | 'action' | null>(null);

  const fetchRecord = useCallback(async () => {
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
    fetchRecord();
  }, [fetchRecord]);

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
