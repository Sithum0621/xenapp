export type UseFirebaseMessagingOptions = {
  syncToSupabase?: boolean;
  handleNotificationNavigation?: boolean;
};

export type UseFirebaseMessagingResult = {
  fcmToken: string | null;
  permissionGranted: boolean;
  refreshToken: () => Promise<string | null>;
};
