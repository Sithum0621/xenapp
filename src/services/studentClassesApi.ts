import {
  filterActiveTodayScheduleItems,
  parseClassDelivery,
  type ClassDeliveryInfo,
  type TodayScheduleItem,
} from '@/src/services/parentStudentsApi';
import {
  parentClassesCacheKey,
  sessionCacheGetOrFetch,
} from '@/src/services/sessionDataCache';
import { supabase } from '@/src/services/supabaseClient';
import {
  parseClassPaymentStatus,
  type ClassPaymentStatus,
} from '@/src/utils/classPaymentStatus';

export type ScheduleKind = 'recurring_weekly' | 'one_time';

export type StudentClassSchedule = {
  id: string;
  kind: ScheduleKind;
  dayOfWeek: number | null; // 0 = Sunday .. 6 = Saturday
  classDate: string | null; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  /** Calendar year for recurring_weekly; null for one_time extras. */
  scheduleYear: number | null;
};

export type StudentGroupSource = 'institute' | 'personal';

export type StudentClass = {
  /** Institute lecture group id or teacher personal group id. */
  lectureGroupId: string;
  groupSource: StudentGroupSource;
  groupName: string;
  groupDescription: string;
  instituteId: string;
  instituteName: string;
  teacherName: string;
  monthlyFeeCents: number;
  paymentStatus: ClassPaymentStatus;
  /** First day of billing month (YYYY-MM-DD). */
  paymentBillingMonth: string;
  paymentAmountCents: number;
  schedules: StudentClassSchedule[];
  delivery: ClassDeliveryInfo;
};

export type StudentClassesResult =
  | { ok: true; classes: StudentClass[] }
  | { ok: false; error: string };

function normalizeSchedulesJson(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseScheduleRow(raw: unknown): StudentClassSchedule | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : null;
  const kindRaw = typeof r.kind === 'string' ? r.kind : null;
  const kind: ScheduleKind | null =
    kindRaw === 'recurring_weekly' || kindRaw === 'one_time' ? kindRaw : null;
  const startTime = typeof r.start_time === 'string' ? r.start_time : null;
  const endTime = typeof r.end_time === 'string' ? r.end_time : null;
  if (!id || !kind || !startTime || !endTime) return null;
  const scheduleYearRaw = r.schedule_year;
  const scheduleYear =
    typeof scheduleYearRaw === 'number' && Number.isFinite(scheduleYearRaw)
      ? scheduleYearRaw
      : typeof scheduleYearRaw === 'string' && scheduleYearRaw.trim()
        ? Number.parseInt(scheduleYearRaw, 10) || null
        : null;

  return {
    id,
    kind,
    dayOfWeek:
      typeof r.day_of_week === 'number'
        ? r.day_of_week
        : typeof r.day_of_week === 'string'
          ? Number.parseInt(r.day_of_week, 10) || null
          : null,
    classDate: typeof r.class_date === 'string' ? r.class_date : null,
    startTime,
    endTime,
    scheduleYear,
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed.toLowerCase() : null;
}

function parseGroupSource(raw: unknown): StudentGroupSource {
  return raw === 'personal' ? 'personal' : 'institute';
}

function parseClassesRows(data: unknown): StudentClass[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const lectureGroupId = asUuid(r.lecture_group_id);
      const groupSource = parseGroupSource(r.group_source);
      const groupNameRaw = typeof r.group_name === 'string' ? r.group_name.trim() : '';
      const groupName = groupNameRaw.length > 0 ? groupNameRaw : null;
      const instituteId = asUuid(r.institute_id);
      const instituteName = typeof r.institute_name === 'string' ? r.institute_name.trim() : '';
      const groupDescription = typeof r.group_description === 'string' ? r.group_description : '';
      const schedules = normalizeSchedulesJson(r.schedules)
        .map(parseScheduleRow)
        .filter((s): s is StudentClassSchedule => s !== null);

      if (!lectureGroupId || !groupName) return null;

      const teacherNameRaw = typeof r.teacher_name === 'string' ? r.teacher_name.trim() : '';
      const teacherName = teacherNameRaw.length > 0 ? teacherNameRaw : '';
      const monthlyFeeRaw = r.monthly_fee_cents;
      const monthlyFeeCents =
        typeof monthlyFeeRaw === 'number' && Number.isFinite(monthlyFeeRaw)
          ? Math.max(0, Math.round(monthlyFeeRaw))
          : typeof monthlyFeeRaw === 'string'
            ? Math.max(0, Number.parseInt(monthlyFeeRaw, 10) || 0)
            : 0;

      const paymentBillingMonthRaw =
        typeof r.payment_billing_month === 'string' ? r.payment_billing_month.slice(0, 10) : '';
      const paymentAmountRaw = r.payment_amount_cents;
      const paymentAmountCents =
        typeof paymentAmountRaw === 'number' && Number.isFinite(paymentAmountRaw)
          ? Math.max(0, Math.round(paymentAmountRaw))
          : typeof paymentAmountRaw === 'string'
            ? Math.max(0, Number.parseInt(paymentAmountRaw, 10) || 0)
            : monthlyFeeCents;

      const venueFallback =
        groupSource === 'personal' ? groupName : instituteName;
      return {
        lectureGroupId,
        groupSource,
        groupName,
        groupDescription,
        instituteId: instituteId ?? '',
        instituteName,
        teacherName,
        monthlyFeeCents,
        paymentStatus: parseClassPaymentStatus(r.payment_status),
        paymentBillingMonth: paymentBillingMonthRaw,
        paymentAmountCents,
        schedules,
        delivery: parseClassDelivery(r.delivery, venueFallback),
      };
    })
    .filter((c): c is StudentClass => c !== null);
}

