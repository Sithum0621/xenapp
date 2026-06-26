import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import {
  fetchMyNotifications,
  fetchUnreadNotificationCount,
  markNotificationsRead,
  type AppNotification,
} from '@/src/services/pushNotificationsApi';
import { supabase } from '@/src/services/supabaseClient';

export function useNotifications(enabled = true) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    if (!options?.silent) {
      setLoading(true);
    }
    const [{ notifications: rows, error: listErr }, { count, error: countErr }] = await Promise.all([
      fetchMyNotifications(),
      fetchUnreadNotificationCount(),
    ]);
    setLoading(false);

    if (listErr || countErr) {
      setError(listErr ?? countErr);
      return;
    }

    setError(null);
    setNotifications(rows);
    setUnreadCount(count);
  }, [enabled]);

  const markAllRead = useCallback(async () => {
    const res = await markNotificationsRead();
    if (res.ok) {
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    }
    return res;
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    void refresh();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    const appStateListener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });

    const interval = setInterval(() => {
      void refresh();
    }, 60_000);

    return () => {
      authListener.subscription.unsubscribe();
      appStateListener.remove();
      clearInterval(interval);
    };
  }, [enabled, refresh]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refresh,
    markAllRead,
  };
}
