import { supabase } from '@/src/services/supabaseClient';

export type StudentClassesBillingOverview = {
  studentUserId: string;
  walletBalanceCents: number;
  currency: string;
  billingMonth: string;
  monthlyTotalDueCents: number;
};

export type StudentClassesBillingResult =
  | { ok: true; overview: StudentClassesBillingOverview }
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

export async function fetchStudentClassesBillingOverview(
  studentUserId: string,
): Promise<StudentClassesBillingResult> {
  const studentId = studentUserId.trim();
  if (!studentId) {
    return { ok: false, error: 'Student is required.' };
  }

  try {
    const { data, error } = await supabase.rpc('student_classes_billing_overview', {
      p_student_user_id: studentId,
    });

    if (error) return { ok: false, error: error.message };
    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'Invalid billing response.' };
    }

    const r = data as Record<string, unknown>;
    const billingMonthRaw = asString(r.billing_month);
    const billingMonth =
      billingMonthRaw.length >= 10 ? billingMonthRaw.slice(0, 10) : billingMonthRaw;

    return {
      ok: true,
      overview: {
        studentUserId: asString(r.student_user_id) || studentId,
        walletBalanceCents: asNumber(r.wallet_balance_cents),
        currency: asString(r.currency) || 'LKR',
        billingMonth,
        monthlyTotalDueCents: asNumber(r.monthly_total_due_cents),
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export type WalletTopUpResult =
  | { ok: true; walletBalanceCents: number; amountCents: number }
  | { ok: false; error: string };

/** Credit a student wallet (used when transfer flow is implemented). */
export async function studentWalletTopUp(
  studentUserId: string,
  amountCents: number,
  note?: string,
): Promise<WalletTopUpResult> {
  const studentId = studentUserId.trim();
  if (!studentId || amountCents <= 0) {
    return { ok: false, error: 'Invalid top-up request.' };
  }

  try {
    const { data, error } = await supabase.rpc('student_wallet_top_up', {
      p_student_user_id: studentId,
      p_amount_cents: amountCents,
      p_note: note ?? null,
    });

    if (error) return { ok: false, error: error.message };
    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'Invalid top-up response.' };
    }

    const r = data as Record<string, unknown>;
    return {
      ok: true,
      walletBalanceCents: asNumber(r.wallet_balance_cents),
      amountCents: asNumber(r.amount_cents),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
