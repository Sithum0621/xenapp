import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAppLock } from '@/src/context/AppLockContext';
import { clearSessionDataCache } from '@/src/services/sessionDataCache';
import {
  clearSessionCountdown,
  hasSessionExpired,
  refreshSessionCountdown,
  startSessionCountdown,
} from '@/src/services/sessionManager';
import { supabase } from '@/src/services/supabaseClient';
import { isStaleAuthSessionError } from '@/src/utils/authSessionErrors';

/**
 * Signs users out after one hour of session age unless app lock (PIN) is active.
 * When app lock protects the device, session timeout is skipped — PIN gate handles return visits.
 */
export default function SessionTimeoutGuard() {
  const appRouter = useRouter();
  const { status, loading } = useAppLock();
  const appLockActive = Boolean(status?.enabled && status?.pinIsSet);

  useEffect(() => {
    if (loading) return;

    let signOutInProgress = false;

    const forceLogout = async () => {
      if (signOutInProgress) return;
      signOutInProgress = true;
      clearSessionCountdown();
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        await supabase.auth.signOut().catch(() => {});
      }
      appRouter.replace('/login');
      signOutInProgress = false;
    };

    void supabase.auth.getSession().then(({ error, data: { session } }) => {
      if (isStaleAuthSessionError(error)) {
        void forceLogout();
        return;
      }
      if (!appLockActive && session) {
        startSessionCountdown(() => {
          void forceLogout();
        });
      }
    });

    const authListener = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        clearSessionCountdown();
        clearSessionDataCache();
        appRouter.replace('/login');
        return;
      }

      if (appLockActive) {
        clearSessionCountdown();
        return;
      }

      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        startSessionCountdown(() => {
          void forceLogout();
        });
      }
    });

    const appStateListener = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || appLockActive) return;
      if (hasSessionExpired()) {
        void forceLogout();
        return;
      }
      refreshSessionCountdown(() => {
        void forceLogout();
      });
    });

    if (appLockActive) {
      clearSessionCountdown();
    }

    return () => {
      authListener.data.subscription.unsubscribe();
      appStateListener.remove();
      if (!appLockActive) {
        clearSessionCountdown();
      }
    };
  }, [appRouter, appLockActive, loading]);

  return null;
}
