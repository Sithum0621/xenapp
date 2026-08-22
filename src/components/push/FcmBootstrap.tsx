import { Platform } from 'react-native';

import { useFirebaseMessaging } from '@/src/hooks/useFirebaseMessaging';

/**
 * Mount once near the app root (dev build only — not Expo Go).
 * Registers FCM, syncs token to Supabase, shows system-tray notifications in all app states.
 */
export default function FcmBootstrap() {
  useFirebaseMessaging({
    syncToSupabase: true,
    handleNotificationNavigation: true,
    deferPermissionRequest: true,
  });

  if (Platform.OS === 'web') return null;

  return null;
}
