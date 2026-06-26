/** RFC 5322-inspired local part (case-insensitive). */
const LOCAL_PART_RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;

/** Domain with at least one dot and a valid TLD label. */
const DOMAIN_PART_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const TLD_RE = /^[a-z]{2,63}$/i;

/** Trim and lowercase for case-insensitive comparison and storage. */
export function normalizeEmailInput(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Strict email format check. Validation is case-insensitive; callers should
 * store `normalizeEmailInput` output when persisting.
 */
export function isValidEmailAddress(raw: string): boolean {
  const email = normalizeEmailInput(raw);
  if (!email || email.length > 254) return false;

  const at = email.lastIndexOf('@');
  if (at <= 0 || at !== email.indexOf('@') || at >= email.length - 1) return false;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  if (local.length > 64 || domain.length > 253) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false;
  if (/\s/.test(email)) return false;

  if (!LOCAL_PART_RE.test(local) || !DOMAIN_PART_RE.test(domain)) return false;

  const tld = domain.split('.').pop();
  return Boolean(tld && TLD_RE.test(tld));
}

/** Returns normalized lowercase email when valid, otherwise null. */
export function normalizeValidEmail(raw: string): string | null {
  const normalized = normalizeEmailInput(raw);
  return isValidEmailAddress(normalized) ? normalized : null;
}
