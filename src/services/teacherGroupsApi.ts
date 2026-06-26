import { supabase } from '@/src/services/supabaseClient';
import {
  invalidateTeacherDashboardCaches,
  SessionCacheKeys,
  sessionCacheGetOrFetch,
} from '@/src/services/sessionDataCache';
import type { WeekdayKey } from '@/src/utils/teacherGroupRouteParams';
import { WEEKDAY_KEY_TO_JS_DOW } from '@/src/utils/teacherGroupRouteParams';
import {
  dateMatchesWeekday,
  normalizeScheduleTime,
  scheduleYearFromDate,
} from '@/src/utils/weeklyClassSchedule';

export type TeacherLectureGroupRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  is_primary: boolean;
  institute_id: string | null;
  institute_name: string | null;
};

/** Institute lecture group rows + independently managed personal groups (`teacher_personal_groups`). */
export type TeacherUnifiedGroupRow = TeacherLectureGroupRow & {
  source: 'institute' | 'personal';
};

function coerceUuid(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function parseInstituteNameFromEmbed(institutesVal: unknown): string | null {
  if (!institutesVal || typeof institutesVal !== 'object') return null;
  if (Array.isArray(institutesVal)) {
    const first = institutesVal[0];
    if (first && typeof first === 'object') {
      const n = (first as { name?: unknown }).name;
      return typeof n === 'string' && n.trim() ? n.trim() : null;
    }
    return null;
  }
  const n = (institutesVal as { name?: unknown }).name;
  return typeof n === 'string' && n.trim() ? n.trim() : null;
}

function parseRow(raw: Record<string, unknown>): TeacherLectureGroupRow | null {
  const id = typeof raw.id === 'string' ? raw.id : null;
  const name = typeof raw.name === 'string' ? raw.name : null;
  if (!id || !name) return null;
  const description = typeof raw.description === 'string' ? raw.description : null;
  const created_at = typeof raw.created_at === 'string' ? raw.created_at : '';
  const is_primary = raw.is_primary === true;
  const institute_id = coerceUuid(raw.institute_id);
  const institute_name_rpc =
    typeof raw.institute_name === 'string' && raw.institute_name.trim() ? raw.institute_name.trim() : null;
  const institute_name_embed = parseInstituteNameFromEmbed(raw.institutes);
  return {
    id,
    name,
    description,
    created_at,
    is_primary,
    institute_id,
    institute_name: institute_name_rpc ?? institute_name_embed,
  };
}

function normalizeRpcPayload(data: unknown): TeacherLectureGroupRow[] {
  const out: TeacherLectureGroupRow[] = [];
  const rawUnknown = data as unknown;
  if (Array.isArray(rawUnknown)) {
    for (const item of rawUnknown) {
      if (item && typeof item === 'object') {
        const r = parseRow(item as Record<string, unknown>);
        if (r) out.push(r);
      }
    }
  } else if (rawUnknown && typeof rawUnknown === 'object') {
    const r = parseRow(rawUnknown as Record<string, unknown>);
    if (r) out.push(r);
  }
  return out;
}

function rpcNotDeployedMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('could not find the function') ||
    m.includes('schema cache') ||
    m.includes('teacher_list_my_lecture_groups')
  );
}

/** Load institute lecture groups without RPC — junction IDs + lecture_groups `.in()`, no nested embed (avoids null embed noise). */
export async function teacherListMyLectureGroupsDirect(): Promise<{
  rows: TeacherLectureGroupRow[];
  error: string | null;
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return { rows: [], error: null };
  }
  const uid = user.id;

  const [{ data: linkRows, error: ej }, { data: primaryIdRows, error: ep }] = await Promise.all([
    supabase.from('lecture_group_teachers').select('lecture_group_id').eq('teacher_user_id', uid),
    supabase.from('lecture_groups').select('id').eq('primary_teacher_user_id', uid),
  ]);

  if (ej) {
    return { rows: [], error: ej.message };
  }
  if (ep) {
    return { rows: [], error: ep.message };
  }

  const ids = new Set<string>();
  for (const raw of primaryIdRows ?? []) {
    const id = raw && typeof raw === 'object' ? coerceUuid((raw as Record<string, unknown>).id) : null;
    if (id) ids.add(id);
  }
  for (const raw of linkRows ?? []) {
    const id =
      raw && typeof raw === 'object' ? coerceUuid((raw as Record<string, unknown>).lecture_group_id) : null;
    if (id) ids.add(id);
  }

  if (ids.size === 0) {
    return { rows: [], error: null };
  }

  const { data: groupRows, error: eg } = await supabase
    .from('lecture_groups')
    .select('id, name, description, created_at, primary_teacher_user_id, institute_id, institutes ( name )')
    .in('id', [...ids]);

  if (eg) {
    return { rows: [], error: eg.message };
  }

  const rowsUnsorted: TeacherLectureGroupRow[] = [];
  for (const raw of groupRows ?? []) {
    const parsed = parseRow(raw as Record<string, unknown>);
    if (!parsed) continue;
    const primaryId = coerceUuid((raw as Record<string, unknown>).primary_teacher_user_id);
    rowsUnsorted.push({
      ...parsed,
      is_primary: primaryId !== null && primaryId === uid,
    });
  }

  rowsUnsorted.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return { rows: rowsUnsorted, error: null };
}

