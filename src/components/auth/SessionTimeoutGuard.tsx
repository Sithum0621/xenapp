import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAppLock } from '@/src/context/AppLockContext';
import { isPoliciesPath } from '@/src/navigation/publicRoutes';
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
 * Signs users out after 10 minutes of session age unless app lock (PIN) is active.
 * When PIN lock is on, auto-logout is never started — return visits use the PIN gate.
 */
export default function SessionTimeoutGuard() {
  const appRouter = useRouter();
  const pathname = usePathname();
  const { status, statusError, loading } = useAppLock();
  // PIN lock on → no idle auto-logout. Also skip while status RPC is failing so we
  // do not accidentally arm a timer for users who actually have PIN enabled.
  const skipIdleLogout = Boolean(status?.enabled && status?.pinIsSet) || Boolean(statusError);
  const skipIdleLogoutRef = useRef(skipIdleLogout);
  skipIdleLogoutRef.current = skipIdleLogout;
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    if (loading) return;

    let cancelled = false;
    let signOutInProgress = false;

    const goToLoginUnlessPublicPolicies = () => {
      if (isPoliciesPath(pathnameRef.current)) return;
      appRouter.replace('/login');
    };

    /** Idle / TTL logout only — never runs while PIN lock protects the session. */
    const forceIdleLogout = async () => {
      if (cancelled || skipIdleLogoutRef.current) {
        clearSessionCountdown();
        return;
      }
      if (signOutInProgress) return;
      signOutInProgress = true;
      clearSessionCountdown();
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        await supabase.auth.signOut().catch(() => {});
      }
      goToLoginUnlessPublicPolicies();
      signOutInProgress = false;
    };

    const forceStaleSessionLogout = async () => {
      if (cancelled || signOutInProgress) return;
      signOutInProgress = true;
      clearSessionCountdown();
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        await supabase.auth.signOut().catch(() => {});
      }
      goToLoginUnlessPublicPolicies();
      signOutInProgress = false;
    };

    const armIdleTimerIfNeeded = (session: unknown) => {
      if (skipIdleLogoutRef.current || !session) {
        clearSessionCountdown();
        return;
      }
      startSessionCountdown(() => {
        void forceIdleLogout();
      });
    };

    if (skipIdleLogout) {
      clearSessionCountdown();
    }

    void supabase.auth.getSession().then(({ error, data: { session } }) => {
      if (cancelled) return;
      if (isStaleAuthSessionError(error)) {
        void forceStaleSessionLogout();
        return;
      }
      armIdleTimerIfNeeded(session);
    });

    const authListener = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        clearSessionCountdown();
        clearSessionDataCache();
        goToLoginUnlessPublicPolicies();
        return;
      }

      if (skipIdleLogoutRef.current) {
        clearSessionCountdown();
        return;
      }

      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        armIdleTimerIfNeeded(session);
      }
    });

    const appStateListener = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (skipIdleLogoutRef.current) {
        clearSessionCountdown();
        return;
      }
      if (hasSessionExpired()) {
        void forceIdleLogout();
        return;
      }
      refreshSessionCountdown(() => {
        void forceIdleLogout();
      });
    });

    return () => {
      cancelled = true;
      authListener.data.subscription.unsubscribe();
      appStateListener.remove();
      clearSessionCountdown();
    };
  }, [appRouter, skipIdleLogout, loading]);

  return null;
}
