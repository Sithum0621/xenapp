import { supabase } from '@/src/services/supabaseClient';

export type SuperadminDashboardStats = {
  teachers: number;
  admins: number;
  students: number;
  institutes: number;
};

export type SuperadminDashboardStatKey = keyof SuperadminDashboardStats;

export type GrowthPeriod = 'month' | 'year';

export type SuperadminDashboardGrowth = {
  period: GrowthPeriod;
  labels: string[];
  series: Record<SuperadminDashboardStatKey, number[]>;
  totals: SuperadminDashboardStats;
  growthPct: SuperadminDashboardStats;
};

const LIST_PAGE_SIZE = 100;

function normalizeRole(role: string): string {
  return (role || '').trim().toLowerCase();
}

function parseCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.max(0, Math.trunc(n));
  }
  return 0;
}

function parseGrowthPctValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function parseGrowthPctPayload(data: unknown): SuperadminDashboardStats | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  return {
    teachers: parseGrowthPctValue(row.teachers),
    admins: parseGrowthPctValue(row.admins),
    students: parseGrowthPctValue(row.students),
    institutes: parseGrowthPctValue(row.institutes),
  };
}

function parseStatsPayload(data: unknown): SuperadminDashboardStats | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  return {
    teachers: parseCount(row.teachers),
    admins: parseCount(row.admins),
    students: parseCount(row.students),
    institutes: parseCount(row.institutes),
  };
}

function isDashboardStatsRpcMissing(message: string, code?: string): boolean {
  if (code === 'PGRST202' || code === '42883') return true;
  const m = message.toLowerCase();
  return (
    m.includes('superadmin_dashboard_stats') ||
    m.includes('could not find the function') ||
    m.includes('function') && m.includes('does not exist')
  );
}

async function countUsersMatching(
  roleFilter: 'teachers' | 'admins' | 'others',
  matchRole?: (role: string) => boolean,
): Promise<number> {
  let offset = 0;
  let total = 0;

  for (;;) {
    const { data, error } = await supabase.rpc('superadmin_list_users', {
      p_query: {
        search: '',
        role_filter: roleFilter,
        limit: LIST_PAGE_SIZE,
        offset,
      },
    });

    if (error) throw error;

    const rows = (data ?? []) as { role?: string }[];
    for (const row of rows) {
      const role = normalizeRole(row.role ?? '');
      if (!matchRole || matchRole(role)) total += 1;
    }

    if (rows.length < LIST_PAGE_SIZE) break;
    offset += LIST_PAGE_SIZE;
  }

  return total;
}

async function countInstitutes(): Promise<number> {
  let offset = 0;
  let total = 0;

  for (;;) {
    const { data, error } = await supabase.rpc('superadmin_list_institutes', {
      p_filters: {
        search: '',
        limit: LIST_PAGE_SIZE,
        offset,
      },
    });

    if (error) throw error;

    const rows = data ?? [];
    total += rows.length;

    if (rows.length < LIST_PAGE_SIZE) break;
    offset += LIST_PAGE_SIZE;
  }

  return total;
}

async function fetchSuperadminDashboardStatsFallback(): Promise<{
  stats: SuperadminDashboardStats;
  error: string | null;
}> {
  const [teachers, admins, students, institutes] = await Promise.all([
    countUsersMatching('teachers'),
    countUsersMatching('admins', (role) => role === 'admin'),
    countUsersMatching('others', (role) => role === 'parent_student'),
    countInstitutes(),
  ]);

  return {
    stats: { teachers, admins, students, institutes },
    error: null,
  };
}

export async function fetchSuperadminDashboardStats(): Promise<{
  stats: SuperadminDashboardStats | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('superadmin_dashboard_stats');

  if (!error) {
    const stats = parseStatsPayload(data);
    if (stats) return { stats, error: null };
  }

  if (error && !isDashboardStatsRpcMissing(error.message, error.code)) {
    return { stats: null, error: error.message };
  }

  try {
    return await fetchSuperadminDashboardStatsFallback();
  } catch (fallbackErr) {
    const message =
      fallbackErr instanceof Error
        ? fallbackErr.message
        : error?.message ?? 'invalid_stats_response';
    return { stats: null, error: message };
  }
}

function parseIntArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => parseCount(v));
}

function parseGrowthPayload(data: unknown): SuperadminDashboardGrowth | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  const period = row.period === 'year' ? 'year' : 'month';
  const labels = Array.isArray(row.labels)
    ? row.labels.map((l) => String(l))
  : [];
  const seriesRaw =
    row.series !== null && typeof row.series === 'object' && !Array.isArray(row.series)
      ? (row.series as Record<string, unknown>)
      : {};
  const totals = parseStatsPayload(row.totals);
  if (!totals) return null;

  const growthPct = parseGrowthPctPayload(row.growth_pct) ?? {
    teachers: 0,
    admins: 0,
    students: 0,
    institutes: 0,
  };

  return {
    period,
    labels,
    series: {
      teachers: parseIntArray(seriesRaw.teachers),
      admins: parseIntArray(seriesRaw.admins),
      students: parseIntArray(seriesRaw.students),
      institutes: parseIntArray(seriesRaw.institutes),
    },
    totals,
    growthPct,
  };
}

export async function fetchSuperadminDashboardGrowth(period: GrowthPeriod): Promise<{
  growth: SuperadminDashboardGrowth | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('superadmin_dashboard_growth', { p_period: period });

  if (error) {
    return { growth: null, error: error.message };
  }

  const growth = parseGrowthPayload(data);
  if (!growth) {
    return { growth: null, error: 'invalid_growth_response' };
  }

  return { growth, error: null };
}
