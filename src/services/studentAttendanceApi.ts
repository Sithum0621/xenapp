import { fetchStudentClasses, type StudentGroupSource } from '@/src/services/studentClassesApi';
import { supabase } from '@/src/services/supabaseClient';

export const ATTENDANCE_WINDOW_DAYS = 30;

export type AttendanceCounts = {
  present: number;
  absent: number;
  total: number;
};

export type GroupAttendanceSummary = {
  lectureGroupId: string;
  groupSource: StudentGroupSource;
  groupName: string;
  instituteName: string;
  present: number;
  absent: number;
  total: number;
};

export type AttendanceDayMark = {
  date: string; // YYYY-MM-DD
  present: boolean;
};

export type AttendanceOccurrenceKind = 'recurring_weekly' | 'one_time' | 'session';

export type AttendanceOccurrence = {
  date: string;
  present: boolean;
  startTime: string;
  endTime: string;
  kind: AttendanceOccurrenceKind;
  recordedAt: string | null;
  hasMark: boolean;
};

function localTodayString(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function localTimeString(now: Date = new Date()): string {
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function parseAttendancePresent(raw: unknown): boolean {
  if (raw === true || raw === 'true' || raw === 't') return true;
  if (raw === false || raw === 'false' || raw === 'f') return false;
  return false;
}

function asInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === 'string' && value.trim()) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return 0;
}

function parseGroupSource(raw: unknown): StudentGroupSource {
  return raw === 'personal' ? 'personal' : 'institute';
}

function groupKey(source: StudentGroupSource, id: string): string {
  return `${source}:${id}`;
}

export function countsFromParts(present: number, absent: number): AttendanceCounts {
  const p = Math.max(0, present);
  const a = Math.max(0, absent);
  return { present: p, absent: a, total: p + a };
}

function parseAttendanceGroupRow(raw: unknown): GroupAttendanceSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const lectureGroupId =
    typeof r.lecture_group_id === 'string' ? r.lecture_group_id.trim() : null;
  const groupName = typeof r.group_name === 'string' ? r.group_name.trim() : null;
  if (!lectureGroupId || !groupName) return null;

  const present = asInt(r.present_count);
  const absent = asInt(r.absent_count);
  const total = asInt(r.total_sessions);

  return {
    lectureGroupId,
    groupSource: parseGroupSource(r.group_source),
    groupName,
    instituteName: typeof r.institute_name === 'string' ? r.institute_name : '',
    present: total > 0 ? present : 0,
    absent: total > 0 ? absent : 0,
    total: total > 0 ? total : present + absent,
  };
}

/** Merge RPC attendance rows with full enrollment list from student_list_classes_for_student. */
async function mergeWithEnrolledClasses(
  studentUserId: string,
  fromRpc: GroupAttendanceSummary[],
): Promise<GroupAttendanceSummary[]> {
  const byKey = new Map<string, GroupAttendanceSummary>();
  for (const g of fromRpc) {
    byKey.set(groupKey(g.groupSource, g.lectureGroupId), g);
  }

  const classesRes = await fetchStudentClasses(studentUserId);
  if (!classesRes.ok) {
    return [...byKey.values()].sort((a, b) =>
      a.groupName.localeCompare(b.groupName, undefined, { sensitivity: 'base' }),
    );
  }

  for (const c of classesRes.classes) {
    const key = groupKey(c.groupSource, c.lectureGroupId);
    if (byKey.has(key)) continue;
    byKey.set(key, {
      lectureGroupId: c.lectureGroupId,
      groupSource: c.groupSource,
      groupName: c.groupName,
      instituteName:
        c.groupSource === 'personal'
          ? c.instituteName
          : c.instituteName || '',
      present: 0,
      absent: 0,
      total: 0,
    });
  }

  return [...byKey.values()].sort((a, b) =>
    a.groupName.localeCompare(b.groupName, undefined, { sensitivity: 'base' }),
  );
}

