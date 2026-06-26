const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UUID_IN_TEXT_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

/** Strip control chars USB/Bluetooth scanners often append (CR/LF, etc.). */
export function sanitizeScanInput(raw: string): string {
  return raw.replace(/[\x00-\x1F\x7F]/g, '').trim();
}

/** QR payload for the digital class card (profiles.id / auth user id). */
export function buildClassCardQrPayload(studentUserId: string): string {
  const trimmed = studentUserId.trim();
  if (!UUID_RE.test(trimmed)) {
    throw new Error('Student user id must be a UUID for class card QR');
  }
  return trimmed.toLowerCase();
}

/** Normalize scanned / pasted payload to a profiles.id UUID, or null if invalid. */
export function parseXenIdFromScan(raw: string): string | null {
  const trimmed = sanitizeScanInput(raw);
  if (!trimmed) return null;

  if (UUID_RE.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const embedded = trimmed.match(UUID_IN_TEXT_RE);
  if (embedded) {
    return embedded[0].toLowerCase();
  }

  try {
    const j = JSON.parse(trimmed) as Record<string, unknown>;
    const candidates = [j.xen_id, j.wovello_id, j.user_id, j.userId, j.id];
    for (const c of candidates) {
      if (typeof c === 'string' && UUID_RE.test(c.trim())) {
        return c.trim().toLowerCase();
      }
    }
  } catch {
    /* not JSON */
  }

  try {
    const u = new URL(trimmed);
    const q =
      u.searchParams.get('id') ??
      u.searchParams.get('user_id') ??
      u.searchParams.get('xen_id') ??
      u.searchParams.get('wovello_id');
    if (q && UUID_RE.test(q.trim())) {
      return q.trim().toLowerCase();
    }
  } catch {
    /* not a URL */
  }

  return null;
}
