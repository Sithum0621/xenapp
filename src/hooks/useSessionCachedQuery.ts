import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getSessionCacheEntry,
  sessionCacheGetOrFetch,
  subscribeSessionCache,
  type SessionCacheKey,
} from '@/src/services/sessionDataCache';

type UseSessionCachedQueryOptions<T> = {
  /** When false, cached values are not stored (e.g. failed API responses). */
  shouldCache?: (value: T) => boolean;
  enabled?: boolean;
};

export function useSessionCachedQuery<T>(
  key: SessionCacheKey,
  fetcher: () => Promise<T>,
  options?: UseSessionCachedQueryOptions<T>,
) {
  const cached = getSessionCacheEntry<T>(key);
  const [data, setData] = useState<T | null>(cached?.data ?? null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(
    async (force: boolean) => {
      if (options?.enabled === false) {
        setLoading(false);
        return;
      }

      const entry = getSessionCacheEntry<T>(key);
      if (entry) {
        setData(entry.data);
        if (entry.isFresh && !force) {
          setLoading(false);
          setError(null);
          return;
        }
      }

      const showLoading = !entry?.data;
      if (showLoading) {
        setLoading(true);
      }

      try {
        const result = await sessionCacheGetOrFetch(key, () => fetcherRef.current(), {
          force,
          shouldCache: options?.shouldCache,
        });
        setData(result);
        setError(null);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [key, options?.enabled, options?.shouldCache],
  );

  useEffect(() => {
    return subscribeSessionCache((invalidatedKey) => {
      if (invalidatedKey !== '*' && invalidatedKey !== key) return;
      void run(false);
    });
  }, [key, run]);

  useFocusEffect(
    useCallback(() => {
      void run(false);
    }, [run]),
  );

  const refresh = useCallback((force = true) => {
    void run(force);
  }, [run]);

  return { data, loading, error, refresh };
}
