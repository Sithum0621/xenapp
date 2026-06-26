import * as Notifications from 'expo-notifications';

import { XEN_NOTIFICATION_CHANNEL_ID } from '@/src/push/notificationChannel';

/**
 * Android 8+ requires a notification channel before FCM can show system-tray alerts
 * when the app is backgrounded or killed.
 */
export async function ensureAndroidNotificationChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(XEN_NOTIFICATION_CHANNEL_ID, {
    name: 'XEN',
    description: 'Class attendance, exams, and account alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#123B7A',
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
  });
}
