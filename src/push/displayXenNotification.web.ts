import type { FcmRemoteMessage } from '@/src/push/fcmRemoteMessage';

export async function displayXenNotification(_remoteMessage: FcmRemoteMessage): Promise<void> {
  // Push notifications are native-only.
}

export function isNotifeePressEvent(_event: unknown): boolean {
  return false;
}
