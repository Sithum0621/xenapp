import { getTeacherUnifiedGroupsCached, type TeacherUnifiedGroupRow } from '@/src/services/teacherGroupsApi';
import { formatTimeShort } from '@/src/services/teacherGroupWorkspaceApi';
import { supabase } from '@/src/services/supabaseClient';

export type TeacherTodayScheduleItem = {
  scheduleId: string;
  groupId: string;
  groupSource: 'institute' | 'personal';
  groupName: string;
  instituteName: string | null;
  startTime: string;
  endTime: string;
};

type ScheduleRow = {
  id: string;
  kind: string;
  day_of_week: number | null;
  class_date: string | null;
  schedule_year: number | null;
  start_time: string;
  end_time: string;
  lecture_group_id: string | null;
  teacher_personal_group_id: string | null;
};

function localDateParts(now: Date) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return { localDate: `${y}-${m}-${d}`, localDow: now.getDay(), calendarYear: y };
}

function scheduleMatchesToday(row: ScheduleRow, now: Date): boolean {
  const { localDate, localDow, calendarYear } = localDateParts(now);
  if (row.kind === 'recurring_weekly') {
    return (
      row.day_of_week === localDow &&
      (row.schedule_year == null || row.schedule_year === calendarYear)
    );
  }
  if (row.kind === 'one_time') {
    return row.class_date === localDate;
  }
  return false;
}

function parseHHMMOnLocalDay(hhmm: string, base: Date): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const hours = Number.parseInt(m[1]!, 10);
  const minutes = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes, 0, 0);
}

function isSessionStillVisible(item: TeacherTodayScheduleItem, now: Date): boolean {
  const end = parseHHMMOnLocalDay(item.endTime, now);
  if (!end) return true;
  return end.getTime() > now.getTime();
}

function mapScheduleRow(raw: Record<string, unknown>): ScheduleRow | null {
  const id = typeof raw.id === 'string' ? raw.id : null;
  if (!id) return null;
  return {
    id,
    kind: String(raw.kind ?? ''),
    day_of_week:
      raw.day_of_week === null || raw.day_of_week === undefined ? null : Number(raw.day_of_week),
    class_date: raw.class_date ? String(raw.class_date) : null,
    schedule_year:
      raw.schedule_year === null || raw.schedule_year === undefined ? null : Number(raw.schedule_year),
    start_time: String(raw.start_time ?? ''),
    end_time: String(raw.end_time ?? ''),
    lecture_group_id: raw.lecture_group_id ? String(raw.lecture_group_id) : null,
    teacher_personal_group_id: raw.teacher_personal_group_id
      ? String(raw.teacher_personal_group_id)
      : null,
  };
}

export function isTeacherScheduleItemStillActive(
  item: Pick<TeacherTodayScheduleItem, 'endTime'>,
  now: Date = new Date(),
): boolean {
  return isSessionStillVisible(item as TeacherTodayScheduleItem, now);
}

export type TeacherTimetableItem = TeacherTodayScheduleItem & {
  kind: 'recurring_weekly' | 'one_time';
  dayOfWeek: number | null;
  classDate: string | null;
};

async function loadTeacherScheduleContext(): Promise<{
  scheduleRows: ScheduleRow[];
  groupById: Map<string, Awaited<ReturnType<typeof getTeacherUnifiedGroupsCached>>['rows'][number]>;
  error: string | null;
}> {
  const groupsRes = await getTeacherUnifiedGroupsCached();
  if (groupsRes.error) {
    return { scheduleRows: [], groupById: new Map(), error: groupsRes.error };
  }

  const instituteIds = groupsRes.rows.filter((g) => g.source === 'institute').map((g) => g.id);
  const personalIds = groupsRes.rows.filter((g) => g.source === 'personal').map((g) => g.id);
  const scheduleRows: ScheduleRow[] = [];

  if (instituteIds.length > 0) {
    const { data, error } = await supabase
      .from('group_schedules')
      .select(
        'id, kind, day_of_week, class_date, schedule_year, start_time, end_time, lecture_group_id, teacher_personal_group_id',
      )
      .in('lecture_group_id', instituteIds);
    if (error) return { scheduleRows: [], groupById: new Map(), error: error.message };
    for (const raw of data ?? []) {
      const row = mapScheduleRow(raw as Record<string, unknown>);
      if (row) scheduleRows.push(row);
    }
  }

  if (personalIds.length > 0) {
    const { data, error } = await supabase
      .from('group_schedules')
      .select(
        'id, kind, day_of_week, class_date, schedule_year, start_time, end_time, lecture_group_id, teacher_personal_group_id',
      )
      .in('teacher_personal_group_id', personalIds);
    if (error) return { scheduleRows: [], groupById: new Map(), error: error.message };
    for (const raw of data ?? []) {
      const row = mapScheduleRow(raw as Record<string, unknown>);
      if (row) scheduleRows.push(row);
    }
  }

  return {
    scheduleRows,
    groupById: new Map(groupsRes.rows.map((g) => [g.id, g])),
    error: null,
  };
}

