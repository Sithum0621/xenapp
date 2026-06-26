import { supabase } from '@/src/services/supabaseClient';

export type AppLockStatus = {
  enabled: boolean;
  pinIsSet: boolean;
};

export async function appLockGetStatus(): Promise<{ status: AppLockStatus | null; error: string | null }> {
  const { data, error } = await supabase.rpc('app_lock_get_status');

  if (error) {
    return { status: null, error: error.message };
  }

  const raw = data as unknown;
  let row: { enabled?: boolean; pin_is_set?: boolean } | undefined;
  if (Array.isArray(raw)) {
    row = raw[0] as { enabled?: boolean; pin_is_set?: boolean };
  } else if (raw && typeof raw === 'object') {
    row = raw as { enabled?: boolean; pin_is_set?: boolean };
  }
  if (!row) {
    return { status: { enabled: false, pinIsSet: false }, error: null };
  }

  return {
    status: {
      enabled: Boolean(row.enabled),
      pinIsSet: Boolean(row.pin_is_set),
    },
    error: null,
  };
}

export async function appLockSetEnabled(enabled: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('app_lock_set_enabled', { p_enabled: enabled });
  return { error: error?.message ?? null };
}

export async function appLockSetPin(pin: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('app_lock_set_pin', { p_pin: pin });
  return { error: error?.message ?? null };
}

export async function appLockChangePin(currentPin: string, newPin: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('app_lock_change_pin', {
    p_current_pin: currentPin,
    p_new_pin: newPin,
  });
  return { error: error?.message ?? null };
}

export async function appLockVerifyPin(pin: string): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('app_lock_verify_pin', { p_pin: pin });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: data === true, error: null };
}
