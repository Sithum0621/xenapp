/**
 * Edge Function: password login + optional email OTP.
 *
 * - `superadmin` and `admin`: sends one-time code to email (session completes after verify).
 * - `teacher` and `parent_student`: returns tokens immediately (no email OTP).
 *
 * Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (set by Supabase),
 * OTP_AES_KEY (base64-encoded 32-byte AES key),
 * Mail: set secret RESEND_API_KEY (Resend dashboard → API Keys). Sending uses the Resend SDK
 * in `../_shared/resendMail.ts`, which reads RESEND_API_KEY only from the Edge runtime env.
 * Expo `.env` is not available to deployed functions—use Dashboard → Edge Functions → Secrets,
 * or for local dev: `supabase functions serve superadmin-mfa --no-verify-jwt --env-file .env`
 * from the repo root (or any file that defines RESEND_API_KEY).
 * Set RESEND_FROM_EMAIL to override the default sender.
 * For local-only testing without DNS, set RESEND_FROM_EMAIL to the Resend test sender
 * or use ALLOW_CONSOLE_OTP=true to log OTP in function logs.
 *
 * Deploy: `supabase functions deploy superadmin-mfa --no-verify-jwt`
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { sendHtmlEmailViaResend } from '../_shared/resendMail.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

function getAesKey(): CryptoKey | Promise<CryptoKey> {
  const b64 = Deno.env.get('OTP_AES_KEY');
  if (!b64?.trim()) throw new Error('OTP_AES_KEY secret missing (base64-encoded 32-byte key)');
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

async function encryptRefresh(refreshToken: string): Promise<string> {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(refreshToken),
  );
  const ct = new Uint8Array(ciphertext);
  const bundle = new Uint8Array(iv.byteLength + ct.byteLength);
  bundle.set(iv, 0);
  bundle.set(ct, iv.byteLength);
  return bytesToBase64(bundle);
}

async function decryptRefresh(encB64: string): Promise<string> {
  const key = await getAesKey();
  const bundle = base64ToBytes(encB64);
  const iv = bundle.slice(0, 12);
  const ciphertext = bundle.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plain);
}

function randomSixDigit(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
}

async function sendOtpEmail(to: string, code: string): Promise<{ ok: boolean; skippedReason?: string }> {
  const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();

  if (!resendKey) {
    if (Deno.env.get('ALLOW_CONSOLE_OTP') === 'true') {
      console.warn(`[superadmin-mfa DEV] OTP for ${to}: ${code}`);
      return { ok: true, skippedReason: 'console_otp' };
    }
    return { ok: false, skippedReason: 'missing_resend' };
  }

  const html = `<p style="font-family:sans-serif;font-size:16px;color:#0f172a;">Your verification code is:</p>
        <p style="font-family:monospace;font-size:28px;font-weight:700;color:#123B7A;letter-spacing:6px;">${code}</p>
        <p style="font-family:sans-serif;font-size:13px;color:#64748b;">This code expires in 10 minutes. If you did not request this, ignore this email.</p>`;

  const sent = await sendHtmlEmailViaResend({
    to,
    subject: 'XEN — your verification code',
    html,
  });

  if (!sent.ok) {
    return { ok: false, skippedReason: sent.skippedReason };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl?.trim() || !anonKey?.trim() || !serviceRole?.trim()) {
    return json({ error: 'server_misconfigured' }, 500);
  }

  let body: { action?: string; email?: string; password?: string; challenge_id?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  if (body.action === 'start') {
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      return json({ error: 'email_password_required' }, 400);
    }

    const tokenRes = await fetch(
      `${supabaseUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ email, password }),
      },
    );

    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      user?: { id?: string; email?: string };
      error_description?: string;
      msg?: string;
    };

    if (
      !tokenRes.ok ||
      !tokenJson.refresh_token ||
      !tokenJson.access_token ||
      !tokenJson.user?.id
    ) {
      return json({ error: 'invalid_credentials', detail: tokenJson.error_description ?? tokenJson.msg }, 401);
    }

    const userId = tokenJson.user.id;

    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (profileErr || profile?.role == null) {
      return json({ error: 'profile_missing' }, 403);
    }

    const role = profile.role as string;

    if (role !== 'superadmin' && role !== 'admin') {
      return json({
        skip_otp: true,
        access_token: tokenJson.access_token,
        refresh_token: tokenJson.refresh_token,
      });
    }

    await admin.from('superadmin_mfa_challenges').delete().eq('user_id', userId);

    const challengeId = crypto.randomUUID();
    const code = randomSixDigit();
    const otpHash = await sha256Hex(`${challengeId}:${code}`);
    let refreshEncrypted: string;
    try {
      refreshEncrypted = await encryptRefresh(tokenJson.refresh_token);
    } catch (e) {
      console.error('[superadmin-mfa] encrypt failed', e);
      return json({ error: 'encrypt_failed' }, 500);
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insErr } = await admin.from('superadmin_mfa_challenges').insert({
      id: challengeId,
      user_id: userId,
      otp_hash: otpHash,
      refresh_encrypted: refreshEncrypted,
      expires_at: expiresAt,
    });

    if (insErr) {
      console.error('[superadmin-mfa] insert challenge', insErr);
      return json({ error: 'challenge_create_failed' }, 500);
    }

    const sent = await sendOtpEmail(email, code);
    if (!sent.ok) {
      await admin.from('superadmin_mfa_challenges').delete().eq('id', challengeId);
      return json({ error: 'email_send_failed', detail: sent.skippedReason ?? 'unknown' }, 503);
    }

    return json({ challenge_id: challengeId });
  }

  if (body.action === 'verify') {
    const challengeId =
      typeof body.challenge_id === 'string' ? body.challenge_id.trim() : '';
    const code = typeof body.code === 'string' ? body.code.trim().replace(/\s/g, '') : '';

    if (!challengeId || code.length !== 6 || !/^\d{6}$/.test(code)) {
      return json({ error: 'invalid_challenge_or_code' }, 400);
    }

    const { data: row, error: selErr } = await admin
      .from('superadmin_mfa_challenges')
      .select('id,user_id,otp_hash,refresh_encrypted,expires_at')
      .eq('id', challengeId)
      .maybeSingle();

    if (selErr || !row) {
      return json({ error: 'challenge_not_found' }, 401);
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await admin.from('superadmin_mfa_challenges').delete().eq('id', challengeId);
      return json({ error: 'challenge_expired' }, 401);
    }

    const expectedHash = await sha256Hex(`${challengeId}:${code}`);
    if (!timingSafeEqualHex(row.otp_hash, expectedHash)) {
      return json({ error: 'invalid_code' }, 401);
    }

    let refreshToken: string;
    try {
      refreshToken = await decryptRefresh(row.refresh_encrypted as string);
    } catch (e) {
      console.error('[superadmin-mfa] decrypt failed', e);
      await admin.from('superadmin_mfa_challenges').delete().eq('id', challengeId);
      return json({ error: 'decrypt_failed' }, 500);
    }

    await admin.from('superadmin_mfa_challenges').delete().eq('id', challengeId);

    const refreshRes = await fetch(
      `${supabaseUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
    );

    const refreshJson = (await refreshRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      error_description?: string;
    };

    if (!refreshRes.ok || !refreshJson.access_token || !refreshJson.refresh_token) {
      console.error('[superadmin-mfa] refresh exchange failed', refreshJson);
      return json({ error: 'session_exchange_failed', detail: refreshJson.error_description }, 401);
    }

    return json({
      access_token: refreshJson.access_token,
      refresh_token: refreshJson.refresh_token,
    });
  }

  return json({ error: 'unknown_action' }, 400);
});
