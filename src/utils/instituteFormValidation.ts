import { isValidEmailAddress, normalizeEmailInput, normalizeValidEmail } from '@/src/utils/emailValidation';
import { parseSriLankaPhone } from '@/src/utils/sriLankaPhone';

export type InstituteFormValues = {
  name: string;
  addressLine1: string;
  addressLine2: string;
  email: string;
  contactNumber: string;
  notes: string;
};

export type InstituteFormErrorKey =
  | 'institutesNameRequired'
  | 'instituteAddressLine1Required'
  | 'instituteAddressLine1Invalid'
  | 'instituteAddressLine2Invalid'
  | 'instituteEmailRequired'
  | 'instituteEmailInvalid'
  | 'instituteContactRequired'
  | 'instituteContactInvalid'
  | 'instituteNotesTooLong';

const ADDRESS_MIN = 3;
const ADDRESS_MAX = 200;
const NOTES_MAX = 500;

function isValidAddressLine(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= ADDRESS_MIN && trimmed.length <= ADDRESS_MAX;
}

/** Returns an i18n key for the first validation error, or null when valid. */
export function validateInstituteForm(values: InstituteFormValues): InstituteFormErrorKey | null {
  if (!values.name.trim()) return 'institutesNameRequired';

  const line1 = values.addressLine1.trim();
  if (!line1) return 'instituteAddressLine1Required';
  if (!isValidAddressLine(line1)) return 'instituteAddressLine1Invalid';

  const line2 = values.addressLine2.trim();
  if (line2 && !isValidAddressLine(line2)) return 'instituteAddressLine2Invalid';

  const email = values.email.trim();
  if (!email) return 'instituteEmailRequired';
  if (!isValidEmailAddress(email)) return 'instituteEmailInvalid';

  const contact = values.contactNumber.trim();
  if (!contact) return 'instituteContactRequired';
  if (!parseSriLankaPhone(contact)) return 'instituteContactInvalid';

  if (values.notes.trim().length > NOTES_MAX) return 'instituteNotesTooLong';

  return null;
}

export function instituteFormToRpcPayload(values: InstituteFormValues): {
  name: string;
  address_line1: string;
  address_line2: string | null;
  email: string;
  contact_number: string;
  notes: string | null;
} {
  const phone = parseSriLankaPhone(values.contactNumber.trim());
  const email = normalizeValidEmail(values.email);
  return {
    name: values.name.trim(),
    address_line1: values.addressLine1.trim(),
    address_line2: values.addressLine2.trim() || null,
    email: email ?? normalizeEmailInput(values.email),
    contact_number: phone?.display ?? values.contactNumber.trim(),
    notes: values.notes.trim() || null,
  };
}

export type InstituteRecordLike = {
  name?: string | null;
  address?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  email?: string | null;
  contact_number?: string | null;
  contact_info?: string | null;
  notes?: string | null;
};

/** Hydrate form state from a DB row (supports legacy address / contact_info columns). */
export function instituteRecordToFormValues(row: InstituteRecordLike): InstituteFormValues {
  let addressLine1 = row.address_line1?.trim() ?? '';
  let addressLine2 = row.address_line2?.trim() ?? '';

  if (!addressLine1 && row.address?.trim()) {
    const parts = row.address.split(/\r?\n/);
    addressLine1 = parts[0]?.trim() ?? '';
    addressLine2 = parts.slice(1).join('\n').trim();
  }

  return {
    name: row.name?.trim() ?? '',
    addressLine1,
    addressLine2,
    email: row.email?.trim() ?? '',
    contactNumber: row.contact_number?.trim() ?? '',
    notes: row.notes?.trim() ?? row.contact_info?.trim() ?? '',
  };
}

export function instituteListMetaLine(row: InstituteRecordLike & { id?: string }): string {
  const line1 = row.address_line1?.trim() || row.address?.split(/\r?\n/)[0]?.trim();
  const email = row.email?.trim();
  const phone = row.contact_number?.trim();
  const parts = [line1, email, phone].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(' · ') : '—';
}

export function mapInstituteRpcError(message: string): InstituteFormErrorKey | 'instituteNotFound' | null {
  const m = message.toLowerCase();
  if (m.includes('name_required')) return 'institutesNameRequired';
  if (m.includes('address_line1_required')) return 'instituteAddressLine1Required';
  if (m.includes('address_invalid')) return 'instituteAddressLine1Invalid';
  if (m.includes('email_required')) return 'instituteEmailRequired';
  if (m.includes('email_invalid')) return 'instituteEmailInvalid';
  if (m.includes('contact_required')) return 'instituteContactRequired';
  if (m.includes('contact_invalid')) return 'instituteContactInvalid';
  if (m.includes('notes_too_long')) return 'instituteNotesTooLong';
  if (m.includes('institute_not_found')) return 'instituteNotFound';
  return null;
}

export const EMPTY_INSTITUTE_FORM: InstituteFormValues = {
  name: '',
  addressLine1: '',
  addressLine2: '',
  email: '',
  contactNumber: '',
  notes: '',
};
