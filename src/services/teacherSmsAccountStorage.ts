import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/src/services/supabaseClient';

const storageKey = (userId: string) => `teacher_sms_account:v1:${userId}`;

/** Starter SMS credits granted when an SMS account is created. */
export const DEFAULT_TEACHER_SMS_CREDITS = 50;
/** Previous mistaken default — treat as unset and reset to 50. */
const LEGACY_DEFAULT_TEACHER_SMS_CREDITS = 50_000;
/** Warn when remaining credits reach this amount. */
export const SMS_CREDIT_LOW_THRESHOLD = 10;
/** 1 SMS = 1 credit; 1 credit = Rs. 1. */
export const SMS_CREDIT_PRICE_CENTS = 100;
export const MAX_SMS_CREDIT_PURCHASE = 100_000;

export type TeacherSmsAccount = {
  /** Display / sender name for SMS. */
  smsName: string;
  createdAt: string;
  creditBalance: number;
  attendanceSmsEnabled: boolean;
  paymentsSmsEnabled: boolean;
};

function parseCreditBalance(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  return null;
}

function parseBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function normalizeCredits(stored: number | null): number {
  if (stored == null || stored === LEGACY_DEFAULT_TEACHER_SMS_CREDITS) {
    return DEFAULT_TEACHER_SMS_CREDITS;
  }
  return stored;
}

function accountFromUnknown(raw: unknown): TeacherSmsAccount | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = raw as Record<string, unknown>;
  const smsName =
    typeof parsed.smsName === 'string'
      ? parsed.smsName.trim()
      : typeof parsed.sms_name === 'string'
        ? parsed.sms_name.trim()
        : '';
  if (!smsName) return null;
  const storedCredits = parseCreditBalance(
    parsed.creditBalance ?? parsed.credit_balance,
  );
  return {
    smsName,
    createdAt:
      typeof parsed.createdAt === 'string'
        ? parsed.createdAt
        : typeof parsed.created_at === 'string'
          ? parsed.created_at
          : new Date().toISOString(),
    creditBalance: normalizeCredits(storedCredits),
    attendanceSmsEnabled: parseBool(
      parsed.attendanceSmsEnabled ?? parsed.attendance_sms_enabled,
      true,
    ),
    paymentsSmsEnabled: parseBool(
      parsed.paymentsSmsEnabled ?? parsed.payments_sms_enabled,
      true,
    ),
  };
}

async function persistAccount(userId: string, account: TeacherSmsAccount): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(account));
}

function rpcMissing(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    msg.includes('could not find the function') ||
    msg.includes('does not exist')
  );
}

