/**
 * Tiny in-memory stale-while-revalidate cache.
 *
 * Reads return cached data instantly (or null on first call).
 * Callers still fetch in the background to refresh — but the UI never
 * blocks waiting for the request when a cached value is available.
 *
 * Values are kept for the session (cleared on full page reload).
 */

const store = new Map();

/**
 * Get a cached value synchronously. Returns `null` if not cached.
 * The `ttlMs` argument lets callers treat old entries as stale.
 */
export function getCached(key, ttlMs = Infinity) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) return null;
  return entry.data;
}

export function setCached(key, data) {
  store.set(key, { data, timestamp: Date.now() });
}

export function clearCache(key) {
  if (key) store.delete(key);
  else store.clear();
}

/**
 * Convenience wrapper: fetch once, cache the result, return the cached
 * value on subsequent calls. Always returns a promise for the freshest
 * value; the caller decides whether to also read the cached value first.
 */
export async function fetchAndCache(key, fetcher) {
  const data = await fetcher();
  setCached(key, data);
  return data;
}
