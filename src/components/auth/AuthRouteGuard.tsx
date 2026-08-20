import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { useHasAuthSession } from '@/src/hooks/useHasAuthSession';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import {
  isPoliciesPath,
  isPublicUnauthenticatedPath,
} from '@/src/navigation/publicRoutes';
import { supabase } from '@/src/services/supabaseClient';

const GUEST_POLICIES_LOCK_KEY = 'mt_guest_policies_lock';

/**
 * Keeps guests on public routes only (policies + auth onboarding).
 * Deep links to `/policies/*` work without login; dashboards require a session.
 * After a guest opens policies, browser Back cannot drop them into other app pages.
 */
export default function AuthRouteGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const hasSession = useHasAuthSession();
  const guestPoliciesLock = useRef(false);

  useEffect(() => {
    if (hasSession === true) {
      guestPoliciesLock.current = false;
      if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(GUEST_POLICIES_LOCK_KEY);
      }
      return;
    }
    if (hasSession !== false) return;

    if (isPoliciesPath(pathname)) {
      guestPoliciesLock.current = true;
      if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(GUEST_POLICIES_LOCK_KEY, '1');
      }
      return;
    }

    // Explicit auth/onboarding entry (typed URL / in-app link) releases the sandbox.
    const path = pathname || '';
    if (
      path === '/login' ||
      path === '/signup' ||
      path === '/welcome' ||
      path === '/role-select' ||
      path === '/language' ||
      path === '/auth' ||
      path === '/superadmin-verify'
    ) {
      guestPoliciesLock.current = false;
      if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(GUEST_POLICIES_LOCK_KEY);
      }
    }
  }, [hasSession, pathname]);

  useEffect(() => {
    let cancelled = false;

    const resolvePath = () => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        return window.location.pathname || pathname;
      }
      return pathname;
    };

    const enforce = (session: { user?: unknown } | null) => {
      if (cancelled || session?.user) return;
      if (isPublicUnauthenticatedPath(resolvePath())) return;
      router.replace(appHref(AppRoutes.login));
    };

    void supabase.auth.getSession().then(({ data }) => {
      enforce(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      enforce(session);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const locked = () =>
      guestPoliciesLock.current ||
      (typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem(GUEST_POLICIES_LOCK_KEY) === '1');

    const bounceToPoliciesIfNeeded = () => {
      if (hasSession === true || !locked()) return;
      const path = window.location.pathname || '';
      if (!isPoliciesPath(path)) {
        router.replace(appHref(AppRoutes.policies));
      }
    };

    const onPopState = () => {
      // Let the router apply the history entry, then re-enter policies if needed.
      requestAnimationFrame(bounceToPoliciesIfNeeded);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [hasSession, router]);

  return null;
}
