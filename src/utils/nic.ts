/** Sri Lanka NIC: 9 digits + V or X (old), or 12 digits (new). */

export function normalizeNicInput(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

export function isValidNic(normalized: string): boolean {
  if (normalized.length === 12) {
    return /^[0-9]{12}$/.test(normalized);
  }
  if (normalized.length === 10) {
    return /^[0-9]{9}[VX]$/.test(normalized);
  }
  return false;
}
