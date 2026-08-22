import { Platform } from 'react-native';

type RefreshFn = () => Promise<string | null>;

let refreshHandler: RefreshFn | null = null;

export function setPushTokenRefreshHandler(fn: RefreshFn | null): void {
  refreshHandler = fn;
}

/** Called from home permission prompt or settings. */
export async function enablePushNotificationsFromUserAction(): Promise<boolean> {
  if (Platform.OS === 'web') {
    const { enableWebPushNotifications } = await import('@/src/push/webFcm');
    const res = await enableWebPushNotifications();
    return res.ok;
  }

  const { requestFcmPermission } = await import('@/src/push/requestFcmPermission');
  const perm = await requestFcmPermission();
  if (!perm.granted) return false;

  if (refreshHandler) {
    const token = await refreshHandler();
    return Boolean(token);
  }
  return false;
}
