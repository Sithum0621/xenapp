import type { FcmRemoteMessage } from '@/src/push/fcmRemoteMessage';

export function extractRouteFromNotificationData(
  data: Record<string, unknown> | null | undefined,
): string | null {
  if (!data || typeof data !== 'object') return null;
  const route = data.route;
  return typeof route === 'string' && route.trim().length > 0 ? route.trim() : null;
}

export function routeFromRemoteMessage(remoteMessage: FcmRemoteMessage | null): string | null {
  if (!remoteMessage) return null;
  return extractRouteFromNotificationData(remoteMessage.data as Record<string, unknown>);
}

export function routeFromNotifeeNotificationData(
  data: Record<string, unknown> | null | undefined,
): string | null {
  return extractRouteFromNotificationData(data);
}
