import { supabase } from '@/src/services/supabaseClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParentLinkedStudent = {
  studentUserId: string;
  isSelf: boolean;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  mobileNumber: string | null;
  email: string | null;
  linkedAt: Date | null;
  xenStudentId: string | null;
};

export type ParentStudentsResult =
  | { ok: true; students: ParentLinkedStudent[] }
  | { ok: false; error: string };

export type LinkStudentResult =
  | { ok: true; studentUserId: string }
  | { ok: false; code: LinkStudentErrorCode; rawMessage: string };

export type LinkStudentErrorCode =
  | 'identifier_required'
  | 'student_not_found'
  | 'not_a_student'
  | 'cannot_link_self'
  | 'student_limit_reached'
  | 'not_authenticated'
  | 'unknown_error';

export type ClassDeliveryMode = 'physical' | 'online';

export type ClassDeliveryInfo = {
  mode: ClassDeliveryMode;
  venueLabel: string;
  physicalLocationLabel: string | null;
  physicalLocationUrl: string | null;
  onlineJoinUrl: string | null;
};

export type TodayScheduleItem = {
  scheduleId: string;
  lectureGroupId: string;
  groupName: string;
  instituteName: string;
  startTime: string; // HH:MM (24h)
  endTime: string;   // HH:MM (24h)
  kind: 'recurring_weekly' | 'one_time';
  delivery: ClassDeliveryInfo;
};

export function parseClassDelivery(
  raw: Record<string, unknown> | unknown,
  fallbackVenue: string,
): ClassDeliveryInfo {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const modeRaw = asStringOrNull(r.mode) ?? asStringOrNull(r.delivery_mode);
  const mode: ClassDeliveryMode = modeRaw === 'online' ? 'online' : 'physical';
  const venue = asStringOrNull(r.venue_label);
  return {
    mode,
    venueLabel: venue && venue.length > 0 ? venue : fallbackVenue,
    physicalLocationLabel: asStringOrNull(r.physical_location_label),
    physicalLocationUrl: asStringOrNull(r.physical_location_url),
    onlineJoinUrl: asStringOrNull(r.online_join_url),
  };
}

export type AttendanceSummary = {
  total: number;
  present: number;
  /** `null` if there are no recorded sessions in the window. */
  percentage: number | null;
  windowDays: number;
};

// ---------------------------------------------------------------------------
// parent_list_students()
// ---------------------------------------------------------------------------

function asStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parseStudentRow(raw: unknown): ParentLinkedStudent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const studentUserId = asStringOrNull(r.student_user_id);
  if (!studentUserId) return null;

  const linkedAtRaw = asStringOrNull(r.linked_at);
  const linkedAt = linkedAtRaw ? new Date(linkedAtRaw) : null;

  const firstName = asStringOrNull(r.first_name);
  const lastName = asStringOrNull(r.last_name);
  const explicitFull = asStringOrNull(r.full_name);
  const composed = [firstName, lastName].filter(Boolean).join(' ').trim();
  const fullName = explicitFull ?? (composed.length > 0 ? composed : '—');

  return {
    studentUserId,
    isSelf: r.is_self === true,
    fullName,
    firstName,
    lastName,
    mobileNumber: asStringOrNull(r.mobile_number),
    email: asStringOrNull(r.email),
    linkedAt: linkedAt && !Number.isNaN(linkedAt.getTime()) ? linkedAt : null,
    xenStudentId: asStringOrNull(r.xen_student_id),
  };
}

