import { supabase } from '@/src/services/supabaseClient';

export type LastSessionAttendance = {
  sessionId: string;
  sessionDate: string;
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  absentStudents: { name: string }[];
};

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function fetchTeacherLastSessionAttendance(
  groupId: string,
  scheduleId: string,
  groupSource: 'institute' | 'personal',
  beforeDate = todayIso(),
): Promise<{ data: LastSessionAttendance | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('teacher_get_last_session_attendance', {
      p_group_id: groupId,
      p_schedule_id: scheduleId,
      p_group_source: groupSource,
      p_before_date: beforeDate,
    });

    if (error) return { data: null, error: error.message };
    if (!data || typeof data !== 'object') return { data: null, error: null };

    const row = data as Record<string, unknown>;
    const absentRaw = Array.isArray(row.absent_students) ? row.absent_students : [];

    return {
      data: {
        sessionId: String(row.session_id ?? ''),
        sessionDate: String(row.session_date ?? ''),
        totalStudents: Number(row.total_students ?? 0),
        presentCount: Number(row.present_count ?? 0),
        absentCount: Number(row.absent_count ?? 0),
        absentStudents: absentRaw
          .map((item) => {
            const name =
              typeof item === 'object' && item !== null && 'name' in item
                ? String((item as { name: unknown }).name ?? '')
                : '';
            return name.trim() ? { name: name.trim() } : null;
          })
          .filter((item): item is { name: string } => item !== null),
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}
