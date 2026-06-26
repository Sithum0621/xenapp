import { supabase } from '@/src/services/supabaseClient';

export type TempPasswordStatus = {
  isTemporary: boolean;
  isExpired: boolean;
  expiresAt: Date | null;
  passwordCreatedAt: Date | null;
};

/**
 * Reads the current user's temp-password lifecycle from the `temp_password_status` RPC.
 * Returns `{ isTemporary: false }` when the profile has no temporary password set.
 * Errors are swallowed and reported as "not temporary" so a transient lookup hiccup never
 * blocks an otherwise-legit login.
 */
export async function fetchTempPasswordStatus(): Promise<TempPasswordStatus> {
  const { data, error } = await supabase.rpc('temp_password_status');
  if (error || !data || typeof data !== 'object') {
    return { isTemporary: false, isExpired: false, expiresAt: null, passwordCreatedAt: null };
  }

  const row = data as Record<string, unknown>;
  const isTemporary = row.is_temporary === true;
  const expiresAtIso = typeof row.expires_at === 'string' ? row.expires_at : null;
  const passwordCreatedAtIso = typeof row.password_created_at === 'string' ? row.password_created_at : null;
  const expiresAt = expiresAtIso ? new Date(expiresAtIso) : null;
  const isExpired =
    typeof row.is_expired === 'boolean'
      ? row.is_expired
      : Boolean(expiresAt && expiresAt.getTime() <= Date.now());

  return {
    isTemporary,
    isExpired,
    expiresAt,
    passwordCreatedAt: passwordCreatedAtIso ? new Date(passwordCreatedAtIso) : null,
  };
}

/**
 * Called immediately after a successful supabase.auth.updateUser({ password }) so the server
 * can drop the temp expiry and refresh `password_created_at`.
 */
export async function confirmPasswordReset(): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('confirm_password_reset');
  return error ? { ok: false, error: error.message } : { ok: true };
}
