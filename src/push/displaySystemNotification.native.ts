import messaging from '@react-native-firebase/messaging';
import notifee from '@notifee/react-native';
import type { Notification } from '@notifee/react-native';

import { displayXenNotification } from '@/src/push/displayXenNotification.native';
import type { FcmRemoteMessage } from '@/src/push/fcmRemoteMessage';
import {
  extractRouteFromNotificationData,
  routeFromNotifeeNotificationData,
  routeFromRemoteMessage,
} from '@/src/push/notificationRouting';

export { displayXenNotification };
export { extractRouteFromNotificationData, routeFromRemoteMessage };

export async function displaySystemNotification(remoteMessage: FcmRemoteMessage): Promise<void> {
  await displayXenNotification(remoteMessage);
}

export function routeFromNotifeeNotification(notification: Notification | null | undefined): string | null {
  if (!notification?.data) return null;
  return routeFromNotifeeNotificationData(notification.data as Record<string, unknown>);
}

export async function getInitialNotificationRoute(): Promise<string | null> {
  const notifeeInitial = await notifee.getInitialNotification();
  const fromNotifee = routeFromNotifeeNotification(notifeeInitial?.notification);
  if (fromNotifee) return fromNotifee;

  const fcmInitial = await messaging().getInitialNotification();
  return routeFromRemoteMessage(fcmInitial);
}
