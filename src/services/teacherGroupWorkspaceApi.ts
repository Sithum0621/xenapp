import { invalidateSessionCache, SessionCacheKeys } from '@/src/services/sessionDataCache';
import { supabase } from '@/src/services/supabaseClient';
import type { TeacherGroupRouteContext, TeacherGroupSource, WeekdayKey } from '@/src/utils/teacherGroupRouteParams';
import { WEEKDAY_KEY_TO_JS_DOW } from '@/src/utils/teacherGroupRouteParams';
import { mapScheduleDbError } from '@/src/utils/scheduleTimeValidation';

export type GroupScheduleRow = {
  id: string;
  kind: 'recurring_weekly' | 'one_time';
  day_of_week: number | null;
  class_date: string | null;
  start_time: string;
  end_time: string;
};

export type InstituteStudentRow = {
  student_user_id: string;
  full_name: string;
};

export type PersonalRosterRow = {
  id: string;
  display_name: string;
  student_user_id: string | null;
};

export type McqQuestionRow = {
  id: string;
  prompt: string;
  created_at: string;
  options: { id: string; ordinal: number; body: string; is_correct: boolean }[];
};

export type GroupStatsSnapshot = {
  totalStudents: number;
  todayAttendancePresent: number;
  collectedCents: number;
  pendingCents: number;
};

export type TeacherAttendanceSlot = {
  schedule_id: string;
  kind: string;
  start_time: string;
  end_time: string;
  session_id: string | null;
  marked_count: number;
  present_count: number;
};

export type TeacherAttendanceMarkInput = {
  student_user_id?: string;
  personal_roster_id?: string;
  present: boolean;
};

function groupColumn(source: TeacherGroupSource): 'lecture_group_id' | 'teacher_personal_group_id' {
  return source === 'institute' ? 'lecture_group_id' : 'teacher_personal_group_id';
}

function monthStartIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeTime(t: string): string {
  const s = t.trim();
  if (!s) return '09:00:00';
  return s.length <= 5 ? `${s}:00` : s;
}

/** Strip HH:MM:SS to HH:MM for inputs */
export function formatTimeShort(pgTime: string | null | undefined): string {
  if (!pgTime) return '';
  const parts = pgTime.split(':');
  if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
  return pgTime;
}

export async function fetchGroupStats(ctx: TeacherGroupRouteContext): Promise<{
  stats: GroupStatsSnapshot;
  error: string | null;
}> {
  const col = groupColumn(ctx.source);

  try {
    let totalStudents = 0;
    if (ctx.source === 'institute') {
      const { count, error } = await supabase
        .from('lecture_group_students')
        .select('*', { count: 'exact', head: true })
        .eq('lecture_group_id', ctx.groupId);
      if (error) return { stats: emptyStats(), error: error.message };
      totalStudents = count ?? 0;
    } else {
      const { count, error } = await supabase
        .from('teacher_personal_roster_entries')
        .select('*', { count: 'exact', head: true })
        .eq('teacher_personal_group_id', ctx.groupId);
      if (error) return { stats: emptyStats(), error: error.message };
      totalStudents = count ?? 0;
    }

    const day = todayIso();
    const { data: sessRows, error: se } = await supabase
      .from('group_attendance_sessions')
      .select('id')
      .eq('session_date', day)
      .eq(col, ctx.groupId);
    if (se) return { stats: emptyStats(), error: se.message };

    let todayAttendancePresent = 0;
    const sessionIds = (sessRows ?? []).map((r: { id: string }) => r.id);
    if (sessionIds.length > 0) {
      const { count, error } = await supabase
        .from('group_attendance_marks')
        .select('*', { count: 'exact', head: true })
        .in('session_id', sessionIds)
        .eq('present', true);
      if (error) return { stats: emptyStats(), error: error.message };
      todayAttendancePresent = count ?? 0;
    }

    const billingMonth = monthStartIso();
    const { data: pays, error: pe } = await supabase
      .from('group_payment_records')
      .select('amount_cents, status')
      .eq(col, ctx.groupId)
      .eq('billing_month', billingMonth);

    if (pe) return { stats: emptyStats(), error: pe.message };

    let collectedCents = 0;
    let pendingCents = 0;
    for (const p of pays ?? []) {
      const row = p as { amount_cents: number; status: string };
      if (row.status === 'collected') collectedCents += row.amount_cents;
      else pendingCents += row.amount_cents;
    }

    return {
      stats: {
        totalStudents,
        todayAttendancePresent,
        collectedCents,
        pendingCents,
      },
      error: null,
    };
  } catch (e) {
    return { stats: emptyStats(), error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

function emptyStats(): GroupStatsSnapshot {
  return { totalStudents: 0, todayAttendancePresent: 0, collectedCents: 0, pendingCents: 0 };
}

export async function fetchSchedules(ctx: TeacherGroupRouteContext): Promise<{
  rows: GroupScheduleRow[];
  error: string | null;
}> {
  const col = groupColumn(ctx.source);
  const { data, error } = await supabase
    .from('group_schedules')
    .select('id, kind, day_of_week, class_date, start_time, end_time, created_at')
    .eq(col, ctx.groupId)
    .order('created_at', { ascending: true });

  if (error) return { rows: [], error: error.message };

  const rows: GroupScheduleRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    kind: r.kind as GroupScheduleRow['kind'],
    day_of_week: r.day_of_week === null || r.day_of_week === undefined ? null : Number(r.day_of_week),
    class_date: r.class_date ? String(r.class_date) : null,
    start_time: formatTimeShort(String(r.start_time ?? '')),
    end_time: formatTimeShort(String(r.end_time ?? '')),
  }));

  return { rows, error: null };
}

