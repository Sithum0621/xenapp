import Constants from 'expo-constants';

import {
  FIREBASE_WEB_DEFAULTS,
  type FirebaseWebRuntimeConfig,
} from '@/src/constants/firebaseWebDefaults';
import { supabase } from '@/src/services/supabaseClient';

type ExtraFirebaseWeb = Partial<FirebaseWebRuntimeConfig>;

function extraFirebaseWeb(): ExtraFirebaseWeb {
  const extra = Constants.expoConfig?.extra as { firebaseWeb?: ExtraFirebaseWeb } | undefined;
  return extra?.firebaseWeb ?? {};
}

function pickString(...candidates: (string | undefined)[]): string {
  for (const c of candidates) {
    const t = c?.trim();
    if (t) return t;
  }
  return '';
}

let remoteConfigPromise: Promise<Partial<FirebaseWebRuntimeConfig>> | null = null;
let remoteConfigCache: Partial<FirebaseWebRuntimeConfig> | null = null;

async function fetchRemoteFirebaseWebConfig(): Promise<Partial<FirebaseWebRuntimeConfig>> {
  if (remoteConfigCache) return remoteConfigCache;
  if (!remoteConfigPromise) {
    remoteConfigPromise = (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('firebase-web-config', {
          body: {},
        });
        if (error || !data || typeof data !== 'object') {
          return {};
        }
        const row = data as Record<string, unknown>;
        const partial: Partial<FirebaseWebRuntimeConfig> = {};
        const appId = pickString(typeof row.appId === 'string' ? row.appId : undefined);
        const vapidKey = pickString(typeof row.vapidKey === 'string' ? row.vapidKey : undefined);
        if (appId) partial.appId = appId;
        if (vapidKey) partial.vapidKey = vapidKey;
        remoteConfigCache = partial;
        return partial;
      } catch {
        return {};
      }
    })();
  }
  return remoteConfigPromise;
}

/** Sync config: env → app.config extra → google-services defaults. */
export function readFirebaseWebConfigSync(): FirebaseWebRuntimeConfig {
  const extra = extraFirebaseWeb();
  const projectId = pickString(
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    extra.projectId,
    FIREBASE_WEB_DEFAULTS.projectId,
  );

  return {
    apiKey: pickString(
      process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
      extra.apiKey,
      FIREBASE_WEB_DEFAULTS.apiKey,
    ),
    authDomain: pickString(
      process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      extra.authDomain,
      FIREBASE_WEB_DEFAULTS.authDomain,
      projectId ? `${projectId}.firebaseapp.com` : '',
    ),
    projectId,
    storageBucket: pickString(
      process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
      extra.storageBucket,
      FIREBASE_WEB_DEFAULTS.storageBucket,
      projectId ? `${projectId}.firebasestorage.app` : '',
    ),
    messagingSenderId: pickString(
      process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      extra.messagingSenderId,
      FIREBASE_WEB_DEFAULTS.messagingSenderId,
    ),
    appId: pickString(process.env.EXPO_PUBLIC_FIREBASE_APP_ID, extra.appId),
    vapidKey: pickString(process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY, extra.vapidKey),
  };
}

export async function resolveFirebaseWebConfig(): Promise<FirebaseWebRuntimeConfig | null> {
  const base = readFirebaseWebConfigSync();
  if (!base.apiKey || !base.projectId || !base.messagingSenderId) {
    return null;
  }

  let appId = base.appId;
  let vapidKey = base.vapidKey;

  if (!appId || !vapidKey) {
    const remote = await fetchRemoteFirebaseWebConfig();
    if (!appId) appId = remote.appId ?? '';
    if (!vapidKey) vapidKey = remote.vapidKey ?? '';
  }

  if (!appId) {
    return null;
  }

  return { ...base, appId, vapidKey };
}

export function readFirebaseVapidKey(): string | null {
  const key = readFirebaseWebConfigSync().vapidKey;
  return key || null;
}

export async function isFirebaseWebConfigured(): Promise<boolean> {
  const cfg = await resolveFirebaseWebConfig();
  return cfg != null;
}