export async function teacherListMyLectureGroups(): Promise<{
  rows: TeacherLectureGroupRow[];
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('teacher_list_my_lecture_groups');

  if (!error) {
    const rpcRows = normalizeRpcPayload(data);
    /** RPC can return empty if mis-deployed/stale yet call succeeds — direct REST path often still works. */
    if (rpcRows.length > 0) {
      return { rows: rpcRows, error: null };
    }
    const directFromEmptyRpc = await teacherListMyLectureGroupsDirect();
    if (directFromEmptyRpc.rows.length > 0) {
      return directFromEmptyRpc;
    }
    return { rows: [], error: null };
  }

  if (rpcNotDeployedMessage(error.message)) {
    return teacherListMyLectureGroupsDirect();
  }

  return { rows: [], error: error.message };
}

export type ClassDeliveryMode = 'physical' | 'online';

export type PersonalGroupRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

function parseMonthlyFeeCents(feeInput: string): number | null {
  const cleaned = feeInput.replace(/,/g, '').trim();
  if (!cleaned) return null;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export async function teacherListPersonalGroups(): Promise<{
  rows: PersonalGroupRow[];
  error: string | null;
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return { rows: [], error: null };
  }

  const { data, error } = await supabase
    .from('teacher_personal_groups')
    .select('id, name, description, created_at')
    .eq('teacher_user_id', user.id)
    .order('name', { ascending: true });

  if (error) {
    const low = error.message.toLowerCase();
    if (low.includes('does not exist') || low.includes('schema cache')) {
      return { rows: [], error: null };
    }
    return { rows: [], error: error.message };
  }

  const rows: PersonalGroupRow[] = [];
  for (const r of data ?? []) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id : null;
    const name = typeof o.name === 'string' ? o.name : null;
    if (!id || !name) continue;
    rows.push({
      id,
      name,
      description: typeof o.description === 'string' ? o.description : null,
      created_at: typeof o.created_at === 'string' ? o.created_at : '',
    });
  }

  return { rows, error: null };
}

