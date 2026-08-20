import type { FcmRemoteMessage } from '@/src/push/fcmRemoteMessage';

export type XenPushPayload = {
  notificationId: string | null;
  title: string;
  body: string;
  conversationTitle: string;
  conversationId: string;
  groupInitialsLabel: string;
  data: Record<string, string>;
};

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
}

function dataRecord(remoteMessage: FcmRemoteMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(remoteMessage.data ?? {})) {
    if (value != null) out[key] = String(value);
  }
  return out;
}

/** Maps FCM data + notification fields into a consistent MessagingStyle payload. */
export function parsePushPayload(remoteMessage: FcmRemoteMessage): XenPushPayload {
  const data = dataRecord(remoteMessage);
  const title =
    remoteMessage.notification?.title ??
    asString(data.title) ??
    'MyTuition';
  const body =
    remoteMessage.notification?.body ?? asString(data.body) ?? '';

  const groupName = asString(data.group_name);
  const notificationType = asString(data.type);

  let conversationTitle = groupName;
  if (!conversationTitle) {
    if (notificationType === 'attendance_marked') {
      const classMatch = body.match(/for (.+?) \(/);
      conversationTitle = classMatch?.[1] ?? 'Attendance';
    } else if (notificationType === 'attendance_not_arrived') {
      const studentName = asString(data.student_name);
      conversationTitle = studentName ? `${studentName} — absence` : 'Class absence';
    } else if (notificationType === 'group_hello') {
      conversationTitle = 'Class';
    } else if (notificationType === 'group_chat_message') {
      conversationTitle = groupName ?? 'Class chat';
    } else if (notificationType === 'class_reminder') {
      conversationTitle = groupName ?? 'Class reminder';
    } else if (notificationType === 'class_daily_schedule') {
      conversationTitle = groupName ?? 'Upcoming class';
    } else if (notificationType === 'app_update') {
      conversationTitle = 'App update';
    } else if (notificationType === 'wallet_top_up') {
      conversationTitle = 'Wallet';
    } else if (notificationType === 'package_added') {
      conversationTitle = 'Package';
    } else if (notificationType === 'class_fee_paid') {
      conversationTitle = groupName ?? 'Class payment';
    } else {
      conversationTitle = title;
    }
  }

  const groupId = asString(data.group_id);
  const conversationId = groupId ?? notificationType ?? 'xen-general';

  return {
    notificationId: asString(data.notification_id),
    title,
    body,
    conversationTitle,
    conversationId,
    groupInitialsLabel: groupName ?? conversationTitle,
    data,
  };
}
