import * as Notifications from 'expo-notifications';

/**
 * Ensures foreground notifications show as system banners (like WhatsApp/Telegram),
 * not only as in-app overlays. Loaded from App.tsx on native only.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
