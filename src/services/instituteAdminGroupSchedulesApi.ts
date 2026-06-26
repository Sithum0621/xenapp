import { supabase } from '@/src/services/supabaseClient';

export type GroupScheduleKind = 'recurring_weekly' | 'one_time';

export type GroupScheduleRow = {
  id: string;
  kind: GroupScheduleKind;
  /** 0 = Sunday .. 6 = Saturday; only for recurring_weekly */
  day_of_week: number | null;
  /** YYYY-MM-DD; only for one_time */
  class_date: string | null;
  /** HH:MM 24h */
  start_time: string;
  end_time: string;
  created_at: string;
};

export async function instituteAdminListGroupSchedules(
  lectureGroupId: string,
): Promise<{ rows: GroupScheduleRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('institute_admin_list_group_schedules', {
    p_lecture_group_id: lectureGroupId,
  });

  if (error) {
    return { rows: [], error: error.message };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    rows: rows.map((r) => ({
      id: String(r.id),
      kind: r.kind === 'one_time' ? 'one_time' : 'recurring_weekly',
      day_of_week: r.day_of_week != null ? Number(r.day_of_week) : null,
      class_date: r.class_date != null ? String(r.class_date).slice(0, 10) : null,
      start_time: String(r.start_time ?? ''),
      end_time: String(r.end_time ?? ''),
      created_at: String(r.created_at ?? ''),
    })),
    error: null,
  };
}

export async function instituteAdminCreateGroupSchedule(payload: {
  lecture_group_id: string;
  kind: GroupScheduleKind;
  schedule_year?: number;
  day_of_week?: number;
  class_date?: string;
  start_time: string;
  end_time: string;
}): Promise<{ id: string | null; error: string | null }> {
  const body: Record<string, unknown> = {
    lecture_group_id: payload.lecture_group_id,
    kind: payload.kind,
    start_time: normalizeTime(payload.start_time),
    end_time: normalizeTime(payload.end_time),
  };
  if (payload.kind === 'recurring_weekly' && payload.day_of_week != null) {
    body.day_of_week = payload.day_of_week;
    if (payload.schedule_year != null) {
      body.schedule_year = payload.schedule_year;
    }
  }
  if (payload.kind === 'one_time' && payload.class_date) {
    body.class_date = payload.class_date.trim();
  }

  const { data, error } = await supabase.rpc('institute_admin_create_group_schedule', {
    p_payload: body,
  });

  if (error) {
    return { id: null, error: error.message };
  }

  return { id: data != null ? String(data) : null, error: null };
}

export async function instituteAdminDeleteGroupSchedule(scheduleId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('institute_admin_delete_group_schedule', {
    p_payload: { id: scheduleId },
  });
  return { error: error?.message ?? null };
}

/** Accepts "8:00", "08:00", "8:00 AM" not supported — use 24h HH:MM */
function normalizeTime(s: string): string {
  const t = s.trim();
  if (!t) return t;
  const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return t;
  const hh = String(Math.min(23, Math.max(0, parseInt(m[1], 10)))).padStart(2, '0');
  const mm = String(Math.min(59, Math.max(0, parseInt(m[2], 10)))).padStart(2, '0');
  return `${hh}:${mm}:00`;
}
