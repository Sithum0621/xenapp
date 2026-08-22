import { getWebPushPermissionState } from '@/src/push/webFcm';

export async function checkPushPermissionGranted(): Promise<boolean> {
  return getWebPushPermissionState() === 'granted';
}
