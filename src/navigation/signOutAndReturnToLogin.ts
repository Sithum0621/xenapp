import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Router } from 'expo-router';
import { Platform } from 'react-native';

import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import { supabase } from '@/src/services/supabaseClient';
import { clearSessionDataCache } from '@/src/services/sessionDataCache';

export type SignOutResult = { ok: true } | { ok: false; message: string };

/**
 * supabase.auth.signOut() removes its own session entry, but defensively clear any other `sb-*`
 * tokens that may linger from older clients / storage migrations on web/native.
 */
async function clearResidualAuthTokens(): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    try {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith('sb-')) keys.push(k);
      }
      keys.forEach((k) => {
        try {
          window.localStorage.removeItem(k);
        } catch {
          /* ignore quota / private-mode errors */
        }
      });
    } catch {
      /* ignore */
    }
    return;
  }

  try {
    const all = await AsyncStorage.getAllKeys();
    const sbKeys = all.filter((k) => k.startsWith('sb-'));
    if (sbKeys.length > 0) {
      await AsyncStorage.multiRemove(sbKeys);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Single source of truth for "log out from this account":
 *   1) supabase.auth.signOut() — terminates the session + clears persisted tokens
 *   2) Defensive cleanup of any leftover `sb-*` tokens in local storage
 *   3) router.replace(login) so the user lands back on the auth screen immediately
 *
 * If the network signOut fails we still wipe local state and route to login, so the user is not
 * stuck inside a broken session.
 */
export async function signOutAndReturnToLogin(router: Router): Promise<SignOutResult> {
  let signOutError: string | null = null;
  try {
    const { error } = await supabase.auth.signOut();
    if (error) signOutError = error.message;
  } catch (e) {
    signOutError = e instanceof Error ? e.message : String(e);
  }

  await clearResidualAuthTokens();
  clearSessionDataCache();

  router.replace(appHref(AppRoutes.login));

  return signOutError ? { ok: false, message: signOutError } : { ok: true };
}
