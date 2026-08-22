import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type Messaging,
} from 'firebase/messaging';

import type { FirebaseWebRuntimeConfig } from '@/src/constants/firebaseWebDefaults';
import { resolveFirebaseWebConfig } from '@/src/push/firebaseWebConfig';
import type { FcmRemoteMessage } from '@/src/push/fcmRemoteMessage';
import { registerDeviceToken } from '@/src/services/pushNotificationsApi';

const SW_PATH = '/firebase-messaging-sw.js';

let messagingInstance: Messaging | null = null;
let serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
let cachedConfig: FirebaseWebRuntimeConfig | null = null;

export type WebPushPermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

export function getWebPushPermissionState(): WebPushPermissionState {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'default';
}

async function loadConfig(): Promise<FirebaseWebRuntimeConfig | null> {
  if (cachedConfig?.appId) return cachedConfig;
  cachedConfig = await resolveFirebaseWebConfig();
  return cachedConfig;
}

async function ensureFirebaseApp(config: FirebaseWebRuntimeConfig): Promise<FirebaseApp | null> {
  if (getApps().length > 0) return getApp();
  return initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
  });
}

async function syncConfigToServiceWorker(config: FirebaseWebRuntimeConfig): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const reg = serviceWorkerRegistration ?? (await navigator.serviceWorker.getRegistration('/'));
    reg?.active?.postMessage({ type: 'FIREBASE_CONFIG', config });
  } catch {
    /* non-fatal */
  }
}

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (serviceWorkerRegistration) return serviceWorkerRegistration;

  try {
    serviceWorkerRegistration = await navigator.serviceWorker.register(SW_PATH, {
      scope: '/',
    });
    await navigator.serviceWorker.ready;
    return serviceWorkerRegistration;
  } catch (err) {
    console.warn('[web-fcm] service worker registration failed:', err);
    return null;
  }
}

async function ensureMessaging(config: FirebaseWebRuntimeConfig): Promise<Messaging | null> {
  if (!(await isSupported())) return null;
  if (messagingInstance) return messagingInstance;

  const app = await ensureFirebaseApp(config);
  if (!app) return null;

  const sw = await ensureServiceWorker();
  if (!sw) return null;

  void syncConfigToServiceWorker(config);

  messagingInstance = getMessaging(app);
  return messagingInstance;
}

export async function subscribeWebForegroundMessages(
  handler: (message: FcmRemoteMessage) => void,
): Promise<(() => void) | null> {
  const config = await loadConfig();
  if (!config) return null;

  const messaging = await ensureMessaging(config);
  if (!messaging) return null;

  return onMessage(messaging, (payload) => {
    handler(payload as FcmRemoteMessage);
  });
}

/**
 * Request browser permission, obtain FCM web token, register in Supabase.
 */
export async function enableWebPushNotifications(): Promise<
  { ok: true; token: string } | { ok: false; reason: WebPushPermissionState | 'config' | 'token' | 'sync' }
> {
  if (!(await isSupported())) {
    return { ok: false, reason: 'unsupported' };
  }

  const config = await loadConfig();
  if (!config?.appId) {
    return { ok: false, reason: 'config' };
  }

  await syncConfigToServiceWorker(config);

  let permission = getWebPushPermissionState();
  if (permission === 'default') {
    const result = await Notification.requestPermission();
    permission = result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'default';
  }
  if (permission !== 'granted') {
    return { ok: false, reason: permission };
  }

  const messaging = await ensureMessaging(config);
  const sw = await ensureServiceWorker();
  if (!messaging || !sw) {
    return { ok: false, reason: 'token' };
  }

  let token: string;
  try {
    const tokenOptions: { serviceWorkerRegistration: ServiceWorkerRegistration; vapidKey?: string } =
      { serviceWorkerRegistration: sw };
    if (config.vapidKey) {
      tokenOptions.vapidKey = config.vapidKey;
    }
    token = await getToken(messaging, tokenOptions);
  } catch (err) {
    console.warn('[web-fcm] getToken failed:', err);
    return { ok: false, reason: 'token' };
  }

  if (!token) {
    return { ok: false, reason: 'token' };
  }

  const sync = await registerDeviceToken(token, 'web');
  if (!sync.ok) {
    console.warn('[web-fcm] token sync failed:', sync.error);
    return { ok: false, reason: 'sync' };
  }

  return { ok: true, token };
}

export async function refreshWebPushTokenIfGranted(): Promise<string | null> {
  if (getWebPushPermissionState() !== 'granted') return null;
  const res = await enableWebPushNotifications();
  return res.ok ? res.token : null;
}
