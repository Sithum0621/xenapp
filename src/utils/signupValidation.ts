import { isValidEmailAddress, normalizeValidEmail } from '@/src/utils/emailValidation';
import { isValidNic, normalizeNicInput } from '@/src/utils/nic';
import { isValidSriLankaMobile, sanitizeSriLankaMobileInput } from '@/src/utils/sriLankaMobile';

export type SignupFieldKey = 'fullName' | 'mobileNumber' | 'nicNumber' | 'email' | 'password' | 'terms';

export type SignupFieldErrors = Partial<Record<SignupFieldKey, string>>;

const FULL_NAME_MIN = 2;
const FULL_NAME_MAX = 120;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 128;
const HAS_LETTER_RE = /\p{L}/u;

export function sanitizeMobileInput(raw: string): string {
  return sanitizeSriLankaMobileInput(raw);
}

export function sanitizeNicInput(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase().slice(0, 14);
}

export function isValidSignupFullName(raw: string): boolean {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < FULL_NAME_MIN || name.length > FULL_NAME_MAX) return false;
  return HAS_LETTER_RE.test(name);
}

export function validateParentSignupFields(input: {
  fullName: string;
  mobileNumber: string;
  nicNumber: string;
  email: string;
  password: string;
  acceptTerms: boolean;
}): SignupFieldErrors {
  const errors: SignupFieldErrors = {};

  const fullName = input.fullName.trim();
  if (!fullName) {
    errors.fullName = 'signup.errors.fullNameRequired';
  } else if (!isValidSignupFullName(fullName)) {
    errors.fullName = 'signup.errors.fullNameInvalid';
  }

  const mobile = input.mobileNumber.trim();
  if (!mobile) {
    errors.mobileNumber = 'signup.errors.mobileRequired';
  } else if (!isValidSriLankaMobile(mobile)) {
    errors.mobileNumber = 'signup.errors.mobileInvalid';
  }

  const nicNorm = normalizeNicInput(input.nicNumber);
  if (!nicNorm) {
    errors.nicNumber = 'signup.errors.nicRequired';
  } else if (!isValidNic(nicNorm)) {
    errors.nicNumber = 'signup.errors.nicInvalid';
  }

  const emailRaw = input.email.trim();
  if (emailRaw && !isValidEmailAddress(emailRaw)) {
    errors.email = 'signup.errors.emailInvalid';
  }

  if (!input.password.trim()) {
    errors.password = 'signup.errors.passwordRequired';
  } else if (input.password.length < PASSWORD_MIN) {
    errors.password = 'signup.errors.passwordMin';
  } else if (input.password.length > PASSWORD_MAX) {
    errors.password = 'signup.errors.passwordMax';
  }

  if (!input.acceptTerms) {
    errors.terms = 'signup.errors.termsRequired';
  }

  return errors;
}

export function validateTeacherSignupFields(input: {
  fullName: string;
  nicNumber: string;
  email: string;
  password: string;
  acceptTerms: boolean;
  exemptFromNic: boolean;
}): SignupFieldErrors {
  const errors: SignupFieldErrors = {};

  const fullName = input.fullName.trim();
  if (!fullName) {
    errors.fullName = 'signup.errors.fullNameRequired';
  } else if (!isValidSignupFullName(fullName)) {
    errors.fullName = 'signup.errors.fullNameInvalid';
  }

  if (!input.exemptFromNic) {
    const nicNorm = normalizeNicInput(input.nicNumber);
    if (!nicNorm) {
      errors.nicNumber = 'signup.errors.nicRequired';
    } else if (!isValidNic(nicNorm)) {
      errors.nicNumber = 'signup.errors.nicInvalid';
    }
  }

  const emailNorm = normalizeValidEmail(input.email);
  if (!input.email.trim()) {
    errors.email = 'signup.errors.emailRequired';
  } else if (!emailNorm) {
    errors.email = 'signup.errors.emailInvalid';
  }

  if (!input.password.trim()) {
    errors.password = 'signup.errors.passwordRequired';
  } else if (input.password.length < PASSWORD_MIN) {
    errors.password = 'signup.errors.passwordMin';
  } else if (input.password.length > PASSWORD_MAX) {
    errors.password = 'signup.errors.passwordMax';
  }

  if (!input.acceptTerms) {
    errors.terms = 'signup.errors.termsRequired';
  }

  return errors;
}

export function firstSignupFieldError(errors: SignupFieldErrors): string | null {
  const order: SignupFieldKey[] = [
    'fullName',
    'mobileNumber',
    'nicNumber',
    'email',
    'password',
    'terms',
  ];
  for (const key of order) {
    const messageKey = errors[key];
    if (messageKey) return messageKey;
  }
  return null;
}
