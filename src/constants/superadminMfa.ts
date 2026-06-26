/** Must match Edge Function `superadmin-mfa` and migration bypass rule for multi-device access. */
export const DESIGNATED_SUPERADMIN_EMAIL =
  process.env.EXPO_PUBLIC_DESIGNATED_SUPERADMIN_EMAIL?.trim() ?? '';

export function isDesignatedSuperadminMfaEmail(email: string): boolean {
  if (!DESIGNATED_SUPERADMIN_EMAIL) return false;
  return email.trim().toLowerCase() === DESIGNATED_SUPERADMIN_EMAIL.toLowerCase();
}
