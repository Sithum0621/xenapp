/** Logs the raw FCM token in a copy-friendly format for Firebase Console testing. */
export function logFcmToken(token: string): void {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('[FCM] Device token (copy for Firebase Console → Cloud Messaging test):');
  console.log(token);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
}