export async function insertWeeklySchedule(
  ctx: TeacherGroupRouteContext,
  weekday: WeekdayKey,
  startTime: string,
  endTime: string,
): Promise<{ error: string | null }> {
  const dow = WEEKDAY_KEY_TO_JS_DOW[weekday];
  const base = {
    kind: 'recurring_weekly' as const,
    day_of_week: dow,
    class_date: null as string | null,
    start_time: normalizeTime(startTime),
    end_time: normalizeTime(endTime),
    schedule_year: new Date().getFullYear(),
  };
  const payload =
    ctx.source === 'institute'
      ? { ...base, lecture_group_id: ctx.groupId, teacher_personal_group_id: null as string | null }
      : { ...base, teacher_personal_group_id: ctx.groupId, lecture_group_id: null as string | null };

  const { error } = await supabase.from('group_schedules').insert(payload);
  if (!error) {
    invalidateSessionCache(SessionCacheKeys.TEACHER_TODAY_SCHEDULE);
  }
  return { error: error ? mapScheduleDbError(error.message) : null };
}

export async function insertOneTimeSchedule(
  ctx: TeacherGroupRouteContext,
  classDate: string,
  startTime: string,
  endTime: string,
): Promise<{ error: string | null }> {
  const base = {
    kind: 'one_time' as const,
    day_of_week: null as number | null,
    class_date: classDate.trim(),
    start_time: normalizeTime(startTime),
    end_time: normalizeTime(endTime),
    schedule_year: null as number | null,
  };
  const payload =
    ctx.source === 'institute'
      ? { ...base, lecture_group_id: ctx.groupId, teacher_personal_group_id: null as string | null }
      : { ...base, teacher_personal_group_id: ctx.groupId, lecture_group_id: null as string | null };

  const { error } = await supabase.from('group_schedules').insert(payload);
  if (!error) {
    invalidateSessionCache(SessionCacheKeys.TEACHER_TODAY_SCHEDULE);
  }
  return { error: error ? mapScheduleDbError(error.message) : null };
}

export async function deleteSchedule(scheduleId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('group_schedules')
    .delete()
    .eq('id', scheduleId)
    .select('id');

  if (error) return { error: mapScheduleDbError(error.message) };
  if (!data?.length) return { error: 'schedule_not_found' };
  invalidateSessionCache(SessionCacheKeys.TEACHER_TODAY_SCHEDULE);
  return { error: null };
}

