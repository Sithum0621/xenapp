/**
 * Required by Notifee for background press events (must load outside React — see App.tsx).
 */
import notifee, { EventType } from '@notifee/react-native';

import { routeFromNotifeeNotificationData } from '@/src/push/notificationRouting';

notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type !== EventType.PRESS) return;
  const route = routeFromNotifeeNotificationData(
    detail.notification?.data as Record<string, unknown> | undefined,
  );
  if (route) {
    console.log('[Notifee] Background press, route:', route);
  }
});
