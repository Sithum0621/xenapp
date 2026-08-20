/** Shared AES-GCM seal helpers for signup / MFA OTP tokens. Requires OTP_AES_KEY. */

export function getAesKey(): Promise<CryptoKey> {
  const b64 = Deno.env.get('OTP_AES_KEY');
  if (!b64?.trim()) throw new Error('OTP_AES_KEY secret missing');
  const raw = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
  if (raw.byteLength !== 32) throw new Error('OTP_AES_KEY must decode to 32 bytes');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sealJson(payload: Record<string, unknown>): Promise<string> {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const ct = new Uint8Array(ciphertext);
  const bundle = new Uint8Array(iv.byteLength + ct.byteLength);
  bundle.set(iv, 0);
  bundle.set(ct, iv.byteLength);
  return bytesToBase64(bundle);
}

export async function openJson(encB64: string): Promise<Record<string, unknown> | null> {
  try {
    const key = await getAesKey();
    const bundle = base64ToBytes(encB64);
    const iv = bundle.slice(0, 12);
    const ciphertext = bundle.slice(12);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    const parsed = JSON.parse(new TextDecoder().decode(plain));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function assertSignupMobileVerifiedAsync(
  token: string,
  phoneE164: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token.trim()) return { ok: false, error: 'mobile_not_verified' };
  const opened = await openJson(token.trim());
  if (!opened || opened.kind !== 'signup_mobile_verified') {
    return { ok: false, error: 'mobile_not_verified' };
  }
  const phone = typeof opened.phone === 'string' ? opened.phone : '';
  const exp = typeof opened.exp === 'number' ? opened.exp : 0;
  if (phone !== phoneE164 || Date.now() > exp) {
    return { ok: false, error: 'mobile_not_verified' };
  }
  return { ok: true };
}