export async function fetchInstituteStudents(
  lectureGroupId: string,
): Promise<{ rows: InstituteStudentRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('lecture_group_students')
    .select('student_user_id, profiles ( full_name )')
    .eq('lecture_group_id', lectureGroupId);

  if (error) return { rows: [], error: error.message };

  const rows: InstituteStudentRow[] = (data ?? []).map((raw: unknown) => {
    const r = raw as {
      student_user_id: string;
      profiles: { full_name: string | null } | { full_name: string | null }[] | null;
    };
    const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    const name = prof?.full_name?.trim() ? prof.full_name.trim() : r.student_user_id.slice(0, 8) + '…';
    return { student_user_id: r.student_user_id, full_name: name };
  });

  return { rows, error: null };
}

export async function fetchPersonalRoster(
  personalGroupId: string,
): Promise<{ rows: PersonalRosterRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('teacher_personal_roster_entries')
    .select('id, display_name, student_user_id')
    .eq('teacher_personal_group_id', personalGroupId)
    .order('created_at', { ascending: true });

  if (error) return { rows: [], error: error.message };

  const rows = (data ?? []).map((r: { id: string; display_name: string; student_user_id: string | null }) => ({
    id: r.id,
    display_name: r.display_name,
    student_user_id: r.student_user_id ?? null,
  }));
  return { rows, error: null };
}

export async function insertPersonalRosterEntry(
  personalGroupId: string,
  displayName: string,
): Promise<{ error: string | null }> {
  const name = displayName.trim();
  if (!name) return { error: 'name_required' };

  const { error } = await supabase.from('teacher_personal_roster_entries').insert({
    teacher_personal_group_id: personalGroupId,
    display_name: name,
  });
  if (!error) {
    invalidateSessionCache(SessionCacheKeys.TEACHER_DASHBOARD_OVERVIEW);
  }
  return { error: error?.message ?? null };
}

export async function deletePersonalRosterEntry(entryId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('teacher_personal_roster_entries').delete().eq('id', entryId);
  if (!error) {
    invalidateSessionCache(SessionCacheKeys.TEACHER_DASHBOARD_OVERVIEW);
  }
  return { error: error?.message ?? null };
}

export async function fetchMcqQuestions(ctx: TeacherGroupRouteContext): Promise<{
  rows: McqQuestionRow[];
  error: string | null;
}> {
  const col = groupColumn(ctx.source);
  const { data: qs, error: qe } = await supabase
    .from('teacher_group_mcq_questions')
    .select('id, prompt, created_at')
    .eq(col, ctx.groupId)
    .order('created_at', { ascending: false });

  if (qe) return { rows: [], error: qe.message };

  const rows: McqQuestionRow[] = [];
  for (const q of qs ?? []) {
    const qid = (q as { id: string }).id;
    const { data: opts, error: oe } = await supabase
      .from('teacher_group_mcq_options')
      .select('id, ordinal, body, is_correct')
      .eq('question_id', qid)
      .order('ordinal', { ascending: true });

    if (oe) return { rows: [], error: oe.message };

    rows.push({
      id: qid,
      prompt: (q as { prompt: string }).prompt,
      created_at: (q as { created_at: string }).created_at,
      options: (opts ?? []).map((o: Record<string, unknown>) => ({
        id: String(o.id),
        ordinal: Number(o.ordinal),
        body: String(o.body),
        is_correct: Boolean(o.is_correct),
      })),
    });
  }

  return { rows, error: null };
}

export async function createMcqQuestion(
  ctx: TeacherGroupRouteContext,
  prompt: string,
  answers: [string, string, string, string],
  correctIndex: 0 | 1 | 2 | 3,
): Promise<{ error: string | null }> {
  const col = groupColumn(ctx.source);
  const stem = prompt.trim();
  if (!stem) return { error: 'prompt_required' };

  const trimmed = answers.map((a) => a.trim());
  if (trimmed.some((a) => !a)) return { error: 'answers_required' };

  const qPayload =
    ctx.source === 'institute'
      ? { prompt: stem, lecture_group_id: ctx.groupId, teacher_personal_group_id: null as string | null }
      : { prompt: stem, teacher_personal_group_id: ctx.groupId, lecture_group_id: null as string | null };

  const { data: qRow, error: qe } = await supabase
    .from('teacher_group_mcq_questions')
    .insert(qPayload)
    .select('id')
    .single();

  if (qe || !qRow?.id) {
    return { error: qe?.message ?? 'insert_failed' };
  }

  const questionId = qRow.id as string;

  const optionRows = trimmed.map((body, i) => ({
    question_id: questionId,
    ordinal: i + 1,
    body,
    is_correct: i === correctIndex,
  }));

  const { error: oe } = await supabase.from('teacher_group_mcq_options').insert(optionRows);

  if (oe) {
    await supabase.from('teacher_group_mcq_questions').delete().eq('id', questionId);
    return { error: oe.message };
  }

  return { error: null };
}

