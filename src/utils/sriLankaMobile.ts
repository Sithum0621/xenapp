/**
 * Sri Lanka mobile numbers only (not landline).
 * Local format after normalization: 7XXXXXXXX (9 digits, leading 7).
 * User may enter 0712345678, 712345678, +94712345678, or 94712345678.
 */

export const SL_MOBILE_LOCAL_RE = /^7\d{8}$/;

export type SriLankaMobileValidation =
  | { ok: true; e164: string; displayLocal: string }
  | { ok: false; reason: 'empty' | 'incomplete' | 'invalid' };

/** Strip to national mobile digits (7XXXXXXXX) or return null if not a mobile. */
export function normalizeSriLankaMobileDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  let local = digits;
  if (local.startsWith('0094')) local = local.slice(4);
  if (local.startsWith('94')) local = local.slice(2);
  if (local.startsWith('0')) local = local.slice(1);

  if (!SL_MOBILE_LOCAL_RE.test(local)) return null;
  return local;
}

/** Strict validation — returns E.164 (+947XXXXXXXX) when valid. */
export function parseSriLankaMobile(raw: string): string | null {
  const local = normalizeSriLankaMobileDigits(raw);
  return local ? `+94${local}` : null;
}

export function isValidSriLankaMobile(raw: string): boolean {
  return parseSriLankaMobile(raw) !== null;
}

/** Canonical local display: 07XXXXXXXX */
export function formatSriLankaMobileDisplay(raw: string): string | null {
  const local = normalizeSriLankaMobileDigits(raw);
  return local ? `0${local}` : null;
}

/**
 * Restrict keystrokes while typing: digits only, max 10 with leading 0 or max 9 without.
 * Also accepts pasted +94 / 94 prefixes.
 */
export function sanitizeSriLankaMobileInput(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('0094')) digits = digits.slice(4);
  else if (digits.startsWith('94')) digits = digits.slice(2);

  if (digits.startsWith('0')) {
    return digits.slice(0, 10);
  }

  return digits.slice(0, 9);
}

/** Distinguish incomplete (still typing) vs invalid (wrong pattern). */
export function validateSriLankaMobile(raw: string): SriLankaMobileValidation {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };

  const parsed = parseSriLankaMobile(trimmed);
  if (parsed) {
    return {
      ok: true,
      e164: parsed,
      displayLocal: formatSriLankaMobileDisplay(trimmed) ?? `0${parsed.slice(-9)}`,
    };
  }

  const digits = sanitizeSriLankaMobileInput(trimmed);
  if (!digits) return { ok: false, reason: 'empty' };

  let local = digits;
  if (local.startsWith('0')) local = local.slice(1);

  const expectedLen = digits.startsWith('0') ? 10 : 9;
  if (digits.length < expectedLen) {
    return { ok: false, reason: 'incomplete' };
  }

  return { ok: false, reason: 'invalid' };
}

export function isIncompleteSriLankaMobile(raw: string): boolean {
  const result = validateSriLankaMobile(raw);
  return !result.ok && result.reason === 'incomplete';
}
