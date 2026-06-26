import notifee from '@notifee/react-native';
import messaging, { AuthorizationStatus } from '@react-native-firebase/messaging';
import { PermissionsAndroid, Platform } from 'react-native';

import type { FcmPermissionResult } from '@/src/push/requestFcmPermission.types';

export type { FcmPermissionResult } from '@/src/push/requestFcmPermission.types';

export async function requestFcmPermission(): Promise<FcmPermissionResult> {
  try {
    if (Platform.OS === 'android') {
      if (Platform.Version >= 33) {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          return { granted: false, reason: 'denied', message: 'POST_NOTIFICATIONS denied.' };
        }
      }
      const notifeeSettings = await notifee.requestPermission();
      if (notifeeSettings.authorizationStatus < 1) {
        return { granted: false, reason: 'denied', message: 'Notifee notification permission denied.' };
      }
    }

    if (Platform.OS === 'ios' && !messaging().isDeviceRegisteredForRemoteMessages) {
      await messaging().registerDeviceForRemoteMessages();
    }

    const status = await messaging().requestPermission();
    const enabled =
      status === AuthorizationStatus.AUTHORIZED ||
      status === AuthorizationStatus.PROVISIONAL;
    if (!enabled) {
      return {
        granted: false,
        reason: 'denied',
        message: `Notification authorization status: ${status}`,
      };
    }

    return { granted: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Permission request failed.';
    return { granted: false, reason: 'error', message };
  }
}
