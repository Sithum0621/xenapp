/** True when PayHere edge functions are deployed and enabled for the app. */
export function isPayhereEnabled(): boolean {
  return process.env.EXPO_PUBLIC_PAYHERE_ENABLED === 'true';
}