export async function fetchOverallAttendanceCounts(
  studentUserId: string,
  windowDays = ATTENDANCE_WINDOW_DAYS,
): Promise<{ ok: true; counts: AttendanceCounts } | { ok: false; error: string }> {
  try {
    const now = new Date();
    const { data, error } = await supabase.rpc('student_attendance_summary', {
      p_student_user_id: studentUserId,
      p_window_days: windowDays,
      p_local_date: localTodayString(now),
      p_local_time: localTimeString(now),
    });
    if (error) return { ok: false, error: error.message };
    if (!data || typeof data !== 'object') {
      return { ok: true, counts: { present: 0, absent: 0, total: 0 } };
    }
    const raw = data as Record<string, unknown>;
    const present = asInt(raw.present);
    const absent = asInt(raw.absent ?? Math.max(asInt(raw.total) - present, 0));
    return { ok: true, counts: countsFromParts(present, absent) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchAttendanceByGroup(
  studentUserId: string,
  windowDays = ATTENDANCE_WINDOW_DAYS,
): Promise<{ ok: true; groups: GroupAttendanceSummary[] } | { ok: false; error: string }> {
  try {
    const now = new Date();
    const { data, error } = await supabase.rpc('student_attendance_by_group', {
      p_student_user_id: studentUserId,
      p_window_days: windowDays,
      p_local_date: localTodayString(now),
      p_local_time: localTimeString(now),
    });
    if (error) return { ok: false, error: error.message };

    const fromRpc = Array.isArray(data)
      ? data
          .map(parseAttendanceGroupRow)
          .filter((g): g is GroupAttendanceSummary => g !== null)
      : [];

    const groups = await mergeWithEnrolledClasses(studentUserId, fromRpc);
    return { ok: true, groups };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function parseOccurrenceKind(raw: unknown): AttendanceOccurrenceKind {
  if (raw === 'one_time') return 'one_time';
  if (raw === 'session') return 'session';
  return 'recurring_weekly';
}

export async function fetchGroupAttendanceOccurrences(
  studentUserId: string,
  lectureGroupId: string,
  groupSource: StudentGroupSource = 'institute',
  windowDays = ATTENDANCE_WINDOW_DAYS,
): Promise<{ ok: true; occurrences: AttendanceOccurrence[] } | { ok: false; error: string }> {
  try {
    const now = new Date();
    const { data, error } = await supabase.rpc('student_attendance_group_occurrences', {
      p_student_user_id: studentUserId,
      p_group_id: lectureGroupId,
      p_group_source: groupSource,
      p_window_days: windowDays,
      p_local_date: localTodayString(now),
      p_local_time: localTimeString(now),
    });
    if (error) return { ok: false, error: error.message };
    if (!Array.isArray(data)) return { ok: true, occurrences: [] };

    const occurrences: AttendanceOccurrence[] = data
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const r = row as Record<string, unknown>;
        const dateRaw =
          typeof r.class_date === 'string'
            ? r.class_date.slice(0, 10)
            : typeof r.session_date === 'string'
              ? r.session_date.slice(0, 10)
              : null;
        const startTime = typeof r.start_time === 'string' ? r.start_time.trim() : null;
        if (!dateRaw || !startTime) return null;
        return {
          date: dateRaw,
          present: parseAttendancePresent(r.is_present ?? r.present),
          startTime,
          endTime: typeof r.end_time === 'string' ? r.end_time.trim() : startTime,
          kind: parseOccurrenceKind(r.occurrence_kind),
          recordedAt:
            typeof r.recorded_at === 'string' && r.recorded_at.trim()
              ? r.recorded_at
              : null,
          hasMark: r.has_mark === true || r.has_mark === 'true' || r.has_mark === 't',
        };
      })
      .filter((o): o is AttendanceOccurrence => o !== null);

    return { ok: true, occurrences };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** @deprecated Prefer fetchGroupAttendanceOccurrences for calendar UI */
export async function fetchGroupAttendanceCalendar(
  studentUserId: string,
  lectureGroupId: string,
  groupSource: StudentGroupSource = 'institute',
  windowDays = ATTENDANCE_WINDOW_DAYS,
): Promise<{ ok: true; days: AttendanceDayMark[] } | { ok: false; error: string }> {
  try {
    const now = new Date();
    const { data, error } = await supabase.rpc('student_attendance_group_calendar', {
      p_student_user_id: studentUserId,
      p_group_id: lectureGroupId,
      p_group_source: groupSource,
      p_window_days: windowDays,
      p_local_date: localTodayString(now),
      p_local_time: localTimeString(now),
    });
    if (error) return { ok: false, error: error.message };
    if (!Array.isArray(data)) return { ok: true, days: [] };

    const days: AttendanceDayMark[] = data
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const r = row as Record<string, unknown>;
        const date = typeof r.session_date === 'string' ? r.session_date.slice(0, 10) : null;
        if (!date) return null;
        return { date, present: parseAttendancePresent(r.present) };
      })
      .filter((d): d is AttendanceDayMark => d !== null);

    return { ok: true, days };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Inclusive calendar bounds for the rolling attendance window. */
export function attendanceWindowBounds(
  windowDays = ATTENDANCE_WINDOW_DAYS,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  start.setDate(end.getDate() - (windowDays - 1));
  return { start, end };
}
