import { supabase } from '@/src/services/supabaseClient';

export type AdminDashboardStats = {
  activeStudentsToday: number;
  todaysClasses: number;
  pendingTasks: number;
  attendancePctToday: number;
  sessionDate: string;
};

export type AdminDashboardScheduleItem = {
  scheduleId: string;
  lectureGroupId: string;
  groupName: string;
  teacherName: string;
  startTime: string;
  endTime: string;
  enrolledCount: number;
  presentCount: number;
  markedCount: number;
  attendanceComplete: boolean;
};

export type AdminDashboardActivityItem = {
  kind: 'student_registered' | 'student_enrolled_group' | 'teacher_assigned' | 'attendance_marked';
  occurredAt: string;
  title: string;
  subtitle: string;
  lectureGroupId: string | null;
  userId: string | null;
};

export type AdminDashboardGrowthPeriod = 'week' | 'month';

export type AdminDashboardGrowth = {
  period: AdminDashboardGrowthPeriod;
  labels: string[];
  enrollments: number[];
  attendancePct: number[];
};

function parseStats(data: unknown): AdminDashboardStats | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const r = data as Record<string, unknown>;
  return {
    activeStudentsToday: typeof r.active_students_today === 'number' ? r.active_students_today : 0,
    todaysClasses: typeof r.todays_classes === 'number' ? r.todays_classes : 0,
    pendingTasks: typeof r.pending_tasks === 'number' ? r.pending_tasks : 0,
    attendancePctToday:
      typeof r.attendance_pct_today === 'number' ? r.attendance_pct_today : Number(r.attendance_pct_today) || 0,
    sessionDate: typeof r.session_date === 'string' ? r.session_date : '',
  };
}

function parseScheduleItems(data: unknown): AdminDashboardScheduleItem[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const items = (data as Record<string, unknown>).items;
  if (!Array.isArray(items)) return [];
  return items
    .map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
      const r = row as Record<string, unknown>;
      const lectureGroupId = typeof r.lecture_group_id === 'string' ? r.lecture_group_id : '';
      if (!lectureGroupId) return null;
      return {
        scheduleId: typeof r.schedule_id === 'string' ? r.schedule_id : '',
        lectureGroupId,
        groupName: typeof r.group_name === 'string' ? r.group_name : '—',
        teacherName: typeof r.teacher_name === 'string' ? r.teacher_name : '—',
        startTime: typeof r.start_time === 'string' ? r.start_time : '',
        endTime: typeof r.end_time === 'string' ? r.end_time : '',
        enrolledCount: typeof r.enrolled_count === 'number' ? r.enrolled_count : 0,
        presentCount: typeof r.present_count === 'number' ? r.present_count : 0,
        markedCount: typeof r.marked_count === 'number' ? r.marked_count : 0,
        attendanceComplete: r.attendance_complete === true,
      };
    })
    .filter((x): x is AdminDashboardScheduleItem => x !== null);
}

function parseActivityItems(data: unknown): AdminDashboardActivityItem[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const items = (data as Record<string, unknown>).items;
  if (!Array.isArray(items)) return [];
  return items
    .map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
      const r = row as Record<string, unknown>;
      const kind = r.kind;
      if (
        kind !== 'student_registered' &&
        kind !== 'student_enrolled_group' &&
        kind !== 'teacher_assigned' &&
        kind !== 'attendance_marked'
      ) {
        return null;
      }
      return {
        kind,
        occurredAt: typeof r.occurred_at === 'string' ? r.occurred_at : '',
        title: typeof r.title === 'string' ? r.title : '—',
        subtitle: typeof r.subtitle === 'string' ? r.subtitle : '',
        lectureGroupId: typeof r.lecture_group_id === 'string' ? r.lecture_group_id : null,
        userId: typeof r.user_id === 'string' ? r.user_id : null,
      };
    })
    .filter((x): x is AdminDashboardActivityItem => x !== null);
}

function parseGrowth(data: unknown): AdminDashboardGrowth | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const r = data as Record<string, unknown>;
  const period = r.period === 'month' ? 'month' : 'week';
  const labels = Array.isArray(r.labels) ? r.labels.filter((x): x is string => typeof x === 'string') : [];
  const enrollments = Array.isArray(r.enrollments)
    ? r.enrollments.map((x) => (typeof x === 'number' ? x : Number(x) || 0))
    : [];
  const attendancePct = Array.isArray(r.attendance_pct)
    ? r.attendance_pct.map((x) => (typeof x === 'number' ? x : Number(x) || 0))
    : [];
  return { period, labels, enrollments, attendancePct };
}

function isMissingRpc(error: { message?: string } | null): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes('could not find the function') || msg.includes('schema cache');
}

export async function fetchAdminDashboardStats(sessionDate?: string): Promise<{
  stats: AdminDashboardStats | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('institute_admin_dashboard_stats', {
    p_session_date: sessionDate ?? undefined,
  });
  if (error) {
    return { stats: null, error: isMissingRpc(error) ? 'rpc_missing' : error.message };
  }
  return { stats: parseStats(data), error: null };
}

export async function fetchAdminDashboardTodaySchedule(sessionDate?: string): Promise<{
  items: AdminDashboardScheduleItem[];
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('institute_admin_dashboard_today_schedule', {
    p_session_date: sessionDate ?? undefined,
  });
  if (error) {
    return { items: [], error: isMissingRpc(error) ? 'rpc_missing' : error.message };
  }
  return { items: parseScheduleItems(data), error: null };
}

export async function fetchAdminDashboardActivity(limit = 20): Promise<{
  items: AdminDashboardActivityItem[];
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('institute_admin_dashboard_activity', {
    p_limit: limit,
  });
  if (error) {
    return { items: [], error: isMissingRpc(error) ? 'rpc_missing' : error.message };
  }
  return { items: parseActivityItems(data), error: null };
}

export async function fetchAdminDashboardGrowth(period: AdminDashboardGrowthPeriod = 'week'): Promise<{
  growth: AdminDashboardGrowth | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('institute_admin_dashboard_growth', {
    p_period: period,
  });
  if (error) {
    return { growth: null, error: isMissingRpc(error) ? 'rpc_missing' : error.message };
  }
  return { growth: parseGrowth(data), error: null };
}

/** Converts 24h "HH:MM" to locale-friendly 12h label. */
export function formatScheduleClockTime(hhmm: string, locale?: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

export function formatRelativeActivityTime(iso: string, locale?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}