export async function fetchStudentClasses(
  studentUserId?: string | null,
): Promise<StudentClassesResult> {
  const studentId = studentUserId?.trim() ?? '';

  if (studentId) {
    const { data, error } = await supabase.rpc('student_list_classes_for_student', {
      p_student_user_id: studentId,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, classes: parseClassesRows(data) };
  }

  const { data, error } = await supabase.rpc('student_list_my_classes');
  if (error) return { ok: false, error: error.message };
  return { ok: true, classes: parseClassesRows(data) };
}

export function getStudentClassesCached(
  studentUserId: string,
  options?: { force?: boolean },
): Promise<StudentClassesResult> {
  const studentId = studentUserId.trim();
  return sessionCacheGetOrFetch(
    parentClassesCacheKey(studentId),
    () => fetchStudentClasses(studentId),
    {
      force: options?.force,
      shouldCache: (res) => res.ok,
    },
  );
}

/** Build today's schedule rows from class list (same rules as Classes tab). */
function normalizeHHMM(value: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return value.trim();
  return `${String(Number.parseInt(m[1]!, 10)).padStart(2, '0')}:${m[2]}`;
}

export function buildTodayScheduleFromClasses(
  classes: StudentClass[],
  now: Date = new Date(),
): TodayScheduleItem[] {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const localDate = `${y}-${m}-${d}`;
  const localDow = now.getDay();

  const items: TodayScheduleItem[] = [];

  const calendarYear = now.getFullYear();

  for (const group of classes) {
    for (const schedule of group.schedules) {
      const matchesToday =
        (schedule.kind === 'recurring_weekly' &&
          schedule.dayOfWeek === localDow &&
          (schedule.scheduleYear == null || schedule.scheduleYear === calendarYear)) ||
        (schedule.kind === 'one_time' && schedule.classDate === localDate);
      if (!matchesToday) continue;

      const start = schedule.startTime.trim();
      const end = schedule.endTime.trim();
      if (!start || !end) continue;

      items.push({
        scheduleId: schedule.id,
        lectureGroupId: group.lectureGroupId,
        groupName: group.groupName,
        instituteName: group.instituteName,
        startTime: normalizeHHMM(start),
        endTime: normalizeHHMM(end),
        kind: schedule.kind,
        delivery: group.delivery,
      });
    }
  }

  items.sort((a, b) => a.startTime.localeCompare(b.startTime));
  return filterActiveTodayScheduleItems(items, now);
}

// ---------------------------------------------------------------------------
// Next-class-time computation (client-side, local timezone)
// ---------------------------------------------------------------------------

export type NextClass = {
  startsAt: Date;
  endsAt: Date;
  kind: ScheduleKind;
};

function parseHHMM(value: string, baseDate: Date): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hours = Number.parseInt(m[1]!, 10);
  const minutes = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const dt = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hours,
    minutes,
    0,
    0,
  );
  return dt;
}

