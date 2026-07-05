/**
 * useStaleData — Stale-While-Revalidate hook
 *
 * Returns cached data immediately (no spinner on revisit),
 * then silently fetches fresh data and updates the UI.
 *
 * Usage:
 *   const { data, loading, refresh } = useStaleData('updates', fetcher);
 */
import { useState, useEffect, useCallback, useRef } from 'react';

// Module-level cache shared across all hook instances
const cache = new Map(); // key → { data, ts }
const CACHE_TTL_MS = 30_000; // 30 s — treat data older than this as stale on mount

export function useStaleData(key, fetcher) {
  const cached = cache.get(key);
  const [data, setData] = useState(cached?.data ?? null);
  // Only show loading spinner if we have no cached data at all
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const doFetch = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (!mountedRef.current) return;
      cache.set(key, { data: result, ts: Date.now() });
      setData(result);
    } catch (err) {
      if (mountedRef.current) setError(err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [key, fetcher]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cached = cache.get(key);
    const isStale = !cached || (Date.now() - cached.ts > CACHE_TTL_MS);

    if (cached) {
      // We already pre-set data from cache in useState initializer —
      // silently refresh in background if stale
      if (isStale) doFetch(true);
    } else {
      // No cache at all — show spinner for first load
      doFetch(false);
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Force a foreground refresh (e.g. after a mutation) */
  const refresh = useCallback(() => doFetch(false), [doFetch]);

  /** Update cache + local state after an optimistic mutation */
  const setDataAndCache = useCallback((updater) => {
    setData((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      cache.set(key, { data: next, ts: Date.now() });
      return next;
    });
  }, [key]);

  /** Invalidate the cache so next mount does a full fetch */
  const invalidate = useCallback(() => {
    cache.delete(key);
  }, [key]);

  return { data, loading, error, refresh, setDataAndCache, invalidate };
}

/** Invalidate a cache key from outside React (e.g. after socket events) */
export function invalidateCache(key) {
  cache.delete(key);
}
