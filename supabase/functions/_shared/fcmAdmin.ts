/**
 * Firebase Cloud Messaging (FCM) helpers for Supabase Edge Functions (Deno).
 * Credentials come from the FIREBASE_SERVICE_ACCOUNT_JSON secret — never from source control.
 */
import admin from 'npm:firebase-admin@12.7.0';
import type { messaging } from 'npm:firebase-admin@12.7.0';

/** Must match firebase.json and client ensureAndroidNotificationChannel(). */
export const FCM_ANDROID_CHANNEL_ID = 'xen_notifications';

let firebaseApp: admin.app.App | null = null;

/** Tolerates BOM / outer quotes from CLI env-file uploads (common on Windows). */
export function parseFirebaseServiceAccountJson(raw: string): admin.ServiceAccount {
  let text = raw.trim();
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1).trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }

  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must be a service account object.');
  }

  const account = parsed as admin.ServiceAccount;
  if (typeof account.project_id !== 'string' || typeof account.private_key !== 'string') {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing project_id or private_key.');
  }

  return account;
}

export function getFirebaseAdminApp(): admin.app.App {
  if (firebaseApp) return firebaseApp;

  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!raw?.trim()) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured on the Edge Function.');
  }

  const serviceAccount = parseFirebaseServiceAccountJson(raw);

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return firebaseApp;
}

/** FCM `data` payload values must be strings. */
export function fcmStringData(data: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    out[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return out;
}

export type PushSendResult = {
  token: string;
  success: boolean;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
  tokenInvalid: boolean;
};

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export function isInvalidFcmTokenError(code: string | undefined): boolean {
  if (!code) return false;
  return INVALID_TOKEN_CODES.has(code);
}

export async function sendPushToTokens(input: {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<PushSendResult[]> {
  if (input.tokens.length === 0) return [];

  getFirebaseAdminApp();

  const dataPayload: Record<string, string> = {
    title: input.title,
    body: input.body,
    ...fcmStringData(input.data),
  };

  const accent = dataPayload.accent;
  const androidColor = accent === 'danger' ? '#B42318' : undefined;

  // High-priority FCM with `notification` for system tray when backgrounded/killed.
  // `data` duplicates title/body so the client can show MessagingStyle in foreground.
  const message: messaging.MulticastMessage = {
    tokens: input.tokens,
    notification: {
      title: input.title,
      body: input.body,
    },
    data: dataPayload,
    android: {
      priority: 'high',
      ttl: 86400000,
      notification: {
        channelId: FCM_ANDROID_CHANNEL_ID,
        priority: 'high',
        defaultSound: true,
        visibility: 'public',
        ...(androidColor ? { color: androidColor } : {}),
      },
    },
    apns: {
      headers: {
        'apns-priority': '10',
      },
      payload: {
        aps: {
          alert: {
            title: input.title,
            body: input.body,
          },
          sound: 'default',
          contentAvailable: true,
        },
      },
    },
  };

  const batch = await admin.messaging().sendEachForMulticast(message);

  return batch.responses.map((response, index) => {
    const token = input.tokens[index] ?? '';
    if (response.success) {
      return {
        token,
        success: true,
        messageId: response.messageId,
        tokenInvalid: false,
      };
    }

    const errorCode = response.error?.code;
    return {
      token,
      success: false,
      errorCode,
      errorMessage: response.error?.message,
      tokenInvalid: isInvalidFcmTokenError(errorCode),
    };
  });
}