function nextRecurringOccurrence(
  schedule: StudentClassSchedule,
  now: Date,
): NextClass | null {
  if (schedule.kind !== 'recurring_weekly' || schedule.dayOfWeek === null) return null;
  const year = now.getFullYear();
  if (schedule.scheduleYear != null && schedule.scheduleYear !== year) return null;
  const todayDow = now.getDay();
  let deltaDays = (schedule.dayOfWeek - todayDow + 7) % 7;
  // Resolve "today" — only count today if the end time is still in the future.
  if (deltaDays === 0) {
    const todayStart = parseHHMM(schedule.startTime, now);
    const todayEnd = parseHHMM(schedule.endTime, now);
    if (todayStart && todayEnd && todayEnd.getTime() > now.getTime()) {
      return { startsAt: todayStart, endsAt: todayEnd, kind: schedule.kind };
    }
    deltaDays = 7;
  }
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + deltaDays);
  const start = parseHHMM(schedule.startTime, target);
  const end = parseHHMM(schedule.endTime, target);
  if (!start || !end) return null;
  return { startsAt: start, endsAt: end, kind: schedule.kind };
}

function nextOneTimeOccurrence(
  schedule: StudentClassSchedule,
  now: Date,
): NextClass | null {
  if (schedule.kind !== 'one_time' || !schedule.classDate) return null;
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(schedule.classDate);
  if (!dateMatch) return null;
  const y = Number.parseInt(dateMatch[1]!, 10);
  const m = Number.parseInt(dateMatch[2]!, 10);
  const d = Number.parseInt(dateMatch[3]!, 10);
  const base = new Date(y, m - 1, d);
  const start = parseHHMM(schedule.startTime, base);
  const end = parseHHMM(schedule.endTime, base);
  if (!start || !end) return null;
  if (end.getTime() <= now.getTime()) return null; // already finished
  return { startsAt: start, endsAt: end, kind: schedule.kind };
}

/**
 * Returns the soonest upcoming class for a group, or null if every schedule is in the past
 * (only possible for one-off schedules) or the group has no schedules at all.
 */
export function computeNextClass(
  schedules: StudentClassSchedule[],
  now: Date = new Date(),
): NextClass | null {
  let best: NextClass | null = null;
  for (const schedule of schedules) {
    const candidate =
      schedule.kind === 'recurring_weekly'
        ? nextRecurringOccurrence(schedule, now)
        : nextOneTimeOccurrence(schedule, now);
    if (!candidate) continue;
    if (!best || candidate.startsAt.getTime() < best.startsAt.getTime()) {
      best = candidate;
    }
  }
  return best;
}

export type UpcomingClassMatch = {
  group: StudentClass;
  schedule: StudentClassSchedule;
  next: NextClass;
};

/** Soonest future session across all enrolled groups (for home when nothing is on today). */
export function findSoonestUpcomingClass(
  classes: StudentClass[],
  now: Date = new Date(),
): UpcomingClassMatch | null {
  let best: UpcomingClassMatch | null = null;
  for (const group of classes) {
    for (const schedule of group.schedules) {
      const candidate =
        schedule.kind === 'recurring_weekly'
          ? nextRecurringOccurrence(schedule, now)
          : nextOneTimeOccurrence(schedule, now);
      if (!candidate) continue;
      if (!best || candidate.startsAt.getTime() < best.next.startsAt.getTime()) {
        best = { group, schedule, next: candidate };
      }
    }
  }
  return best;
}

function formatHHMMFromDate(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function todayScheduleItemFromUpcoming(match: UpcomingClassMatch): TodayScheduleItem {
  const { group, schedule, next } = match;
  return {
    scheduleId: schedule.id,
    lectureGroupId: group.lectureGroupId,
    groupName: group.groupName,
    instituteName: group.instituteName,
    startTime: formatHHMMFromDate(next.startsAt),
    endTime: formatHHMMFromDate(next.endsAt),
    kind: schedule.kind,
    delivery: group.delivery,
  };
}
