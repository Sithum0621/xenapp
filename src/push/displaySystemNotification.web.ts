import type { FcmRemoteMessage } from '@/src/push/fcmRemoteMessage';
import { extractRouteFromNotificationData } from '@/src/push/notificationRouting';

export { displayXenNotification } from '@/src/push/displayXenNotification.web';

export {
  extractRouteFromNotificationData,
  routeFromNotifeeNotificationData as routeFromNotifeeNotification,
  routeFromRemoteMessage,
} from '@/src/push/notificationRouting';

function asStringMap(data: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!data) return out;
  for (const [k, v] of Object.entries(data)) {
    if (v == null) continue;
    out[k] = typeof v === 'string' ? v : String(v);
  }
  return out;
}

/** Browser / PWA system notification toast (requires Notification permission). */
export async function displaySystemNotification(remoteMessage: FcmRemoteMessage): Promise<void> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;

  const title =
    remoteMessage.notification?.title?.trim() ||
    (typeof remoteMessage.data?.title === 'string' ? remoteMessage.data.title.trim() : '') ||
    'MyTuition';
  const body =
    remoteMessage.notification?.body?.trim() ||
    (typeof remoteMessage.data?.body === 'string' ? remoteMessage.data.body.trim() : '') ||
    '';

  const data = asStringMap(remoteMessage.data as Record<string, unknown> | undefined);
  const tag = data.notification_id || data.type || `mt-${Date.now()}`;

  try {
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (Notification.permission !== 'granted') return;

    const n = new Notification(title, {
      body: body || undefined,
      tag,
      icon: '/logo192.png',
      badge: '/logo192.png',
      data,
    });

    n.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      const route = extractRouteFromNotificationData(data);
      if (route) {
        window.location.assign(route);
      }
      n.close();
    };
  } catch (err) {
    console.warn(
      '[web] Notification popup failed:',
      err instanceof Error ? err.message : err,
    );
  }
}

export async function getInitialNotificationRoute(): Promise<string | null> {
  return null;
}