function mapRowToTimetableItem(
  row: ScheduleRow,
  group: TeacherUnifiedGroupRow,
): TeacherTimetableItem | null {
  const startTime = formatTimeShort(row.start_time);
  const endTime = formatTimeShort(row.end_time);
  if (!startTime || !endTime) return null;

  return {
    scheduleId: row.id,
    groupId: group.id,
    groupSource: group.source,
    groupName: group.name,
    instituteName: group.institute_name,
    kind: row.kind === 'one_time' ? 'one_time' : 'recurring_weekly',
    dayOfWeek: row.day_of_week,
    classDate: row.class_date,
    startTime,
    endTime,
  };
}

export async function fetchTeacherTodaySchedule(now: Date = new Date()): Promise<{
  items: TeacherTodayScheduleItem[];
  error: string | null;
}> {
  const { scheduleRows, groupById, error } = await loadTeacherScheduleContext();
  if (error) return { items: [], error };

  const items: TeacherTodayScheduleItem[] = [];

  for (const row of scheduleRows) {
    if (!scheduleMatchesToday(row, now)) continue;

    const groupId = row.lecture_group_id ?? row.teacher_personal_group_id;
    if (!groupId) continue;

    const group = groupById.get(groupId);
    if (!group) continue;

    const mapped = mapRowToTimetableItem(row, group);
    if (!mapped) continue;

    items.push(mapped);
  }

  items.sort((a, b) => a.startTime.localeCompare(b.startTime));
  return { items, error: null };
}

export async function fetchTeacherTimetable(now: Date = new Date()): Promise<{
  weekly: TeacherTimetableItem[];
  oneTime: TeacherTimetableItem[];
  error: string | null;
}> {
  const { scheduleRows, groupById, error } = await loadTeacherScheduleContext();
  if (error) return { weekly: [], oneTime: [], error };

  const { localDate, calendarYear } = localDateParts(now);
  const weekly: TeacherTimetableItem[] = [];
  const oneTime: TeacherTimetableItem[] = [];

  for (const row of scheduleRows) {
    const groupId = row.lecture_group_id ?? row.teacher_personal_group_id;
    if (!groupId) continue;

    const group = groupById.get(groupId);
    if (!group) continue;

    if (row.kind === 'recurring_weekly') {
      if (row.day_of_week === null) continue;
      if (row.schedule_year != null && row.schedule_year !== calendarYear) continue;
      const mapped = mapRowToTimetableItem(row, group);
      if (mapped) weekly.push(mapped);
      continue;
    }

    if (row.kind === 'one_time' && row.class_date && row.class_date >= localDate) {
      const mapped = mapRowToTimetableItem(row, group);
      if (mapped) oneTime.push(mapped);
    }
  }

  const byStart = (a: TeacherTimetableItem, b: TeacherTimetableItem) =>
    a.startTime.localeCompare(b.startTime);

  weekly.sort((a, b) => {
    const dayA = a.dayOfWeek ?? 7;
    const dayB = b.dayOfWeek ?? 7;
    if (dayA !== dayB) return dayA - dayB;
    return byStart(a, b);
  });
  oneTime.sort((a, b) => {
    const dateCmp = (a.classDate ?? '').localeCompare(b.classDate ?? '');
    if (dateCmp !== 0) return dateCmp;
    return byStart(a, b);
  });

  return { weekly, oneTime, error: null };
}
