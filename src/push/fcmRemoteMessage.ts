/** Minimal FCM payload shape (avoids importing RN Firebase on web). */
export type FcmRemoteMessage = {
  messageId?: string;
  notification?: { title?: string; body?: string };
  data?: Record<string, unknown>;
};
