import messaging from '@react-native-firebase/messaging';
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import type {
  UseFirebaseMessagingOptions,
  UseFirebaseMessagingResult,
} from '@/src/hooks/useFirebaseMessaging.types';
import { setPushTokenRefreshHandler } from '@/src/push/enablePushNotifications';
import { useNotificationOpenNavigation } from '@/src/hooks/useNotificationOpenNavigation';
import { displaySystemNotification } from '@/src/push/displaySystemNotification';
import type { FcmRemoteMessage } from '@/src/push/fcmRemoteMessage';
import { ensureAndroidNotificationChannel } from '@/src/push/ensureAndroidNotificationChannel';
import { logFcmToken } from '@/src/push/logFcmToken';
import { requestFcmPermission } from '@/src/push/requestFcmPermission';
import { registerDeviceToken, type DevicePlatform } from '@/src/services/pushNotificationsApi';
import { supabase } from '@/src/services/supabaseClient';

export type {
  ForegroundFcmMessage,
  UseFirebaseMessagingOptions,
  UseFirebaseMessagingResult,
} from '@/src/hooks/useFirebaseMessaging.types';

export function useFirebaseMessaging(
  options: UseFirebaseMessagingOptions = {},
): UseFirebaseMessagingResult {
  const {
    syncToSupabase = true,
    handleNotificationNavigation = true,
    deferPermissionRequest = true,
  } = options;

  const fcmTokenRef = useRef<string | null>(null);
  const lastSyncedTokenRef = useRef<string | null>(null);
  const permissionGrantedRef = useRef(false);

  useNotificationOpenNavigation(handleNotificationNavigation);

  const syncTokenToSupabase = useCallback(
    async (token: string) => {
      if (!syncToSupabase || !token || token === lastSyncedTokenRef.current) return;
      lastSyncedTokenRef.current = token;

      const platform: DevicePlatform =
        Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

      const res = await registerDeviceToken(token, platform);
      if (!res.ok) {
        console.warn('[FCM] Supabase token sync failed:', res.error);
      }
    },
    [syncToSupabase],
  );

  const refreshToken = useCallback(async (): Promise<string | null> => {
    try {
      const token = await messaging().getToken();
      if (!token) return null;

      fcmTokenRef.current = token;
      logFcmToken(token);
      await syncTokenToSupabase(token);
      return token;
    } catch (err) {
      console.warn('[FCM] getToken failed:', err instanceof Error ? err.message : err);
      return null;
    }
  }, [syncTokenToSupabase]);

  useEffect(() => {
    setPushTokenRefreshHandler(refreshToken);
    return () => setPushTokenRefreshHandler(null);
  }, [refreshToken]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      await ensureAndroidNotificationChannel();
      if (deferPermissionRequest) {
        return;
      }
      const permission = await requestFcmPermission();
      if (cancelled) return;

      permissionGrantedRef.current = permission.granted;
      if (!permission.granted) {
        console.warn('[FCM] Notifications not permitted:', permission.message ?? permission.reason);
        return;
      }

      await refreshToken();
    };

    void bootstrap();

    const unsubscribeTokenRefresh = messaging().onTokenRefresh((token) => {
      fcmTokenRef.current = token;
      logFcmToken(token);
      void syncTokenToSupabase(token);
    });

    const unsubscribeForeground = messaging().onMessage(async (remoteMessage) => {
      console.log('[FCM] Foreground message:', JSON.stringify(remoteMessage, null, 2));
      try {
        await displaySystemNotification(remoteMessage as FcmRemoteMessage);
      } catch (err) {
        console.warn('[FCM] Foreground system notification failed:', err);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && fcmTokenRef.current) {
        void syncTokenToSupabase(fcmTokenRef.current);
      }
      if (!session?.user) {
        lastSyncedTokenRef.current = null;
      }
    });

    return () => {
      cancelled = true;
      unsubscribeTokenRefresh();
      unsubscribeForeground();
      authListener.subscription.unsubscribe();
    };
  }, [refreshToken, syncTokenToSupabase, deferPermissionRequest]);

  return {
    fcmToken: fcmTokenRef.current,
    permissionGranted: permissionGrantedRef.current,
    refreshToken,
  };
}
