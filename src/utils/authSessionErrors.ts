/** True when persisted Supabase tokens are invalid or revoked server-side. */
export function isStaleAuthSessionError(error: unknown): boolean {
  if (!error) return false;
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);
  return /refresh token/i.test(message) || /invalid.*token/i.test(message);
}
