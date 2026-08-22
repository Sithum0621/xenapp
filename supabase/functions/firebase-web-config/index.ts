/**
 * Returns Firebase web push config for PWA clients.
 * Public keys from google-services.json; web appId resolved via Firebase Management API.
 * Optional secret FIREBASE_WEB_VAPID_KEY (Cloud Messaging → Web Push public key).
 */
import { GoogleAuth } from 'npm:google-auth-library@9.14.2';

import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { parseFirebaseServiceAccountJson } from '../_shared/fcmAdmin.ts';

const PROJECT_ID = 'xenv0001';
const PUBLIC_CONFIG = {
  apiKey: 'AIzaSyAB0f4aRXEYx0zbt6DtsB-GOHdTCTKLhKU',
  authDomain: 'xenv0001.firebaseapp.com',
  projectId: PROJECT_ID,
  storageBucket: 'xenv0001.firebasestorage.app',
  messagingSenderId: '840326303130',
};

async function firebaseAccessToken(): Promise<string | null> {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON')?.trim();
  if (!raw) return null;

  try {
    const credentials = parseFirebaseServiceAccountJson(raw);
    const auth = new GoogleAuth({
      credentials: credentials as Record<string, unknown>,
      scopes: ['https://www.googleapis.com/auth/firebase'],
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    return token.token ?? null;
  } catch {
    return null;
  }
}

async function resolveWebAppId(accessToken: string): Promise<string | null> {
  const listUrl = `https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/webApps`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (listRes.ok) {
    const listJson = (await listRes.json()) as { apps?: { appId?: string }[] };
    const existing = listJson.apps?.[0]?.appId;
    if (existing) return existing;
  }

  const createRes = await fetch(listUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ displayName: 'MyTuition Web' }),
  });

  if (!createRes.ok) return null;
  const created = (await createRes.json()) as { appId?: string };
  return created.appId ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return optionsResponse(req);
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse(req, { error: 'method_not_allowed' }, 405);
  }

  const vapidKey = Deno.env.get('FIREBASE_WEB_VAPID_KEY')?.trim() ?? '';
  let appId = Deno.env.get('FIREBASE_WEB_APP_ID')?.trim() ?? '';

  if (!appId) {
    const accessToken = await firebaseAccessToken();
    if (accessToken) {
      appId = (await resolveWebAppId(accessToken)) ?? '';
    }
  }

  return jsonResponse(req, {
    ...PUBLIC_CONFIG,
    appId,
    vapidKey,
    ok: Boolean(appId),
  });
});
