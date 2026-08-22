export type UseFirebaseMessagingOptions = {
  syncToSupabase?: boolean;
  handleNotificationNavigation?: boolean;
  /** When true, permission is only requested from the home prompt / settings (default true). */
  deferPermissionRequest?: boolean;
};

export type UseFirebaseMessagingResult = {
  fcmToken: string | null;
  permissionGranted: boolean;
  refreshToken: () => Promise<string | null>;
};

/** In-app banner payload for a foreground FCM message. */
export type ForegroundFcmMessage = {
  title: string;
  body?: string;
  data?: Record<string, string | undefined>;
};