export async function fetchAttendanceSlotsForDate(
  ctx: TeacherGroupRouteContext,
  sessionDate: string,
): Promise<{ slots: TeacherAttendanceSlot[]; error: string | null }> {
  const { data, error } = await supabase.rpc('teacher_list_attendance_slots_for_date', {
    p_group_id: ctx.groupId,
    p_group_source: ctx.source === 'institute' ? 'institute' : 'personal',
    p_session_date: sessionDate,
  });

  if (error) return { slots: [], error: error.message };

  const slots: TeacherAttendanceSlot[] = (data ?? []).map((r: Record<string, unknown>) => ({
    schedule_id: String(r.schedule_id),
    kind: String(r.kind ?? ''),
    start_time: String(r.start_time ?? ''),
    end_time: String(r.end_time ?? ''),
    session_id: r.session_id ? String(r.session_id) : null,
    marked_count: Number(r.marked_count ?? 0),
    present_count: Number(r.present_count ?? 0),
  }));

  return { slots, error: null };
}

export async function fetchAttendanceMarksForSession(
  sessionId: string,
): Promise<{
  marks: { student_user_id: string | null; personal_roster_id: string | null; present: boolean }[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('group_attendance_marks')
    .select('student_user_id, personal_roster_id, present')
    .eq('session_id', sessionId);

  if (error) return { marks: [], error: error.message };

  const marks = (data ?? []).map((r: Record<string, unknown>) => ({
    student_user_id: r.student_user_id ? String(r.student_user_id) : null,
    personal_roster_id: r.personal_roster_id ? String(r.personal_roster_id) : null,
    present: Boolean(r.present),
  }));

  return { marks, error: null };
}

export async function saveAttendanceForSlot(
  ctx: TeacherGroupRouteContext,
  scheduleId: string,
  sessionDate: string,
  marks: TeacherAttendanceMarkInput[],
): Promise<{ sessionId: string | null; error: string | null }> {
  const payload = marks.map((m) => {
    const row: Record<string, unknown> = { present: m.present };
    if (m.student_user_id) row.student_user_id = m.student_user_id;
    if (m.personal_roster_id) row.personal_roster_id = m.personal_roster_id;
    return row;
  });

  const { data, error } = await supabase.rpc('teacher_save_attendance_for_slot', {
    p_group_id: ctx.groupId,
    p_group_source: ctx.source === 'institute' ? 'institute' : 'personal',
    p_schedule_id: scheduleId,
    p_session_date: sessionDate,
    p_marks: payload,
  });

  if (error) return { sessionId: null, error: error.message };
  return { sessionId: data ? String(data) : null, error: null };
}

export type GroupHelloPushResult = {
  group_name: string;
  students_count: number;
  notifications_sent: number;
};

export async function sendGroupHelloPush(
  ctx: TeacherGroupRouteContext,
): Promise<{ result: GroupHelloPushResult | null; error: string | null; errorCode: string | null }> {
  const { data, error } = await supabase.rpc('teacher_send_group_hello_push', {
    p_group_id: ctx.groupId,
    p_group_source: ctx.source === 'institute' ? 'institute' : 'personal',
  });

  if (error) {
    const msg = error.message.toLowerCase();
    const errorCode = msg.includes('no_students_in_group')
      ? 'no_students_in_group'
      : msg.includes('not_authorized')
        ? 'not_authorized'
        : 'unknown';
    return { result: null, error: error.message, errorCode };
  }

  const row = data as Record<string, unknown> | null;
  if (!row || row.ok !== true) {
    return { result: null, error: 'Unexpected response from server.', errorCode: 'unknown' };
  }

  return {
    result: {
      group_name: String(row.group_name ?? ctx.title),
      students_count: Number(row.students_count ?? 0),
      notifications_sent: Number(row.notifications_sent ?? 0),
    },
    error: null,
    errorCode: null,
  };
}
