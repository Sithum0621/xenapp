import notifee from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { isNotifeePressEvent } from '@/src/push/displayXenNotification';
import {
  getInitialNotificationRoute,
  routeFromNotifeeNotification,
  routeFromRemoteMessage,
} from '@/src/push/displaySystemNotification';
import type { FcmRemoteMessage } from '@/src/push/fcmRemoteMessage';

export function useNotificationOpenNavigation(enabled = true): void {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

    void (async () => {
      const initialRoute = await getInitialNotificationRoute();
      if (!cancelled && initialRoute) {
        router.push(initialRoute as never);
      }
    })();

    const unsubscribeFcm = messaging().onNotificationOpenedApp((remoteMessage) => {
      const route = routeFromRemoteMessage(remoteMessage as FcmRemoteMessage);
      if (route) router.push(route as never);
    });

    const unsubscribeNotifeeForeground = notifee.onForegroundEvent((event) => {
      if (!isNotifeePressEvent(event)) return;
      const route = routeFromNotifeeNotification(
        (event.detail.notification ?? null) as never,
      );
      if (route) router.push(route as never);
    });

    return () => {
      cancelled = true;
      unsubscribeFcm();
      unsubscribeNotifeeForeground();
    };
  }, [enabled, router]);
}
