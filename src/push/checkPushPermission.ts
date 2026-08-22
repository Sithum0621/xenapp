import { Platform } from 'react-native';

export async function checkPushPermissionGranted(): Promise<boolean> {
  if (Platform.OS === 'web') {
    const mod = await import('@/src/push/checkPushPermission.web');
    return mod.checkPushPermissionGranted();
  }
  const mod = await import('@/src/push/checkPushPermission.native');
  return mod.checkPushPermissionGranted();
}
