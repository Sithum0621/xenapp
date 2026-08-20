import AsyncStorage from '@react-native-async-storage/async-storage';

/** How long the app may stay in background before PIN unlock / session logout. */
export const APP_AWAY_GRACE_MS = 10 * 60 * 1000;

const STORAGE_KEY = 'mytuition_last_backgrounded_at';

export async function markAppBackgrounded(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* ignore storage failures */
  }
}

export async function clearAppBackgrounded(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** True when last background was at least APP_AWAY_GRACE_MS ago (or never recorded → false). */
export async function wasAwayLongerThanGrace(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at) || at <= 0) return false;
    return Date.now() - at >= APP_AWAY_GRACE_MS;
  } catch {
    return false;
  }
}
