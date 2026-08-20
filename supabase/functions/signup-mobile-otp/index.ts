/**
 * Signup mobile OTP: send / verify before public registration.
 *
 * Delivery (first match):
 * 1. SMSlenz.lk SMS (SMSLENZ_USER_ID + SMSLENZ_API_KEY) — preferred for Sri Lanka
 * 2. Twilio SMS if TWILIO_* secrets are set
 * 3. Else Resend email to `email` (code verifies the mobile number)
 * 4. Else ALLOW_CONSOLE_OTP=true → log code (local/dev)
 *
 * Secrets: OTP_AES_KEY, SMSLENZ_*, optional TWILIO_*, RESEND_API_KEY, ALLOW_CONSOLE_OTP
 * Deploy: `supabase functions deploy signup-mobile-otp --no-verify-jwt`
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { sendHtmlEmailViaResend } from '../_shared/resendMail.ts';
import { openJson, sealJson } from '../_shared/otpSeal.ts';
import { sendSmsViaSmsLenz } from '../_shared/smsLenz.ts';

const OTP_TTL_MS = 10 * 60 * 1000;
const VERIFIED_TTL_MS = 30 * 60 * 1000;
const OTP_SEND_WINDOW_SECONDS = 900;
const OTP_SEND_MAX = 5;
const OTP_SEND_COOLDOWN_SECONDS = 45;
const APP_NAME = 'MyTuition';

function json(req: Request, body: Record<string, unknown>, status = 200) {
  return jsonResponse(req, body, status);
}

function parseSriLankaMobile(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  let local = digits;
  if (local.startsWith('0094')) local = local.slice(4);
  if (local.startsWith('94')) local = local.slice(2);
  if (local.startsWith('0')) local = local.slice(1);
  if (!/^7\d{8}$/.test(local)) return null;
  return `+94${local}`;
}

function randomSixDigit(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
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

function otpSmsBody(code: string): string {
  return `${APP_NAME} verification code: ${code}. Valid for 10 minutes. Do not share this code.`;
}

async function sendTwilioSms(toE164: string, body: string): Promise<boolean> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim();
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim();
  const from = Deno.env.get('TWILIO_FROM')?.trim();
  if (!sid || !token || !from) return false;

  const auth = btoa(`${sid}:${token}`);
  const form = new URLSearchParams({ To: toE164, From: from, Body: body });
  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    },
  );
  return resp.ok;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return optionsResponse(req);
  }

  let body: {
    action?: string;
    mobile_number?: string;
    email?: string;
    otp_challenge?: string;
    code?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'invalid_json' }, 400);
  }

  const action = typeof body.action === 'string' ? body.action.trim() : '';

  try {
    if (action === 'send') {
      const phone = parseSriLankaMobile(typeof body.mobile_number === 'string' ? body.mobile_number : '');
      if (!phone) return json(req, { error: 'invalid_mobile' }, 400);

      const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
      const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
      if (!supabaseUrl || !serviceRole) {
        return json(req, { error: 'server_misconfigured' }, 500);
      }
      const admin = createClient(supabaseUrl, serviceRole, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: rate, error: rateErr } = await admin.rpc('otp_send_rate_consume', {
        p_phone: phone,
        p_window_seconds: OTP_SEND_WINDOW_SECONDS,
        p_max_sends: OTP_SEND_MAX,
        p_cooldown_seconds: OTP_SEND_COOLDOWN_SECONDS,
      });
      if (rateErr) {
        return json(req, { error: 'otp_rate_unavailable' }, 503);
      }
      if (rate === 'otp_cooldown' || rate === 'otp_rate_limited' || rate === 'invalid_mobile') {
        return json(req, { error: rate }, 429);
      }
      if (rate !== 'ok') {
        return json(req, { error: 'otp_rate_unavailable' }, 503);
      }

      const emailRaw = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const emailOk = Boolean(emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw));

      const code = randomSixDigit();
      const codeHash = await sha256Hex(`${phone}:${code}`);
      const exp = Date.now() + OTP_TTL_MS;
      const otp_challenge = await sealJson({ kind: 'signup_otp', phone, codeHash, exp });

      const smsText = otpSmsBody(code);

      const smsLenz = await sendSmsViaSmsLenz(phone, smsText);
      let smsOk = smsLenz.ok;
      let delivery: 'sms' | 'email' | 'console' = 'sms';

      if (!smsOk) {
        smsOk = await sendTwilioSms(phone, smsText);
      }

      let emailed = false;
      if (!smsOk && emailOk) {
        const mail = await sendHtmlEmailViaResend({
          to: emailRaw,
          subject: `${APP_NAME} mobile verification code`,
          html: `<p>Your ${APP_NAME} verification code for <strong>${phone}</strong> is:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
<p>This code expires in 10 minutes.</p>`,
        });
        emailed = mail.ok;
        if (emailed) delivery = 'email';
      }

      const allowConsole = Deno.env.get('ALLOW_CONSOLE_OTP')?.trim() === 'true';
      if (!smsOk && !emailed) {
        if (allowConsole) {
          console.log(`[signup-mobile-otp] ${phone} code=${code}`);
          delivery = 'console';
        } else if (!emailOk) {
          return json(req, {
            error: 'otp_delivery_failed',
            detail: smsLenz.ok === false ? smsLenz.reason : 'no_delivery_channel',
          }, 502);
        } else {
          return json(req, { error: 'otp_delivery_failed' }, 502);
        }
      } else if (smsOk) {
        delivery = 'sms';
      }

      return json(req, {
        ok: true,
        otp_challenge,
        delivery,
      });
    }

    if (action === 'verify') {
      const challenge = typeof body.otp_challenge === 'string' ? body.otp_challenge.trim() : '';
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      if (!challenge || !/^\d{6}$/.test(code)) {
        return json(req, { error: 'invalid_code' }, 400);
      }

      const opened = await openJson(challenge);
      if (!opened || opened.kind !== 'signup_otp') {
        return json(req, { error: 'challenge_invalid' }, 400);
      }
      const phone = typeof opened.phone === 'string' ? opened.phone : '';
      const codeHash = typeof opened.codeHash === 'string' ? opened.codeHash : '';
      const exp = typeof opened.exp === 'number' ? opened.exp : 0;
      if (!phone || !codeHash || Date.now() > exp) {
        return json(req, { error: 'challenge_expired' }, 400);
      }

      const attemptHash = await sha256Hex(`${phone}:${code}`);
      if (!timingSafeEqualHex(attemptHash, codeHash)) {
        return json(req, { error: 'wrong_code' }, 401);
      }

      const verified_token = await sealJson({
        kind: 'signup_mobile_verified',
        phone,
        exp: Date.now() + VERIFIED_TTL_MS,
      });
      return json(req, { ok: true, verified_token, phone });
    }

    return json(req, { error: 'unknown_action' }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('OTP_AES_KEY')) {
      return json(req, { error: 'server_misconfigured', detail: msg }, 500);
    }
    return json(req, { error: 'server_error', detail: msg }, 500);
  }
});
