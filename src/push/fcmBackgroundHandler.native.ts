/**
 * Must be imported before any other app code (see App.tsx).
 * Displays MessagingStyle notifications for data-only FCM when backgrounded or killed.
 */
import messaging from '@react-native-firebase/messaging';

import { displayXenNotification } from '@/src/push/displayXenNotification.native';
import { ensureAndroidNotificationChannel } from '@/src/push/ensureAndroidNotificationChannel';
import type { FcmRemoteMessage } from '@/src/push/fcmRemoteMessage';

void ensureAndroidNotificationChannel();

messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  // When FCM includes `notification`, Android shows the high-priority tray banner itself.
  if (remoteMessage.notification?.title) {
    return;
  }

  try {
    await displayXenNotification(remoteMessage as FcmRemoteMessage);
    console.log('[FCM] Background MessagingStyle notification displayed');
  } catch (err) {
    console.warn(
      '[FCM] Background notification display failed:',
      err instanceof Error ? err.message : err,
    );
  }
});
