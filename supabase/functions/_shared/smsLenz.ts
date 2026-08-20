/**
 * SMSlenz.lk SMS gateway (Sri Lanka).
 * Docs: https://smslenz.lk/developers/api
 *
 * SECURITY:
 * - Credentials live ONLY in Supabase Edge Function secrets (never EXPO_PUBLIC_*, never app code, never git).
 * - Always POST JSON body — never GET (keys must not appear in URLs/logs).
 * - Do not log api_key / user_id / full request bodies.
 *
 * Secrets:
 * - SMSLENZ_USER_ID
 * - SMSLENZ_API_KEY
 * - SMSLENZ_SENDER_ID (approved mask, e.g. MyTuition — case sensitive; SMSlenzDEMO for testing)
 * - SMSLENZ_API_BASE_URL (optional; dashboard value is https://smslenz.lk/api)
 */

export type SmsLenzSendResult =
  | { ok: true }
  | { ok: false; reason: string; detail?: string };

/** Dashboard "API Base URL" ends with /api → send path is `/send-sms`. */
const DEFAULT_API_BASE = 'https://smslenz.lk/api';
/** SMSlenz docs: message max 621 chars (older notes said 1500 — use the stricter limit). */
const MAX_MESSAGE_CHARS = 621;

function getConfig(): {
  userId: string;
  apiKey: string;
  senderId: string;
  baseUrl: string;
} | null {
  const userId = Deno.env.get('SMSLENZ_USER_ID')?.trim();
  const apiKey = Deno.env.get('SMSLENZ_API_KEY')?.trim();
  const senderId = Deno.env.get('SMSLENZ_SENDER_ID')?.trim() || 'MyTuition';
  let baseUrl = (Deno.env.get('SMSLENZ_API_BASE_URL')?.trim() || DEFAULT_API_BASE).replace(/\/+$/, '');

  // Accept either https://smslenz.lk or https://smslenz.lk/api
  if (baseUrl === 'https://smslenz.lk' || baseUrl === 'http://smslenz.lk') {
    baseUrl = `${baseUrl}/api`;
  }

  if (!userId || !apiKey) return null;
  return { userId, apiKey, senderId, baseUrl };
}

/** Returns true when SMSlenz credentials are configured. */
export function isSmsLenzConfigured(): boolean {
  return getConfig() !== null;
}

/** Normalize a Sri Lankan mobile number to `+94XXXXXXXXX`, or null. */
export function toSmsLenzContact(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  let local = digits;
  if (local.startsWith('0094')) local = local.slice(4);
  if (local.startsWith('94')) local = local.slice(2);
  if (local.startsWith('0')) local = local.slice(1);
  if (!/^7\d{8}$/.test(local)) return null;
  return `+94${local}`;
}

/**
 * Send one SMS via SMSlenz `POST …/send-sms`.
 * `contactE164` must be like `+94761234567`.
 */
export async function sendSmsViaSmsLenz(
  contactE164: string,
  message: string,
): Promise<SmsLenzSendResult> {
  const cfg = getConfig();
  if (!cfg) {
    return { ok: false, reason: 'smslenz_not_configured' };
  }

  const contact = contactE164.trim();
  if (!/^\+94\d{9}$/.test(contact)) {
    return { ok: false, reason: 'invalid_contact', detail: 'bad_phone_format' };
  }

  const url = `${cfg.baseUrl}/send-sms`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        user_id: cfg.userId,
        api_key: cfg.apiKey,
        sender_id: cfg.senderId,
        contact,
        message: message.slice(0, MAX_MESSAGE_CHARS),
      }),
    });

    let payload: Record<string, unknown> = {};
    try {
      payload = (await resp.json()) as Record<string, unknown>;
    } catch {
      /* non-JSON */
    }

    if (resp.ok && payload.success === true) {
      return { ok: true };
    }

    // Never echo credentials; only a short gateway message / status.
    const detail =
      typeof payload.message === 'string'
        ? payload.message.slice(0, 200)
        : typeof payload.error === 'string'
          ? payload.error.slice(0, 200)
          : `http_${resp.status}`;
    console.error('[smslenz] send failed', resp.status, detail);
    return { ok: false, reason: 'smslenz_send_failed', detail };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[smslenz] network error', detail.slice(0, 200));
    return { ok: false, reason: 'smslenz_network_error', detail: 'network' };
  }
}
