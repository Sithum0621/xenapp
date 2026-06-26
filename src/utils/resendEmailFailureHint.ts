import type { TFunction } from 'i18next';

/** Maps Resend skip reasons from edge functions to existing auth hint keys. */
export function resendSkipReasonHintKey(skipReason?: string | null): string | null {
  switch (skipReason) {
    case 'missing_resend':
      return 'auth.errors.mfaEmailFailedHintMissingResend';
    case 'resend_unverified_domain':
      return 'auth.errors.mfaEmailFailedHintResendUnverifiedDomain';
    case 'resend_testing_domain':
      return 'auth.errors.mfaEmailFailedHintResendTestingDomain';
    case 'resend_http_error':
      return 'auth.errors.mfaEmailFailedHintResendRejected';
    default:
      return skipReason ? 'auth.errors.mfaEmailFailedHintResendRejected' : null;
  }
}

export function buildResendFailureMessage(
  t: TFunction,
  skipReason?: string | null,
  baseKey = 'auth.errors.mfaEmailFailed',
): string {
  const hintKey = resendSkipReasonHintKey(skipReason);
  const base = t(baseKey);
  return hintKey ? `${base}\n\n${t(hintKey)}` : base;
}