export async function loadTeacherSmsAccount(): Promise<{
  ok: true;
  account: TeacherSmsAccount | null;
} | { ok: false; error: string }> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) {
    return { ok: false, error: error?.message ?? 'Not signed in.' };
  }
  const userId = data.user.id;
  try {
    const remote = await supabase.rpc('teacher_sms_get_account');
    if (!remote.error && remote.data) {
      const account = accountFromUnknown(remote.data);
      if (account) {
        await persistAccount(userId, account);
        return { ok: true, account };
      }
    }
    if (remote.error && !rpcMissing(remote.error)) {
      return { ok: false, error: remote.error.message };
    }

    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return { ok: true, account: null };
    const local = accountFromUnknown(JSON.parse(raw) as unknown);
    if (!local) return { ok: true, account: null };

    if (!remote.error) {
      const created = await supabase.rpc('teacher_sms_create_account', {
        p_sms_name: local.smsName,
      });
      if (!created.error && created.data) {
        let account = accountFromUnknown(created.data) ?? local;
        const channels = await supabase.rpc('teacher_sms_set_channels', {
          p_attendance_enabled: local.attendanceSmsEnabled,
          p_payments_enabled: local.paymentsSmsEnabled,
        });
        if (!channels.error && channels.data) {
          account = accountFromUnknown(channels.data) ?? account;
        }
        await persistAccount(userId, account);
        return { ok: true, account };
      }
    }

    await persistAccount(userId, local);
    return { ok: true, account: local };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createTeacherSmsAccount(smsName: string): Promise<{
  ok: true;
  account: TeacherSmsAccount;
} | { ok: false; error: string }> {
  const name = smsName.trim();
  if (!name) {
    return { ok: false, error: 'SMS name is required.' };
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) {
    return { ok: false, error: error?.message ?? 'Not signed in.' };
  }
  const remote = await supabase.rpc('teacher_sms_create_account', { p_sms_name: name });
  if (!remote.error && remote.data) {
    const account = accountFromUnknown(remote.data);
    if (account) {
      await persistAccount(data.user.id, account);
      return { ok: true, account };
    }
  }
  if (remote.error && !rpcMissing(remote.error)) {
    return { ok: false, error: remote.error.message };
  }
  const account: TeacherSmsAccount = {
    smsName: name,
    createdAt: new Date().toISOString(),
    creditBalance: DEFAULT_TEACHER_SMS_CREDITS,
    attendanceSmsEnabled: true,
    paymentsSmsEnabled: true,
  };
  try {
    await persistAccount(data.user.id, account);
    return { ok: true, account };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setTeacherSmsChannels(input: {
  attendanceSmsEnabled: boolean;
  paymentsSmsEnabled: boolean;
}): Promise<{
  ok: true;
  account: TeacherSmsAccount;
} | { ok: false; error: string }> {
  const loaded = await loadTeacherSmsAccount();
  if (!loaded.ok) return loaded;
  if (!loaded.account) {
    return { ok: false, error: 'Create an SMS account first.' };
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) {
    return { ok: false, error: error?.message ?? 'Not signed in.' };
  }
  const remote = await supabase.rpc('teacher_sms_set_channels', {
    p_attendance_enabled: input.attendanceSmsEnabled,
    p_payments_enabled: input.paymentsSmsEnabled,
  });
  if (!remote.error && remote.data) {
    const account = accountFromUnknown(remote.data);
    if (account) {
      await persistAccount(data.user.id, account);
      return { ok: true, account };
    }
  }
  if (remote.error && !rpcMissing(remote.error)) {
    return { ok: false, error: remote.error.message };
  }
  const account: TeacherSmsAccount = {
    ...loaded.account,
    attendanceSmsEnabled: input.attendanceSmsEnabled,
    paymentsSmsEnabled: input.paymentsSmsEnabled,
  };
  try {
    await persistAccount(data.user.id, account);
    return { ok: true, account };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function addTeacherSmsCredits(credits: number): Promise<{
  ok: true;
  account: TeacherSmsAccount;
} | { ok: false; error: string }> {
  const add = Math.round(credits);
  if (!Number.isFinite(add) || add <= 0) {
    return { ok: false, error: 'Enter a valid credit amount.' };
  }
  const loaded = await loadTeacherSmsAccount();
  if (!loaded.ok) return loaded;
  if (!loaded.account) {
    return { ok: false, error: 'Create an SMS account first.' };
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) {
    return { ok: false, error: error?.message ?? 'Not signed in.' };
  }
  const remote = await supabase.rpc('teacher_sms_add_credits', { p_credits: add });
  if (!remote.error && remote.data) {
    const account = accountFromUnknown(remote.data);
    if (account) {
      await persistAccount(data.user.id, account);
      return { ok: true, account };
    }
  }
  if (remote.error && !rpcMissing(remote.error)) {
    return { ok: false, error: remote.error.message };
  }
  const account: TeacherSmsAccount = {
    ...loaded.account,
    creditBalance: loaded.account.creditBalance + add,
  };
  try {
    await persistAccount(data.user.id, account);
    return { ok: true, account };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function parseSmsCreditPurchaseInput(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, '');
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_SMS_CREDIT_PURCHASE) return null;
  if (String(n) !== trimmed) return null;
  return n;
}
