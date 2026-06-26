import { supabase } from '@/src/services/supabaseClient';

export type DevicePlatform = 'ios' | 'android' | 'web';

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

/**
 * Upserts the current user's FCM device token in Supabase.
 * Call after obtaining the token from Expo Notifications / Firebase Messaging.
 */
export async function registerDeviceToken(
  deviceToken: string,
  platform?: DevicePlatform,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = deviceToken.trim();
  if (!token) return { ok: false, error: 'Device token is required.' };

  try {
    const { data, error } = await supabase.rpc('register_device_token', {
      p_device_token: token,
      p_platform: platform ?? null,
    });

    if (error) return { ok: false, error: error.message };
    if (data && typeof data === 'object' && (data as { ok?: boolean }).ok === true) {
      return { ok: true };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not register device token.';
    return { ok: false, error: message };
  }
}

export async function fetchMyNotifications(limit = 30): Promise<{
  notifications: AppNotification[];
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('list_my_notifications', { p_limit: limit });
  if (error) return { notifications: [], error: error.message };

  const notifications: AppNotification[] = (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    title: String(row.title ?? ''),
    body: String(row.body ?? ''),
    data: (row.data && typeof row.data === 'object' ? row.data : {}) as Record<string, unknown>,
    read_at: row.read_at ? String(row.read_at) : null,
    created_at: String(row.created_at ?? ''),
  }));

  return { notifications, error: null };
}

export async function fetchUnreadNotificationCount(): Promise<{
  count: number;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('count_unread_notifications');
  if (error) return { count: 0, error: error.message };
  return { count: typeof data === 'number' ? data : Number(data ?? 0), error: null };
}

export async function markNotificationsRead(
  notificationIds?: string[],
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase.rpc('mark_notifications_read', {
    p_notification_ids: notificationIds?.length ? notificationIds : null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}
