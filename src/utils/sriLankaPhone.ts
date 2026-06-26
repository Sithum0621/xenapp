/**
 * Sri Lanka mobile and landline parsing / validation.
 * Mobile: 07XXXXXXXX (canonical local display).
 * Landline: 0 + area code + subscriber (e.g. 011XXXXXXX).
 */

export type ParsedSriLankaPhone =
  | { kind: 'mobile'; e164: string; display: string }
  | { kind: 'landline'; e164: string; display: string };

const SL_MOBILE_LOCAL_RE = /^7\d{8}$/;

/** Area codes without leading 0 (Colombo 11, Kandy 81, etc.). */
const SL_LANDLINE_AREAS = [
  '11',
  '21',
  '31',
  '32',
  '33',
  '34',
  '35',
  '36',
  '37',
  '38',
  '41',
  '45',
  '47',
  '51',
  '52',
  '54',
  '55',
  '57',
  '63',
  '65',
  '66',
  '67',
  '81',
  '91',
] as const;

function stripToNationalDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0094')) digits = digits.slice(4);
  if (digits.startsWith('94')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

/** Accept SL mobile or landline; returns canonical local display or null. */
export function parseSriLankaPhone(raw: string): ParsedSriLankaPhone | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const national = stripToNationalDigits(trimmed);
  if (!national) return null;

  if (SL_MOBILE_LOCAL_RE.test(national)) {
    return {
      kind: 'mobile',
      e164: `+94${national}`,
      display: `0${national}`,
    };
  }

  for (const area of SL_LANDLINE_AREAS) {
    if (!national.startsWith(area)) continue;
    const subscriber = national.slice(area.length);
    if (subscriber.length < 6 || subscriber.length > 7 || !/^\d+$/.test(subscriber)) continue;
    const local = `0${area}${subscriber}`;
    return {
      kind: 'landline',
      e164: `+94${area}${subscriber}`,
      display: local,
    };
  }

  return null;
}

export function isValidSriLankaPhone(raw: string): boolean {
  return parseSriLankaPhone(raw) !== null;
}
