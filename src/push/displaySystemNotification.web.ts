import type { FcmRemoteMessage } from '@/src/push/fcmRemoteMessage';

export { displayXenNotification } from '@/src/push/displayXenNotification.web';

export {
  extractRouteFromNotificationData,
  routeFromNotifeeNotificationData as routeFromNotifeeNotification,
  routeFromRemoteMessage,
} from '@/src/push/notificationRouting';

export async function displaySystemNotification(_remoteMessage: FcmRemoteMessage): Promise<void> {}

export async function getInitialNotificationRoute(): Promise<string | null> {
  return null;
}
