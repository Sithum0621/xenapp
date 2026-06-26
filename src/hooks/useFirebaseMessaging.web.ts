import { useCallback } from 'react';

import type {
  UseFirebaseMessagingOptions,
  UseFirebaseMessagingResult,
} from '@/src/hooks/useFirebaseMessaging.types';

export type { UseFirebaseMessagingOptions, UseFirebaseMessagingResult } from '@/src/hooks/useFirebaseMessaging.types';

/** Web: FCM is not available; no-op stub. */
export function useFirebaseMessaging(
  _options: UseFirebaseMessagingOptions = {},
): UseFirebaseMessagingResult {
  const refreshToken = useCallback(async (): Promise<string | null> => null, []);

  return {
    fcmToken: null,
    permissionGranted: false,
    refreshToken,
  };
}
