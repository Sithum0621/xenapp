/**
 * In-memory session cache for dashboard/API data.
 * Valid entries are returned instantly on tab focus; invalidated entries re-fetch in the background.
 * Cleared on sign-out.
 */

export const SessionCacheKeys = {
  TEACHER_DASHBOARD_OVERVIEW: 'teacher:dashboard:overview',
  TEACHER_UNIFIED_GROUPS: 'teacher:groups:unified',
  TEACHER_GROUP_CHATS: 'teacher:group-chats',
  TEACHER_TODAY_SCHEDULE: 'teacher:today-schedule',
  TEACHER_TIMETABLE: 'teacher:timetable',
  TEACHER_WALLET: 'teacher:wallet',
  PARENT_STUDENTS: 'parent:students',
  PARENT_COMMUNITY_CHAT: 'parent:community-chat',
} as const;

export type SessionCacheKey =
  | (typeof SessionCacheKeys)[keyof typeof SessionCacheKeys]
  | `parent:group-chats:${string}`
  | `parent:classes:${string}`;

const TEACHER_DASHBOARD_KEYS: SessionCacheKey[] = [
  SessionCacheKeys.TEACHER_DASHBOARD_OVERVIEW,
  SessionCacheKeys.TEACHER_UNIFIED_GROUPS,
  SessionCacheKeys.TEACHER_GROUP_CHATS,
  SessionCacheKeys.TEACHER_TODAY_SCHEDULE,
  SessionCacheKeys.TEACHER_TIMETABLE,
  SessionCacheKeys.TEACHER_WALLET,
];

type CacheEntry<T> = {
  data: T;
  isFresh: boolean;
  fetchedAt: number;
};

type InvalidationListener = (key: SessionCacheKey | '*') => void;

const cache = new Map<SessionCacheKey, CacheEntry<unknown>>();
const inflight = new Map<SessionCacheKey, Promise<unknown>>();
const listeners = new Set<InvalidationListener>();

export function parentGroupChatsCacheKey(studentUserId: string): SessionCacheKey {
  return `parent:group-chats:${studentUserId.trim()}`;
}

export function parentClassesCacheKey(studentUserId: string): SessionCacheKey {
  return `parent:classes:${studentUserId.trim()}`;
}

function notifyInvalidation(key: SessionCacheKey | '*') {
  for (const listener of listeners) {
    listener(key);
  }
}

export function subscribeSessionCache(listener: InvalidationListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSessionCacheEntry<T>(key: SessionCacheKey): { data: T; isFresh: boolean } | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  return { data: entry.data, isFresh: entry.isFresh };
}

function setSessionCacheEntry<T>(key: SessionCacheKey, data: T) {
  cache.set(key, { data, isFresh: true, fetchedAt: Date.now() });
}

export function invalidateSessionCache(keys?: SessionCacheKey | SessionCacheKey[] | '*') {
  if (keys === '*') {
    for (const entry of cache.values()) {
      entry.isFresh = false;
    }
    notifyInvalidation('*');
    return;
  }

  const keyList = keys ? (Array.isArray(keys) ? keys : [keys]) : TEACHER_DASHBOARD_KEYS;
  for (const key of keyList) {
    const entry = cache.get(key);
    if (entry) {
      entry.isFresh = false;
    }
    notifyInvalidation(key);
  }
}

/** Mark teacher dashboard list/overview caches stale after local mutations. */
export function invalidateTeacherDashboardCaches(keys?: SessionCacheKey | SessionCacheKey[]) {
  invalidateSessionCache(keys ?? TEACHER_DASHBOARD_KEYS);
}

/** Mark parent dashboard caches stale (students, classes, chats). */
export function invalidateParentDashboardCaches() {
  for (const key of cache.keys()) {
    if (!key.startsWith('parent:')) continue;
    const entry = cache.get(key);
    if (entry) {
      entry.isFresh = false;
    }
    notifyInvalidation(key);
  }
}

export function clearSessionDataCache() {
  cache.clear();
  inflight.clear();
  notifyInvalidation('*');
}

export async function sessionCacheGetOrFetch<T>(
  key: SessionCacheKey,
  fetcher: () => Promise<T>,
  options?: { force?: boolean; shouldCache?: (value: T) => boolean },
): Promise<T> {
  if (!options?.force) {
    const entry = cache.get(key) as CacheEntry<T> | undefined;
    if (entry?.isFresh) {
      return entry.data;
    }
  }

  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = (async () => {
    const value = await fetcher();
    if (!options?.shouldCache || options.shouldCache(value)) {
      setSessionCacheEntry(key, value);
    }
    return value;
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    if (inflight.get(key) === promise) {
      inflight.delete(key);
    }
  }
}
