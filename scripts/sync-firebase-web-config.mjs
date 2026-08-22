/**
 * Writes public/firebase-web-config.json from google-services.json (local)
 * or baked-in defaults (Vercel CI). Optionally merges web appId from Supabase edge function.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

/** Same public keys as src/constants/firebaseWebDefaults.ts (safe to commit). */
const DEFAULT_CONFIG = {
  apiKey: 'AIzaSyAB0f4aRXEYx0zbt6DtsB-GOHdTCTKLhKU',
  authDomain: 'xenv0001.firebaseapp.com',
  projectId: 'xenv0001',
  storageBucket: 'xenv0001.firebasestorage.app',
  messagingSenderId: '840326303130',
  appId: '',
};

function readGoogleServices() {
  const gsPath = path.join(root, 'google-services.json');
  if (!fs.existsSync(gsPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const gs = JSON.parse(fs.readFileSync(gsPath, 'utf8'));
    const client = gs.client?.[0];
    const projectId = gs.project_info?.project_id ?? '';
    return {
      apiKey: client?.api_key?.[0]?.current_key ?? DEFAULT_CONFIG.apiKey,
      authDomain: projectId ? `${projectId}.firebaseapp.com` : DEFAULT_CONFIG.authDomain,
      projectId: projectId || DEFAULT_CONFIG.projectId,
      storageBucket: gs.project_info?.storage_bucket ?? DEFAULT_CONFIG.storageBucket,
      messagingSenderId: gs.project_info?.project_number ?? DEFAULT_CONFIG.messagingSenderId,
      appId: '',
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function readExistingConfig() {
  const outPath = path.join(root, 'public', 'firebase-web-config.json');
  if (!fs.existsSync(outPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(outPath, 'utf8'));
  } catch {
    return null;
  }
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

function envValue(key, env) {
  return process.env[key] || env[key] || '';
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
  const existing = readExistingConfig();

  const appIdFromEnv = envValue('EXPO_PUBLIC_FIREBASE_APP_ID', env);
  if (appIdFromEnv) {
    config.appId = appIdFromEnv;
  } else if (existing?.appId) {
    config.appId = existing.appId;
  } else {
    const supabaseUrl = envValue('EXPO_PUBLIC_SUPABASE_URL', env);
    const anonKey = envValue('EXPO_PUBLIC_SUPABASE_ANON_KEY', env);
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
  console.log(
    '[sync-firebase-web-config] wrote',
    outPath,
    config.appId ? `(appId: ${config.appId})` : '(appId pending — deploy firebase-web-config edge function)',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
