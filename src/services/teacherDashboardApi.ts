import { supabase } from '@/src/services/supabaseClient';
import { loadTeacherProfileFields } from '@/src/services/teacherProfileApi';
import {
  getTeacherUnifiedGroupsCached,
  type TeacherUnifiedGroupRow,
} from '@/src/services/teacherGroupsApi';
import {
  SessionCacheKeys,
  sessionCacheGetOrFetch,
} from '@/src/services/sessionDataCache';
import { loadTeacherSmsAccount } from '@/src/services/teacherSmsAccountStorage';
import { fetchTeacherWalletOverview } from '@/src/services/teacherWalletApi';
export type TeacherDashboardClassRow = {
  id: string;
  source: 'institute' | 'personal';
  name: string;
  instituteName: string | null;
  studentCount: number;
  collectedCents: number;
  /** Student class fees not yet collected (`group_payment_records.status = pending`). */
  duePaymentCents: number;
  /** Package activation fees owed to additional teachers (from package billing; backend TBD). */
  amountToPayCents: number;
};

export type TeacherDashboardOverview = {
  teacherDisplayName: string;
  billingMonth: string;
  classes: TeacherDashboardClassRow[];
  totalStudents: number;
  /** All collected class fees for the month (manual + in-app). */
  totalIncomeCents: number;
  /** In-app collections only (wallet debits + online gateway) for the month. */
  walletCents: number;
  /** Teacher platform wallet balance (available to withdraw). */
  teacherWalletBalanceCents: number;
  /** Outstanding student class fees for the current billing month. */
  duePaymentCents: number;
  /** Package activation fees owed to additional teachers for the current billing month. */
  amountToPayCents: number;
  /** Remaining SMS credits for teacher notifications (50 starter credits). */
  smsCreditBalance: number;
};

function monthStartIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function displayNameFromProfile(firstName: string, lastName: string, fullName: string): string {
  const first = firstName.trim();
  if (first) return first;
  const full = fullName.trim();
  if (full) {
    const part = full.split(/\s+/)[0];
    if (part) return part;
  }
  const last = lastName.trim();
  if (last) return last;
  return '';
}

async function countStudentsByInstituteGroup(ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;

  const { data, error } = await supabase
    .from('lecture_group_students')
    .select('lecture_group_id')
    .in('lecture_group_id', ids);

  if (error) return counts;

  for (const raw of data ?? []) {
    const gid =
      raw && typeof raw === 'object'
        ? String((raw as { lecture_group_id?: unknown }).lecture_group_id ?? '')
        : '';
    if (!gid) continue;
    counts.set(gid, (counts.get(gid) ?? 0) + 1);
  }
  return counts;
}

async function countStudentsByPersonalGroup(ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;

  const { data, error } = await supabase
    .from('teacher_personal_roster_entries')
    .select('teacher_personal_group_id')
    .in('teacher_personal_group_id', ids);

  if (error) return counts;

  for (const raw of data ?? []) {
    const gid =
      raw && typeof raw === 'object'
        ? String((raw as { teacher_personal_group_id?: unknown }).teacher_personal_group_id ?? '')
        : '';
    if (!gid) continue;
    counts.set(gid, (counts.get(gid) ?? 0) + 1);
  }
  return counts;
}

type PaymentAgg = { collectedCents: number; pendingCents: number; platformFeeCents: number };

function emptyPaymentAgg(): PaymentAgg {
  return { collectedCents: 0, pendingCents: 0, platformFeeCents: 0 };
}

