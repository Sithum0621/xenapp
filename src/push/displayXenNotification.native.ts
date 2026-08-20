import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidStyle,
  AndroidVisibility,
  EventType,
  type Event,
} from '@notifee/react-native';
import { Platform } from 'react-native';

import type { FcmRemoteMessage } from '@/src/push/fcmRemoteMessage';
import {
  ANDROID_NOTIFICATION_AVATAR,
  ANDROID_NOTIFICATION_MARK,
  ANDROID_NOTIFICATION_SMALL_ICON,
} from '@/src/push/notificationIconResources';
import { parsePushPayload } from '@/src/push/parsePushPayload';
import { XEN_NOTIFICATION_CHANNEL_ID } from '@/src/push/notificationChannel';

let channelReady = false;

async function ensureNotifeeChannel(): Promise<void> {
  if (channelReady || Platform.OS !== 'android') return;

  await notifee.createChannel({
    id: XEN_NOTIFICATION_CHANNEL_ID,
    name: 'MyTuition',
    description: 'Class attendance, exams, and account alerts',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
    vibrationPattern: [300, 500],
    badge: true,
    lights: true,
    lightColor: '#2A9D8F',
  });

  channelReady = true;
}

export async function displayXenNotification(remoteMessage: FcmRemoteMessage): Promise<void> {
  const payload = parsePushPayload(remoteMessage);
  const timestamp = Date.now();

  await ensureNotifeeChannel();

  const notificationId =
    payload.notificationId ?? remoteMessage.messageId ?? `xen-${timestamp}`;

  if (Platform.OS === 'android') {
    await notifee.displayNotification({
      id: notificationId,
      title: payload.conversationTitle,
      body: payload.body,
      data: payload.data,
      android: {
        channelId: XEN_NOTIFICATION_CHANNEL_ID,
        smallIcon: ANDROID_NOTIFICATION_SMALL_ICON,
        largeIcon: ANDROID_NOTIFICATION_AVATAR,
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        category: AndroidCategory.MESSAGE,
        pressAction: { id: 'default', launchActivity: 'default' },
        showTimestamp: true,
        timestamp,
        sound: 'default',
        autoCancel: true,
        style: {
          type: AndroidStyle.MESSAGING,
          person: {
            name: payload.conversationTitle,
            icon: ANDROID_NOTIFICATION_AVATAR,
          },
          messages: [
            {
              text: payload.body,
              timestamp,
              person: {
                name: payload.conversationTitle,
                icon: ANDROID_NOTIFICATION_MARK,
              },
            },
          ],
          group: true,
        },
      },
    });
    return;
  }

  await notifee.displayNotification({
    id: notificationId,
    title: payload.conversationTitle,
    subtitle: payload.conversationTitle,
    body: payload.body,
    data: payload.data,
    ios: {
      sound: 'default',
      threadId: payload.conversationId,
    },
  });
}

export function isNotifeePressEvent(event: Event): boolean {
  return event.type === EventType.PRESS || event.type === EventType.ACTION_PRESS;
}
