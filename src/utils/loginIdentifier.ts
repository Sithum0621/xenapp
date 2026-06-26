/**
 * Shared parser for login / register identifiers.
 *
 * Accepts:
 *   - Email:      anything containing '@' that matches a basic email shape.
 *   - SL mobile:  07XXXXXXXX, 7XXXXXXXX, 947XXXXXXXX, +947XXXXXXXX, with spaces / dashes ignored.
 *
 * Normalises every Sri Lanka mobile to E.164: `+947XXXXXXXX` (Supabase auth requires E.164).
 *
 * Mirrors the Deno-side `parseUsername` in `supabase/functions/teacher-student-enroll/index.ts`
 * so the same value the teacher used at registration also works at login.
 */

import {
  isValidSriLankaMobile,
  parseSriLankaMobile,
} from '@/src/utils/sriLankaMobile';

export type ParsedLoginIdentifier =
  | { kind: 'email'; email: string }
  | { kind: 'phone'; phone: string };

export { isValidSriLankaMobile, parseSriLankaMobile };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Matches allocated IDs: XEN-2026-0003 (min 4-digit sequence). */
const XEN_STUDENT_ID_RE = /^xen-\d{4}-\d{4,}$/i;

export const XEN_STUDENT_ID_PREFIX = 'XEN-';

/** Mask XEN ID as the teacher types: XEN- → year (4 digits) → - → sequence. */
export function formatXenStudentIdInput(raw: string): string {
  const digits = raw.toUpperCase().replace(/^XEN-?/, '').replace(/\D/g, '');
  const year = digits.slice(0, 4);
  const sequence = digits.slice(4, 12);

  if (year.length === 0) return XEN_STUDENT_ID_PREFIX;
  if (year.length < 4) return `${XEN_STUDENT_ID_PREFIX}${year}`;
  if (sequence.length === 0) return `${XEN_STUDENT_ID_PREFIX}${year}-`;
  return `${XEN_STUDENT_ID_PREFIX}${year}-${sequence}`;
}

export function parseXenStudentId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || !XEN_STUDENT_ID_RE.test(trimmed)) return null;
  const parts = trimmed.split('-');
  if (parts.length !== 3) return null;
  return `XEN-${parts[1]}-${parts[2]}`;
}

export function parseLoginIdentifier(raw: string): ParsedLoginIdentifier | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase();
    if (!EMAIL_RE.test(email)) return null;
    return { kind: 'email', email };
  }

  const phone = parseSriLankaMobile(trimmed);
  return phone ? { kind: 'phone', phone } : null;
}

export function looksLikePhoneAttempt(raw: string): boolean {
  const t = raw.trim();
  return t.length > 0 && !t.includes('@');
}

/**
 * Deterministic synthetic email for phone-only logins.
 * Keeps `+94…@phone.wovello.app` in sync between client and edge function so phone identifiers
 * resolve to the same email-backed Supabase Auth user regardless of project's phone-provider settings.
 *
 * IMPORTANT: domain MUST match `SYNTHETIC_PHONE_EMAIL_DOMAIN` in
 *            `supabase/functions/teacher-student-enroll/index.ts`.
 */
export const SYNTHETIC_PHONE_EMAIL_DOMAIN = 'phone.wovello.app';

export function syntheticEmailFromPhoneE164(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, '');
  return `wovello-${digits}@${SYNTHETIC_PHONE_EMAIL_DOMAIN}`;
}

/** Resolve any identifier (email or SL mobile) to the email that Supabase Auth knows. */
export function resolveIdentifierToAuthEmail(parsed: ParsedLoginIdentifier): string {
  return parsed.kind === 'email' ? parsed.email : syntheticEmailFromPhoneE164(parsed.phone);
}
