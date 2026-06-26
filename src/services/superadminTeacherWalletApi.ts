import { supabase } from '@/src/services/supabaseClient';

export type TeacherWalletManualTopupRow = {
  id: string;
  teacherUserId: string;
  teacherName: string;
  teacherEmail: string;
  amountCents: number;
  slipPath: string;
  depositorName: string | null;
  depositorIdNumber: string | null;
  note: string | null;
  createdAt: string;
};

function asString(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function parseRow(value: unknown): TeacherWalletManualTopupRow | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const id = asString(r.id);
  if (!id) return null;
  return {
    id,
    teacherUserId: asString(r.teacher_user_id),
    teacherName: asString(r.teacher_name) || 'Teacher',
    teacherEmail: asString(r.teacher_email),
    amountCents: asNumber(r.amount_cents),
    slipPath: asString(r.slip_path),
    depositorName: asString(r.depositor_name) || null,
    depositorIdNumber: asString(r.depositor_id_number) || null,
    note: asString(r.note) || null,
    createdAt: asString(r.created_at),
  };
}

export async function fetchPendingTeacherWalletTopupsCount(): Promise<{
  count: number;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase.rpc('superadmin_count_pending_teacher_wallet_topups');
    if (error) return { count: 0, error: error.message };
    return { count: asNumber(data), error: null };
  } catch (e) {
    return { count: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchPendingTeacherWalletTopups(
  limit = 50,
): Promise<{ items: TeacherWalletManualTopupRow[]; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('superadmin_list_teacher_wallet_manual_topups', {
      p_limit: limit,
    });
    if (error) return { items: [], error: error.message };
    if (!data || typeof data !== 'object') {
      return { items: [], error: 'Invalid response.' };
    }
    const raw = (data as Record<string, unknown>).items;
    const items = Array.isArray(raw)
      ? raw.map(parseRow).filter((r): r is TeacherWalletManualTopupRow => r != null)
      : [];
    return { items, error: null };
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function approveTeacherWalletManualTopup(
  requestId: string,
  transactionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const txn = transactionId.trim();
  if (!requestId.trim() || txn.length < 4) {
    return { ok: false, error: 'invalid_transaction_id' };
  }
  try {
    const { error } = await supabase.rpc('teacher_wallet_approve_manual_topup', {
      p_request_id: requestId,
      p_transaction_id: txn,
    });
    if (error) {
      if (error.message.includes('duplicate_transaction_id')) {
        return { ok: false, error: 'duplicate_transaction_id' };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function rejectTeacherWalletManualTopup(
  requestId: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!requestId.trim()) {
    return { ok: false, error: 'Invalid request.' };
  }
  try {
    const { error } = await supabase.rpc('teacher_wallet_reject_manual_topup', {
      p_request_id: requestId,
      p_reason: reason ?? null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createTeacherWalletSlipSignedUrl(
  slipPath: string,
  expiresInSeconds = 3600,
): Promise<{ url: string | null; error: string | null }> {
  const path = slipPath.trim();
  if (!path) return { url: null, error: 'Missing slip path.' };
  try {
    const { data, error } = await supabase.storage
      .from('teacher-wallet-slips')
      .createSignedUrl(path, expiresInSeconds);
    if (error) return { url: null, error: error.message };
    return { url: data?.signedUrl ?? null, error: null };
  } catch (e) {
    return { url: null, error: e instanceof Error ? e.message : String(e) };
  }
}