async function sumPaymentsForMonth(
  instituteIds: string[],
  personalIds: string[],
  billingMonth: string,
): Promise<{
  collectedCents: number;
  walletCents: number;
  pendingCents: number;
  platformFeeTotalCents: number;
  byInstituteGroup: Map<string, PaymentAgg>;
  byPersonalGroup: Map<string, PaymentAgg>;
  error: string | null;
}> {
  let collectedCents = 0;
  let walletCents = 0;
  let pendingCents = 0;
  let platformFeeTotalCents = 0;
  const byInstituteGroup = new Map<string, PaymentAgg>();
  const byPersonalGroup = new Map<string, PaymentAgg>();

  const mergeGroupMaps = (
    rows:
      | {
          amount_cents: number;
          status: string;
          collection_method?: string | null;
          platform_fee_cents?: number | null;
          lecture_group_id?: string | null;
          teacher_personal_group_id?: string | null;
        }[]
      | null,
    key: 'lecture_group_id' | 'teacher_personal_group_id',
    map: Map<string, PaymentAgg>,
  ) => {
    for (const row of rows ?? []) {
      const gid = String(row[key] ?? '');
      if (!gid) continue;
      const cur = map.get(gid) ?? emptyPaymentAgg();
      if (row.status === 'collected') {
        cur.collectedCents += row.amount_cents;
        collectedCents += row.amount_cents;
        const platformFee = Number(row.platform_fee_cents ?? 0);
        cur.platformFeeCents += platformFee;
        platformFeeTotalCents += platformFee;
        const method = String(row.collection_method ?? 'manual');
        if (method === 'wallet' || method === 'online') {
          walletCents += row.amount_cents;
        }
      } else {
        cur.pendingCents += row.amount_cents;
        pendingCents += row.amount_cents;
      }
      map.set(gid, cur);
    }
  };

  if (instituteIds.length > 0) {
    const { data, error } = await supabase
      .from('group_payment_records')
      .select('amount_cents, status, collection_method, platform_fee_cents, lecture_group_id')
      .in('lecture_group_id', instituteIds)
      .eq('billing_month', billingMonth);
    if (error) {
      return {
        collectedCents: 0,
        walletCents: 0,
        pendingCents: 0,
        platformFeeTotalCents: 0,
        byInstituteGroup,
        byPersonalGroup,
        error: error.message,
      };
    }
    mergeGroupMaps(
      data as {
        amount_cents: number;
        status: string;
        platform_fee_cents?: number | null;
        lecture_group_id?: string | null;
      }[],
      'lecture_group_id',
      byInstituteGroup,
    );
  }

  if (personalIds.length > 0) {
    const { data, error } = await supabase
      .from('group_payment_records')
      .select('amount_cents, status, collection_method, platform_fee_cents, teacher_personal_group_id')
      .in('teacher_personal_group_id', personalIds)
      .eq('billing_month', billingMonth);
    if (error) {
      return {
        collectedCents: 0,
        walletCents: 0,
        pendingCents: 0,
        platformFeeTotalCents: 0,
        byInstituteGroup,
        byPersonalGroup,
        error: error.message,
      };
    }
    mergeGroupMaps(
      data as {
        amount_cents: number;
        status: string;
        platform_fee_cents?: number | null;
        teacher_personal_group_id?: string | null;
      }[],
      'teacher_personal_group_id',
      byPersonalGroup,
    );
  }

  return {
    collectedCents,
    walletCents,
    pendingCents,
    platformFeeTotalCents,
    byInstituteGroup,
    byPersonalGroup,
    error: null,
  };
}

/**
 * Package activation fees owed to additional teachers when students enable app packages.
 * Replace with a Supabase RPC when backend billing is implemented.
 */
async function sumTeacherPackageAmountToPay(
  teacherUserId: string,
  instituteIds: string[],
  personalIds: string[],
  billingMonth: string,
): Promise<{
  totalCents: number;
  byInstituteGroup: Map<string, number>;
  byPersonalGroup: Map<string, number>;
  error: string | null;
}> {
  void teacherUserId;
  void instituteIds;
  void personalIds;
  void billingMonth;
  // TODO(backend): e.g. supabase.rpc('teacher_dashboard_package_amount_to_pay', { p_billing_month: billingMonth })
  return {
    totalCents: 0,
    byInstituteGroup: new Map(),
    byPersonalGroup: new Map(),
    error: null,
  };
}

function buildClassRows(
  groups: TeacherUnifiedGroupRow[],
  instituteCounts: Map<string, number>,
  personalCounts: Map<string, number>,
  institutePayments: Map<string, PaymentAgg>,
  personalPayments: Map<string, PaymentAgg>,
  institutePackageCents: Map<string, number>,
  personalPackageCents: Map<string, number>,
): TeacherDashboardClassRow[] {
  return groups.map((g) => {
    const pay =
      g.source === 'institute'
        ? (institutePayments.get(g.id) ?? emptyPaymentAgg())
        : (personalPayments.get(g.id) ?? emptyPaymentAgg());
    const amountToPayCents = pay.platformFeeCents;
    return {
      id: g.id,
      source: g.source,
      name: g.name,
      instituteName: g.source === 'institute' ? g.institute_name : null,
      studentCount:
        g.source === 'institute' ? (instituteCounts.get(g.id) ?? 0) : (personalCounts.get(g.id) ?? 0),
      collectedCents: pay.collectedCents,
      duePaymentCents: pay.pendingCents,
      amountToPayCents,
    };
  });
}

export type TeacherDashboardOverviewResult = {
  overview: TeacherDashboardOverview | null;
  error: string | null;
  partialWarning: string | null;
};

function rpcNotDeployedMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('could not find the function') ||
    m.includes('schema cache') ||
    m.includes('teacher_dashboard_overview')
  );
}

function parseRpcClassRow(raw: unknown): TeacherDashboardClassRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : null;
  const name = typeof r.name === 'string' ? r.name : null;
  const sourceRaw = typeof r.source === 'string' ? r.source : 'institute';
  const source: 'institute' | 'personal' = sourceRaw === 'personal' ? 'personal' : 'institute';
  if (!id || !name) return null;
  const num = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : Number.parseInt(String(v ?? 0), 10) || 0;
  return {
    id,
    source,
    name,
    instituteName:
      typeof r.institute_name === 'string' && r.institute_name.trim() ? r.institute_name.trim() : null,
    studentCount: num(r.student_count),
    collectedCents: num(r.collected_cents),
    duePaymentCents: num(r.due_payment_cents),
    amountToPayCents: num(r.amount_to_pay_cents),
  };
}

