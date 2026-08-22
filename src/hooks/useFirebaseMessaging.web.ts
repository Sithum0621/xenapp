import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  ForegroundFcmMessage,
  UseFirebaseMessagingOptions,
  UseFirebaseMessagingResult,
} from '@/src/hooks/useFirebaseMessaging.types';
import { setPushTokenRefreshHandler } from '@/src/push/enablePushNotifications';
import { displaySystemNotification } from '@/src/push/displaySystemNotification.web';
import type { FcmRemoteMessage } from '@/src/push/fcmRemoteMessage';
import {
  getWebPushPermissionState,
  refreshWebPushTokenIfGranted,
  subscribeWebForegroundMessages,
} from '@/src/push/webFcm';
import { supabase } from '@/src/services/supabaseClient';

export type {
  ForegroundFcmMessage,
  UseFirebaseMessagingOptions,
  UseFirebaseMessagingResult,
} from '@/src/hooks/useFirebaseMessaging.types';

type RealtimeNotificationRow = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
};

function rowToRemoteMessage(row: RealtimeNotificationRow): FcmRemoteMessage {
  const data: Record<string, string> = {
    notification_id: row.id,
    title: row.title,
    body: row.body,
  };
  const raw = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data : {};
  for (const [k, v] of Object.entries(raw)) {
    if (v == null) continue;
    data[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return {
    notification: { title: row.title, body: row.body },
    data,
  };
}

function rowToBanner(row: RealtimeNotificationRow): ForegroundFcmMessage {
  const data: Record<string, string | undefined> = {};
  const raw = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data : {};
  for (const [k, v] of Object.entries(raw)) {
    if (v == null) continue;
    data[k] = typeof v === 'string' ? v : String(v);
  }
  data.notification_id = row.id;
  return { title: row.title, body: row.body, data };
}

function payloadToBanner(message: FcmRemoteMessage): ForegroundFcmMessage {
  const title =
    message.notification?.title?.trim() ||
    (typeof message.data?.title === 'string' ? message.data.title : '') ||
    'MyTuition';
  const body =
    message.notification?.body?.trim() ||
    (typeof message.data?.body === 'string' ? message.data.body : '') ||
    '';
  const data: Record<string, string | undefined> = {};
  if (message.data) {
    for (const [k, v] of Object.entries(message.data)) {
      if (v == null) continue;
      data[k] = typeof v === 'string' ? v : String(v);
    }
  }
  return { title, body, data };
}

/**
 * Web / PWA: FCM background push (service worker) + Realtime fallback while tab is open.
 * Permission is requested from the home-screen prompt — not automatically on mount.
 */
export function useFirebaseMessaging(
  _options: UseFirebaseMessagingOptions = {},
): UseFirebaseMessagingResult & {
  foregroundMessage: ForegroundFcmMessage | null;
  dismissForegroundMessage: () => void;
} {
  const [permissionGranted, setPermissionGranted] = useState(
    () => getWebPushPermissionState() === 'granted',
  );
  const [foregroundMessage, setForegroundMessage] = useState<ForegroundFcmMessage | null>(null);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const userIdRef = useRef<string | null>(null);

  const dismissForegroundMessage = useCallback(() => {
    setForegroundMessage(null);
  }, []);

  const present = useCallback(async (row: RealtimeNotificationRow) => {
    if (!row?.id || seenIdsRef.current.has(row.id)) return;
    seenIdsRef.current.add(row.id);
    if (seenIdsRef.current.size > 200) {
      seenIdsRef.current = new Set([...seenIdsRef.current].slice(-100));
    }
    setForegroundMessage(rowToBanner(row));
    await displaySystemNotification(rowToRemoteMessage(row));
  }, []);

  const refreshToken = useCallback(async (): Promise<string | null> => {
    const token = await refreshWebPushTokenIfGranted();
    setPermissionGranted(getWebPushPermissionState() === 'granted');
    setFcmToken(token);
    return token;
  }, []);

  useEffect(() => {
    setPushTokenRefreshHandler(refreshToken);
    return () => setPushTokenRefreshHandler(null);
  }, [refreshToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let unsubscribeFcm: (() => void) | null = null;

    const unsubscribeChannel = async () => {
      if (!channel) return;
      const ch = channel;
      channel = null;
      await supabase.removeChannel(ch);
    };

    const subscribeForUser = async (userId: string) => {
      if (cancelled || (userIdRef.current === userId && channel)) return;
      await unsubscribeChannel();
      userIdRef.current = userId;

      channel = supabase
        .channel(`web-notifications:${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            void present(payload.new as RealtimeNotificationRow);
          },
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR') {
            console.warn('[web] notifications realtime channel error');
          }
        });
    };

    void (async () => {
      if (getWebPushPermissionState() === 'granted') {
        const token = await refreshWebPushTokenIfGranted();
        if (!cancelled && token) setFcmToken(token);
      }

      unsubscribeFcm = await subscribeWebForegroundMessages(async (message) => {
        setForegroundMessage(payloadToBanner(message));
        await displaySystemNotification(message);
      });

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.user?.id) {
        await subscribeForUser(session.user.id);
      }
    })();

    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        userIdRef.current = null;
        seenIdsRef.current.clear();
        setForegroundMessage(null);
        setFcmToken(null);
        void unsubscribeChannel();
        return;
      }
      if (session?.user?.id) {
        void subscribeForUser(session.user.id);
        if (getWebPushPermissionState() === 'granted') {
          void refreshToken();
        }
      }
    });

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      unsubscribeFcm?.();
      void unsubscribeChannel();
    };
  }, [present, refreshToken]);

  return {
    fcmToken,
    permissionGranted,
    refreshToken,
    foregroundMessage,
    dismissForegroundMessage,
  };
}
