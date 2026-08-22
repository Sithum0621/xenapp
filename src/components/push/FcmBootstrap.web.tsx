import FcmForegroundBanner from '@/src/components/push/FcmForegroundBanner';
import { useFirebaseMessaging } from '@/src/hooks/useFirebaseMessaging';

/**
 * Web / PWA: Realtime + FCM foreground banner. Background via service worker + registered web token.
 */
export default function FcmBootstrap() {
  const { foregroundMessage, dismissForegroundMessage } = useFirebaseMessaging({
    syncToSupabase: true,
    handleNotificationNavigation: false,
  });

  if (!foregroundMessage) return null;

  return (
    <FcmForegroundBanner message={foregroundMessage} onDismiss={dismissForegroundMessage} />
  );
}
