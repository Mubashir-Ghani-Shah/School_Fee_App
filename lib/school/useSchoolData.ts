import { useCallback, useEffect, useState } from 'react';
import { schoolDb } from './database';
import type { Settings } from './types';

export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setData(await loader());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}

export const useSettings = () => useAsyncData<Settings>(() => schoolDb.settings(), []);