async function fetchTeacherDashboardOverviewViaRpc(
  billingMonth: string,
): Promise<TeacherDashboardOverviewResult | null> {
  const { data, error } = await supabase.rpc('teacher_dashboard_overview', {
    p_billing_month: billingMonth,
  });
  if (error) {
    if (rpcNotDeployedMessage(error.message)) return null;
    return { overview: null, error: error.message, partialWarning: null };
  }
  if (!data || typeof data !== 'object') {
    return { overview: null, error: 'Invalid dashboard response', partialWarning: null };
  }

  const r = data as Record<string, unknown>;
  const teacherDisplayName = displayNameFromProfile(
    String(r.teacher_first_name ?? ''),
    String(r.teacher_last_name ?? ''),
    String(r.teacher_full_name ?? ''),
  );
  const classesRaw = Array.isArray(r.classes) ? r.classes : [];
  const classes = classesRaw
    .map(parseRpcClassRow)
    .filter((row): row is TeacherDashboardClassRow => row !== null);

  const num = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : Number.parseInt(String(v ?? 0), 10) || 0;

  const smsRes = await loadTeacherSmsAccount();

  return {
    overview: {
      teacherDisplayName,
      billingMonth: typeof r.billing_month === 'string' ? r.billing_month.slice(0, 10) : billingMonth,
      classes,
      totalStudents: num(r.total_students),
      totalIncomeCents: num(r.total_income_cents),
      walletCents: num(r.wallet_cents),
      teacherWalletBalanceCents: num(r.teacher_wallet_balance_cents),
      duePaymentCents: num(r.due_payment_cents),
      amountToPayCents: num(r.amount_to_pay_cents),
      smsCreditBalance: smsRes.ok && smsRes.account ? smsRes.account.creditBalance : 0,
    },
    error: null,
    partialWarning: null,
  };
}

export async function fetchTeacherDashboardOverview(): Promise<TeacherDashboardOverviewResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return { overview: null, error: 'Not signed in', partialWarning: null };
  }

  const billingMonth = monthStartIso();

  const rpcResult = await fetchTeacherDashboardOverviewViaRpc(billingMonth);
  if (rpcResult && !rpcResult.error && rpcResult.overview) {
    return rpcResult;
  }
  if (rpcResult?.error && !rpcNotDeployedMessage(rpcResult.error)) {
    return rpcResult;
  }

  const [profileRes, groupsRes] = await Promise.all([
    loadTeacherProfileFields(user.id),
    getTeacherUnifiedGroupsCached(),
  ]);

  if (profileRes.error) {
    return { overview: null, error: profileRes.error, partialWarning: null };
  }
  if (groupsRes.error) {
    return { overview: null, error: groupsRes.error, partialWarning: groupsRes.partialWarning };
  }

  const teacherDisplayName = displayNameFromProfile(
    profileRes.data?.firstName ?? '',
    profileRes.data?.lastName ?? '',
    profileRes.data?.fullName ?? '',
  );

  const instituteIds = groupsRes.rows.filter((g) => g.source === 'institute').map((g) => g.id);
  const personalIds = groupsRes.rows.filter((g) => g.source === 'personal').map((g) => g.id);

  const [instituteCounts, personalCounts, payRes, packageRes, walletRes, smsRes] = await Promise.all([
    countStudentsByInstituteGroup(instituteIds),
    countStudentsByPersonalGroup(personalIds),
    sumPaymentsForMonth(instituteIds, personalIds, billingMonth),
    sumTeacherPackageAmountToPay(user.id, instituteIds, personalIds, billingMonth),
    fetchTeacherWalletOverview(0),
    loadTeacherSmsAccount(),
  ]);

  if (payRes.error) {
    return { overview: null, error: payRes.error, partialWarning: groupsRes.partialWarning };
  }
  if (packageRes.error) {
    return { overview: null, error: packageRes.error, partialWarning: groupsRes.partialWarning };
  }

  const classes = buildClassRows(
    groupsRes.rows,
    instituteCounts,
    personalCounts,
    payRes.byInstituteGroup,
    payRes.byPersonalGroup,
    packageRes.byInstituteGroup,
    packageRes.byPersonalGroup,
  );
  const totalStudents = classes.reduce((sum, c) => sum + c.studentCount, 0);
  const teacherWalletBalanceCents = walletRes.ok ? walletRes.overview.balanceCents : 0;

  return {
    overview: {
      teacherDisplayName,
      billingMonth,
      classes,
      totalStudents,
      totalIncomeCents: payRes.collectedCents,
      walletCents: payRes.walletCents,
      teacherWalletBalanceCents,
      duePaymentCents: payRes.pendingCents,
      amountToPayCents: payRes.platformFeeTotalCents + packageRes.totalCents,
      smsCreditBalance: smsRes.ok && smsRes.account ? smsRes.account.creditBalance : 0,
    },
    error: null,
    partialWarning: groupsRes.partialWarning,
  };
}

export function getTeacherDashboardOverviewCached(options?: { force?: boolean }) {
  return sessionCacheGetOrFetch(
    SessionCacheKeys.TEACHER_DASHBOARD_OVERVIEW,
    () => fetchTeacherDashboardOverview(),
    {
      force: options?.force,
      shouldCache: (res) => !res.error && res.overview != null,
    },
  );
}
