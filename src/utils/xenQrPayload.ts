const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UUID_IN_TEXT_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

/** Strip control chars USB/Bluetooth scanners often append (CR/LF, etc.). */
export function sanitizeScanInput(raw: string): string {
  return raw.replace(/[\x00-\x1F\x7F]/g, "").trim();
}

/** QR payload for the digital class card (profiles.id / auth user id). */
export function buildClassCardQrPayload(studentUserId: string): string {
  const trimmed = studentUserId.trim();
  if (!UUID_RE.test(trimmed)) {
    throw new Error("Student user id must be a UUID for class card QR");
  }
  return trimmed.toLowerCase();
}

// ---------------------------------------------------------------------------
// Class card QR v1: student + lecture group in one payload.
// Student UUID comes FIRST so legacy scanners that grab the first embedded
// UUID (teacher attendance / payments) keep resolving the student correctly.
// ---------------------------------------------------------------------------

const CLASS_CARD_PREFIX = "MTCARD:v1:";

/** Public issued-card token prefix. Teacher UUID is never in the QR URL. */
export const ISSUED_CARD_TOKEN_PREFIX = "mtc1_";

export function isIssuedClassCardToken(value: string): boolean {
  return /^mtc1_[A-Za-z0-9]{20}$/.test(value.trim());
}

export function parseIssuedClassCardToken(raw: string): string | null {
  const trimmed = sanitizeScanInput(raw);
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    const card = u.searchParams.get("card");
    if (card && isIssuedClassCardToken(card)) return card.trim();
  } catch {
    /* not a URL */
  }
  if (isIssuedClassCardToken(trimmed)) return trimmed;
  const embedded = trimmed.match(/mtc1_[A-Za-z0-9]{20}/);
  if (embedded && isIssuedClassCardToken(embedded[0])) return embedded[0];
  return null;
}

export function buildIssuedClassCardQrUrl(token: string): string {
  const t = token.trim();
  if (!isIssuedClassCardToken(t)) {
    throw new Error("Invalid issued class card token");
  }
  return `https://mytuition.wovello.com/welcome?card=${encodeURIComponent(t)}`;
}

export type ClassCardScanPayload = {
  /** Set for legacy student-ID QRs. Null for teacher-issued `mtc1_` cards until claimed. */
  studentUserId: string | null;
  /** Null for legacy cards that only encode the student UUID. */
  lectureGroupId: string | null;
  /** Teacher-issued class card token (`mtc1_…`), when present. */
  issuedCardToken: string | null;
};

/** QR payload for a teacher-issued class card (student + class group). */
export function buildClassCardGroupQrPayload(
  studentUserId: string,
  lectureGroupId: string,
): string {
  const student = studentUserId.trim();
  const group = lectureGroupId.trim();
  if (!UUID_RE.test(student) || !UUID_RE.test(group)) {
    throw new Error("Class card QR requires student and group UUIDs");
  }
  return `${CLASS_CARD_PREFIX}${student.toLowerCase()}:${group.toLowerCase()}`;
}

/**
 * Parse a scanned class card payload.
 * Accepts the MTCARD v1 format (student + group) and any legacy payload that
 * `parseXenIdFromScan` understands (bare UUID, JSON, URL — group is null).
 */
export function parseClassCardScan(raw: string): ClassCardScanPayload | null {
  const trimmed = sanitizeScanInput(raw);
  if (!trimmed) return null;

  const issuedCardToken = parseIssuedClassCardToken(trimmed);
  if (issuedCardToken) {
    return { studentUserId: null, lectureGroupId: null, issuedCardToken };
  }

  if (trimmed.toUpperCase().startsWith(CLASS_CARD_PREFIX.toUpperCase())) {
    const rest = trimmed.slice(CLASS_CARD_PREFIX.length);
    const [studentPart, groupPart] = rest.split(":");
    const student = studentPart?.trim() ?? "";
    const group = groupPart?.trim() ?? "";
    if (UUID_RE.test(student)) {
      return {
        studentUserId: student.toLowerCase(),
        lectureGroupId: UUID_RE.test(group) ? group.toLowerCase() : null,
        issuedCardToken: null,
      };
    }
    return null;
  }

  const studentUserId = parseXenIdFromScan(trimmed);
  if (!studentUserId) return null;
  return { studentUserId, lectureGroupId: null, issuedCardToken: null };
}

/** Identifier to send to `resolve_student_user_id_for_attendance` after a card scan. */
export function attendanceScanIdentifier(raw: string): string | null {
  const card = parseClassCardScan(raw);
  if (card?.issuedCardToken) return card.issuedCardToken;
  if (card?.studentUserId) return card.studentUserId;
  return null;
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
      if (typeof c === "string" && UUID_RE.test(c.trim())) {
        return c.trim().toLowerCase();
      }
    }
  } catch {
    /* not JSON */
  }

  try {
    const u = new URL(trimmed);
    const q =
      u.searchParams.get("id") ??
      u.searchParams.get("user_id") ??
      u.searchParams.get("xen_id") ??
      u.searchParams.get("wovello_id");
    if (q && UUID_RE.test(q.trim())) {
      return q.trim().toLowerCase();
    }
  } catch {
    /* not a URL */
  }

  return null;
}
