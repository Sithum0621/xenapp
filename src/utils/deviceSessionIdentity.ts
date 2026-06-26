import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

const WEB_DEVICE_ID_KEY = 'xen_device_fingerprint';

function randomWebId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `web-${crypto.randomUUID()}`;
  }
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getDeviceFingerprint(): Promise<string> {
  if (Platform.OS === 'android') {
    const androidId = Application.getAndroidId();
    if (androidId) return `android-${androidId}`;
  }

  if (Platform.OS === 'ios') {
    const iosId = await Application.getIosIdForVendorAsync();
    if (iosId) return `ios-${iosId}`;
  }

  if (Platform.OS === 'web') {
    const stored = await AsyncStorage.getItem(WEB_DEVICE_ID_KEY);
    if (stored?.trim()) return stored.trim();
    const next = randomWebId();
    await AsyncStorage.setItem(WEB_DEVICE_ID_KEY, next);
    return next;
  }

  return `${Platform.OS}-${Device.modelName ?? 'unknown'}-${Device.osVersion ?? '0'}`;
}

export function getDeviceLabel(): string {
  const os =
    Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS === 'web' ? 'Web' : Platform.OS;
  const model = Device.modelName ?? Device.deviceName ?? 'Device';
  return `${os} · ${model}`;
}

export function getDevicePlatform(): string {
  return Platform.OS;
}
