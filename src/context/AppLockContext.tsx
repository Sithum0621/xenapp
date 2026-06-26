import { usePathname } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { appLockGetStatus, type AppLockStatus } from '@/src/services/appLockApi';
import { supabase } from '@/src/services/supabaseClient';

type AppLockContextValue = {
  status: AppLockStatus | null;
  /** Present when status RPC failed (e.g. migration missing); PIN flows may also fail until fixed. */
  statusError: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  gateRequiresUnlock: boolean;
  dismissGate: () => void;
};

const AppLockContext = createContext<AppLockContextValue | undefined>(undefined);

const GATE_SKIP_PREFIXES = [
  '/login',
  '/signup',
  '/language',
  '/role-select',
  '/auth',
  '/superadmin-verify',
  '/payment-plan',
  '/super-admin-dashboard',
  '/super-admin-institute',
  '/super-admin-games-schedule-event',
];

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<AppLockStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [foregroundLocked, setForegroundLocked] = useState(false);

  /** Ensures cold-start policy (PIN gate vs sign-out) runs at most once per JS session for a given user path. */
  const launchPolicyAppliedRef = useRef(false);
  /**
   * After interactive `SIGNED_IN`, do not run the "no PIN → sign out" branch on first dashboard entry;
   * still show the PIN gate when app lock is enabled.
   */
  const suppressLaunchSignOutRef = useRef(false);

  const statusRef = useRef<AppLockStatus | null>(null);
  statusRef.current = status;

  const skipGatePath = useMemo(() => {
    const p = pathname.replace(/\/$/, '') || '/';
    if (p === '/' || p === '') return true;
    return GATE_SKIP_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
  }, [pathname]);

  const skipRef = useRef(skipGatePath);
  skipRef.current = skipGatePath;

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setStatus(null);
      setStatusError(null);
      setLoading(false);
      setForegroundLocked(false);
      return;
    }
    const { status: next, error } = await appLockGetStatus();
    if (error) {
      setStatus({ enabled: false, pinIsSet: false });
      setStatusError(error);
    } else {
      setStatus(next ?? { enabled: false, pinIsSet: false });
      setStatusError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setStatus(null);
        setStatusError(null);
        setForegroundLocked(false);
        setLoading(false);
        launchPolicyAppliedRef.current = false;
        suppressLaunchSignOutRef.current = false;
        return;
      }
      if (event === 'INITIAL_SESSION') {
        // Restored session (app launch): allow launch policy to run once on the dashboard.
        launchPolicyAppliedRef.current = false;
        suppressLaunchSignOutRef.current = false;
        void refresh();
        return;
      }
      if (event === 'SIGNED_IN') {
        launchPolicyAppliedRef.current = false;
        suppressLaunchSignOutRef.current = true;
        void refresh();
        return;
      }
      if (event === 'TOKEN_REFRESHED') {
        void refresh();
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        const s = statusRef.current;
        if (!skipRef.current && s?.enabled && s?.pinIsSet) {
          setForegroundLocked(true);
        }
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!status?.enabled || !status?.pinIsSet) {
      setForegroundLocked(false);
    }
  }, [status?.enabled, status?.pinIsSet]);

  useEffect(() => {
    if (skipGatePath) {
      setForegroundLocked(false);
    }
  }, [skipGatePath]);

  /**
   * Cold start / fresh reopen: if the user is signed in on a protected route and app lock is fully on
   * (`enabled` + `pinIsSet`), require PIN immediately. Otherwise clear the Supabase session so they
   * must log in again. Skipped on auth/onboarding paths and when status RPC failed (avoid lockouts).
   */
  useEffect(() => {
    if (loading) return;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        launchPolicyAppliedRef.current = false;
        suppressLaunchSignOutRef.current = false;
        return;
      }

      if (skipGatePath) return;

      if (launchPolicyAppliedRef.current) return;

      if (statusError) {
        launchPolicyAppliedRef.current = true;
        suppressLaunchSignOutRef.current = false;
        return;
      }

      launchPolicyAppliedRef.current = true;

      const pinProtects = Boolean(status?.enabled && status?.pinIsSet);
      if (pinProtects) {
        setForegroundLocked(true);
      } else if (!suppressLaunchSignOutRef.current) {
        await supabase.auth.signOut();
      }
      suppressLaunchSignOutRef.current = false;
    })();
  }, [loading, status?.enabled, status?.pinIsSet, statusError, skipGatePath]);

  const dismissGate = useCallback(() => {
    setForegroundLocked(false);
  }, []);

  const gateRequiresUnlock = Boolean(
    !loading && !skipGatePath && foregroundLocked && status?.enabled && status?.pinIsSet,
  );

  const value = useMemo(
    () => ({
      status,
      statusError,
      loading,
      refresh,
      gateRequiresUnlock,
      dismissGate,
    }),
    [status, statusError, loading, refresh, gateRequiresUnlock, dismissGate],
  );

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock(): AppLockContextValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) {
    throw new Error('useAppLock must be used within AppLockProvider');
  }
  return ctx;
}
