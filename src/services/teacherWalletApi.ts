import { supabase } from '@/src/services/supabaseClient';

export type TeacherWalletTxKind = 'top_up' | 'bank_transfer' | 'payment_received' | 'adjustment';

export type TeacherWalletTxMethod = 'manual' | 'payhere' | null;

export type TeacherWalletTxStatus = 'completed' | 'pending';

export type TeacherWalletTransaction = {
  id: string;
  kind: TeacherWalletTxKind;
  amountCents: number;
  balanceAfterCents: number | null;
  note: string | null;
  createdAt: string;
  status: TeacherWalletTxStatus;
  method: TeacherWalletTxMethod;
};

export type TeacherWalletOverview = {
  teacherUserId: string;
  balanceCents: number;
  currency: string;
  transactions: TeacherWalletTransaction[];
};

export type TeacherWalletOverviewResult =
  | { ok: true; overview: TeacherWalletOverview }
  | { ok: false; error: string };

export type TeacherWalletMutationResult =
  | { ok: true; balanceCents: number; amountCents: number }
  | { ok: false; error: string };

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

function parseTxKind(value: unknown): TeacherWalletTxKind {
  const k = asString(value);
  if (
    k === 'top_up' ||
    k === 'bank_transfer' ||
    k === 'payment_received' ||
    k === 'adjustment'
  ) {
    return k;
  }
  return 'adjustment';
}

function parseTransaction(row: unknown): TeacherWalletTransaction | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const id = asString(r.id);
  if (!id) return null;
  const statusRaw = asString(r.status);
  const status: TeacherWalletTxStatus = statusRaw === 'pending' ? 'pending' : 'completed';
  const methodRaw = asString(r.method);
  const method: TeacherWalletTxMethod =
    methodRaw === 'manual' || methodRaw === 'payhere' ? methodRaw : null;
  const balanceRaw = r.balance_after_cents;
  const balanceAfterCents =
    balanceRaw === null || balanceRaw === undefined
      ? null
      : asNumber(balanceRaw);

  return {
    id,
    kind: parseTxKind(r.kind),
    amountCents: asNumber(r.amount_cents),
    balanceAfterCents,
    note: asString(r.note) || null,
    createdAt: asString(r.created_at),
    status,
    method,
  };
}

function parseOverview(data: unknown): TeacherWalletOverview | null {
  if (!data || typeof data !== 'object') return null;
  const r = data as Record<string, unknown>;
  const txsRaw = Array.isArray(r.transactions) ? r.transactions : [];
  const transactions = txsRaw
    .map(parseTransaction)
    .filter((t): t is TeacherWalletTransaction => t != null);

  return {
    teacherUserId: asString(r.teacher_user_id),
    balanceCents: asNumber(r.balance_cents),
    currency: asString(r.currency) || 'LKR',
    transactions,
  };
}

export async function fetchTeacherWalletOverview(
  txLimit = 50,
): Promise<TeacherWalletOverviewResult> {
  try {
    const { data, error } = await supabase.rpc('teacher_wallet_overview', {
      p_tx_limit: txLimit,
    });
    if (error) return { ok: false, error: error.message };
    const overview = parseOverview(data);
    if (!overview) return { ok: false, error: 'Invalid wallet response.' };
    return { ok: true, overview };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function teacherWalletSubmitManualTopUp(
  amountCents: number,
  slipPath: string,
  depositorName: string,
  depositorIdNumber: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const path = slipPath.trim();
  const name = depositorName.trim();
  const idNumber = depositorIdNumber.trim();
  if (amountCents <= 0 || !path || name.length < 2 || idNumber.length < 4) {
    return { ok: false, error: 'Invalid manual top-up request.' };
  }

  try {
    const { data, error } = await supabase.rpc('teacher_wallet_submit_manual_topup', {
      p_amount_cents: amountCents,
      p_slip_path: path,
      p_depositor_name: name,
      p_depositor_id_number: idNumber,
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'Invalid response.' };
    }
    const r = data as Record<string, unknown>;
    return { ok: true, id: asString(r.id) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function teacherWalletBankTransfer(
  amountCents: number,
  note?: string,
): Promise<TeacherWalletMutationResult> {
  if (amountCents <= 0) {
    return { ok: false, error: 'Invalid transfer request.' };
  }

  try {
    const { data, error } = await supabase.rpc('teacher_wallet_bank_transfer', {
      p_amount_cents: amountCents,
      p_note: note ?? null,
    });
    if (error) {
      if (error.message.includes('insufficient_balance')) {
        return { ok: false, error: 'insufficient_balance' };
      }
      return { ok: false, error: error.message };
    }
    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'Invalid transfer response.' };
    }
    const r = data as Record<string, unknown>;
    return {
      ok: true,
      balanceCents: asNumber(r.balance_cents),
      amountCents: asNumber(r.amount_cents),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Parse rupee input (e.g. "2500" or "2500.50") to cents. */
export function parseRupeeInputToCents(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, '');
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  const cents = Math.round(n * 100);
  if (cents <= 0) return null;
  return cents;
}
