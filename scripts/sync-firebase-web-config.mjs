/**
 * Writes public/firebase-web-config.json from google-services.json.
 * Optionally merges web appId from Supabase edge function when .env has URL + anon key.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function readGoogleServices() {
  const gsPath = path.join(root, 'google-services.json');
  const gs = JSON.parse(fs.readFileSync(gsPath, 'utf8'));
  const client = gs.client?.[0];
  const projectId = gs.project_info?.project_id ?? '';
  return {
    apiKey: client?.api_key?.[0]?.current_key ?? '',
    authDomain: projectId ? `${projectId}.firebaseapp.com` : '',
    projectId,
    storageBucket: gs.project_info?.storage_bucket ?? '',
    messagingSenderId: gs.project_info?.project_number ?? '',
    appId: '',
  };
}

function readDotEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

async function fetchRemoteAppId(supabaseUrl, anonKey) {
  const url = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/firebase-web-config`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: '{}',
  });
  if (!res.ok) return '';
  const data = await res.json();
  return typeof data.appId === 'string' ? data.appId : '';
}

async function main() {
  const config = readGoogleServices();
  const env = readDotEnv();

  const appIdFromEnv =
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID || env.EXPO_PUBLIC_FIREBASE_APP_ID || '';
  if (appIdFromEnv) {
    config.appId = appIdFromEnv;
  } else {
    const supabaseUrl =
      process.env.EXPO_PUBLIC_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '';
    const anonKey =
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
    if (supabaseUrl && anonKey) {
      try {
        const remoteAppId = await fetchRemoteAppId(supabaseUrl, anonKey);
        if (remoteAppId) config.appId = remoteAppId;
      } catch (err) {
        console.warn('[sync-firebase-web-config] remote appId fetch failed:', err.message);
      }
    }
  }

  const outPath = path.join(root, 'public', 'firebase-web-config.json');
  fs.writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  console.log('[sync-firebase-web-config] wrote', outPath, config.appId ? `(appId: ${config.appId})` : '(appId pending — deploy firebase-web-config edge function)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