export async function fetchParentStudents(): Promise<ParentStudentsResult> {
  try {
    const { data, error } = await supabase.rpc('parent_list_students');
    if (error) return { ok: false, error: error.message };
    if (!Array.isArray(data)) return { ok: true, students: [] };
    const students = data
      .map(parseStudentRow)
      .filter((s): s is ParentLinkedStudent => s !== null);
    return { ok: true, students };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// parent_link_student(identifier)
// ---------------------------------------------------------------------------

function mapLinkError(rawMessage: string): LinkStudentErrorCode {
  const m = rawMessage.toLowerCase();
  if (m.includes('identifier_required')) return 'identifier_required';
  if (m.includes('student_not_found')) return 'student_not_found';
  if (m.includes('not_a_student')) return 'not_a_student';
  if (m.includes('cannot_link_self')) return 'cannot_link_self';
  if (m.includes('student_limit_reached')) return 'student_limit_reached';
  if (m.includes('not_authenticated')) return 'not_authenticated';
  return 'unknown_error';
}

export async function linkParentStudent(identifier: string): Promise<LinkStudentResult> {
  const trimmed = identifier.trim();
  if (!trimmed) {
    return { ok: false, code: 'identifier_required', rawMessage: 'identifier_required' };
  }
  try {
    const { data, error } = await supabase.rpc('parent_link_student', { p_identifier: trimmed });
    if (error) return { ok: false, code: mapLinkError(error.message), rawMessage: error.message };
    const studentUserId =
      data && typeof data === 'object' && typeof (data as Record<string, unknown>).student_user_id === 'string'
        ? ((data as Record<string, unknown>).student_user_id as string)
        : null;
    if (!studentUserId) {
      return { ok: false, code: 'unknown_error', rawMessage: 'missing student_user_id in response' };
    }
    return { ok: true, studentUserId };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, code: 'unknown_error', rawMessage: message };
  }
}

export async function unlinkParentStudent(studentUserId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('parent_unlink_student', { p_student_user_id: studentUserId });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// student_today_schedule(student_user_id)
// ---------------------------------------------------------------------------

/** Normalize DB / RPC time to HH:MM for display. */
function normalizeHHMM(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(trimmed);
  if (!m) return null;
  const hours = Number.parseInt(m[1]!, 10);
  const minutes = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function localCalendarParts(now: Date = new Date()): { localDate: string; localDow: number } {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return { localDate: `${y}-${m}-${d}`, localDow: now.getDay() };
}

/** Parse HH:MM on the same local calendar day as `base`. */
export function parseHHMMOnLocalDay(hhmm: string, base: Date = new Date()): Date | null {
  const normalized = normalizeHHMM(hhmm);
  if (!normalized) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(normalized);
  if (!m) return null;
  const hours = Number.parseInt(m[1]!, 10);
  const minutes = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes, 0, 0);
}

/** True while the session end time today is still in the future. */
export function isTodayScheduleSessionStillVisible(
  item: TodayScheduleItem,
  now: Date = new Date(),
): boolean {
  const end = parseHHMMOnLocalDay(item.endTime, now);
  if (!end) return true;
  return end.getTime() > now.getTime();
}

export function filterActiveTodayScheduleItems(
  items: TodayScheduleItem[],
  now: Date = new Date(),
): TodayScheduleItem[] {
  return items.filter((item) => isTodayScheduleSessionStillVisible(item, now));
}

function parseTodayRow(raw: unknown): TodayScheduleItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const scheduleId = asStringOrNull(r.schedule_id);
  const lectureGroupId = asStringOrNull(r.lecture_group_id);
  const groupName = asStringOrNull(r.group_name);
  const startTime = normalizeHHMM(asStringOrNull(r.start_time));
  const endTime = normalizeHHMM(asStringOrNull(r.end_time));
  const kindRaw = asStringOrNull(r.kind);
  if (!scheduleId || !lectureGroupId || !groupName || !startTime || !endTime) return null;
  const kind: TodayScheduleItem['kind'] =
    kindRaw === 'one_time' ? 'one_time' : 'recurring_weekly';
  const instituteName = asStringOrNull(r.institute_name) ?? '';
  return {
    scheduleId,
    lectureGroupId,
    groupName,
    instituteName,
    startTime,
    endTime,
    kind,
    delivery: parseClassDelivery(r, instituteName),
  };
}

export async function fetchStudentTodaySchedule(
  studentUserId: string,
  now: Date = new Date(),
): Promise<{ ok: true; items: TodayScheduleItem[] } | { ok: false; error: string }> {
  try {
    const { localDate, localDow } = localCalendarParts(now);
    const { data, error } = await supabase.rpc('student_today_schedule', {
      p_student_user_id: studentUserId,
      p_local_date: localDate,
      p_local_dow: localDow,
    });
    if (error) return { ok: false, error: error.message };
    if (!Array.isArray(data)) return { ok: true, items: [] };
    const items = filterActiveTodayScheduleItems(
      data.map(parseTodayRow).filter((x): x is TodayScheduleItem => x !== null),
      now,
    );
    return { ok: true, items };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// student_attendance_summary(student_user_id, window_days)
// ---------------------------------------------------------------------------

function localTodayDateString(now: Date = new Date()): string {
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

export async function fetchStudentAttendanceSummary(
  studentUserId: string,
  windowDays = 30,
): Promise<{ ok: true; summary: AttendanceSummary } | { ok: false; error: string }> {
  try {
    const now = new Date();
    const { data, error } = await supabase.rpc('student_attendance_summary', {
      p_student_user_id: studentUserId,
      p_window_days: windowDays,
      p_local_date: localTodayDateString(now),
      p_local_time: localTimeString(now),
    });
    if (error) return { ok: false, error: error.message };
    if (!data || typeof data !== 'object') {
      return { ok: true, summary: { total: 0, present: 0, percentage: null, windowDays } };
    }
    const r = data as Record<string, unknown>;
    const total = typeof r.total === 'number' ? r.total : Number.parseInt(String(r.total ?? 0), 10) || 0;
    const present = typeof r.present === 'number' ? r.present : Number.parseInt(String(r.present ?? 0), 10) || 0;
    const pctRaw = r.percentage;
    let percentage: number | null = null;
    if (typeof pctRaw === 'number') {
      percentage = pctRaw;
    } else if (typeof pctRaw === 'string') {
      const parsed = Number.parseFloat(pctRaw);
      percentage = Number.isFinite(parsed) ? parsed : null;
    }
    return {
      ok: true,
      summary: {
        total,
        present,
        percentage,
        windowDays:
          typeof r.window_days === 'number'
            ? r.window_days
            : Number.parseInt(String(r.window_days ?? windowDays), 10) || windowDays,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