function sortUnified(a: TeacherUnifiedGroupRow, b: TeacherUnifiedGroupRow): number {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

/** Institute-linked lecture groups plus teacher-owned personal groups in one merged list. */
export async function teacherListMyUnifiedGroups(): Promise<{
  rows: TeacherUnifiedGroupRow[];
  error: string | null;
  partialWarning: string | null;
}> {
  const [instituteRes, personalRes] = await Promise.all([
    teacherListMyLectureGroups(),
    teacherListPersonalGroups(),
  ]);

  const rows: TeacherUnifiedGroupRow[] = [
    ...instituteRes.rows.map(
      (r): TeacherUnifiedGroupRow => ({
        ...r,
        source: 'institute',
      }),
    ),
    ...personalRes.rows.map(
      (r): TeacherUnifiedGroupRow => ({
        id: r.id,
        name: r.name,
        description: r.description,
        created_at: r.created_at,
        is_primary: false,
        institute_id: null,
        institute_name: null,
        source: 'personal',
      }),
    ),
  ].sort(sortUnified);

  if (instituteRes.error && personalRes.error) {
    return { rows: [], error: instituteRes.error || personalRes.error, partialWarning: null };
  }

  const partialWarning = instituteRes.error ?? personalRes.error ?? null;
  return { rows, error: null, partialWarning };
}

export function getTeacherUnifiedGroupsCached(options?: { force?: boolean }) {
  return sessionCacheGetOrFetch(
    SessionCacheKeys.TEACHER_UNIFIED_GROUPS,
    () => teacherListMyUnifiedGroups(),
    {
      force: options?.force,
      shouldCache: (res) => !res.error,
    },
  );
}

export type TeacherCreatePersonalGroupSchedule = {
  weekday: WeekdayKey;
  /** YYYY-MM-DD — must fall on `weekday`; sets the schedule year for recurring weekly slot. */
  classDate: string;
  startTime: string;
  endTime: string;
};

export async function teacherCreatePersonalGroup(payload: {
  name: string;
  description?: string;
  deliveryMode: ClassDeliveryMode;
  monthlyFeeInput: string;
  weeklySchedule: TeacherCreatePersonalGroupSchedule;
}): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return { error: 'Not signed in' };
  }
  const name = payload.name.trim();
  if (!name) {
    return { error: 'name_required' };
  }
  const monthlyFeeCents = parseMonthlyFeeCents(payload.monthlyFeeInput);
  if (monthlyFeeCents === null) {
    return { error: 'invalid_fee' };
  }
  const description = payload.description?.trim() ? payload.description.trim() : null;
  const deliveryMode = payload.deliveryMode === 'online' ? 'online' : 'physical';

  const classDate = payload.weeklySchedule.classDate.trim();
  if (!dateMatchesWeekday(classDate, payload.weeklySchedule.weekday)) {
    return { error: 'schedule_day_mismatch' };
  }
  const scheduleYear = scheduleYearFromDate(classDate);
  if (scheduleYear === null) {
    return { error: 'schedule_invalid_date' };
  }

  const row: Record<string, unknown> = {
    teacher_user_id: user.id,
    name,
    description,
    default_monthly_fee_cents: monthlyFeeCents,
    delivery_mode: deliveryMode,
  };

  let insertRes = await supabase.from('teacher_personal_groups').insert(row).select('id').single();

  if (insertRes.error) {
    const low = insertRes.error.message.toLowerCase();
    if (low.includes('delivery_mode')) {
      insertRes = await supabase
        .from('teacher_personal_groups')
        .insert({
          teacher_user_id: user.id,
          name,
          description,
          default_monthly_fee_cents: monthlyFeeCents,
        })
        .select('id')
        .single();
    }
  }

  if (insertRes.error || !insertRes.data?.id) {
    return { error: insertRes.error?.message ?? 'create_failed' };
  }

  const groupId = String(insertRes.data.id);
  const dow = WEEKDAY_KEY_TO_JS_DOW[payload.weeklySchedule.weekday];
  const { error: scheduleError } = await supabase.from('group_schedules').insert({
    teacher_personal_group_id: groupId,
    lecture_group_id: null,
    kind: 'recurring_weekly',
    day_of_week: dow,
    class_date: null,
    start_time: normalizeScheduleTime(payload.weeklySchedule.startTime),
    end_time: normalizeScheduleTime(payload.weeklySchedule.endTime),
    schedule_year: scheduleYear,
  });

  if (scheduleError) {
    await supabase.from('teacher_personal_groups').delete().eq('id', groupId);
    return { error: scheduleError.message };
  }

  invalidateTeacherDashboardCaches();
  return { error: null };
}

export async function teacherUpdatePersonalGroup(payload: {
  id: string;
  name: string;
  description: string;
}): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return { error: 'Not signed in' };
  }
  const name = payload.name.trim();
  if (!name) {
    return { error: 'name_required' };
  }
  const description = payload.description.trim() ? payload.description.trim() : null;

  const { error } = await supabase
    .from('teacher_personal_groups')
    .update({ name, description })
    .eq('id', payload.id)
    .eq('teacher_user_id', user.id);

  if (!error) {
    invalidateTeacherDashboardCaches([
      SessionCacheKeys.TEACHER_UNIFIED_GROUPS,
      SessionCacheKeys.TEACHER_DASHBOARD_OVERVIEW,
      SessionCacheKeys.TEACHER_GROUP_CHATS,
    ]);
  }

  return { error: error?.message ?? null };
}

export async function teacherDeletePersonalGroup(id: string): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return { error: 'Not signed in' };
  }

  const { error } = await supabase
    .from('teacher_personal_groups')
    .delete()
    .eq('id', id)
    .eq('teacher_user_id', user.id);

  if (!error) {
    invalidateTeacherDashboardCaches();
  }

  return { error: error?.message ?? null };
}
