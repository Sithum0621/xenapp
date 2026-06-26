import type { FcmPermissionResult } from '@/src/push/requestFcmPermission.types';

export type { FcmPermissionResult } from '@/src/push/requestFcmPermission.types';

export async function requestFcmPermission(): Promise<FcmPermissionResult> {
  return { granted: false, reason: 'unsupported', message: 'FCM is not available on web.' };
}
