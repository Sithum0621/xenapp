import { supabase } from '@/src/services/supabaseClient';
import { sanitizeScanInput } from '@/src/utils/xenQrPayload';

export type ScanAttendanceOption = {
  group_id: string;
  group_source: string;
  group_name: string;
  schedule_id: string;
  start_time: string;
  end_time: string;
  kind: string;
};

export type MarkAttendanceByScanResult = {
  ok: boolean;
  session_id: string;
  student_user_id: string;
  student_name: string;
  group_id: string;
  group_source: string;
  group_name: string;
  schedule_id: string;
  class_label: string;
  session_date: string;
  marked_at: string;
  already_present: boolean;
  notifications_sent: number;
};

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function localTimeHm(): string {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function mapScanError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('student_not_found')) return 'student_not_found';
  if (lower.includes('no_class_today')) return 'no_class_today';
  if (lower.includes('student_not_in_group')) return 'student_not_in_group';
  if (lower.includes('not_authorized')) return 'not_authorized';
  if (lower.includes('student_not_in_your_classes')) return 'student_not_in_your_classes';
  return 'unknown';
}

export async function listScanAttendanceOptions(
  studentUserId: string,
  sessionDate = todayIso(),
): Promise<{ options: ScanAttendanceOption[]; error: string | null }> {
  const { data, error } = await supabase.rpc('teacher_list_scan_attendance_options', {
    p_student_user_id: studentUserId,
    p_session_date: sessionDate,
  });

  if (error) return { options: [], error: error.message };

  const options: ScanAttendanceOption[] = (data ?? []).map((r: Record<string, unknown>) => ({
    group_id: String(r.group_id),
    group_source: String(r.group_source),
    group_name: String(r.group_name),
    schedule_id: String(r.schedule_id),
    start_time: String(r.start_time),
    end_time: String(r.end_time),
    kind: String(r.kind),
  }));

  return { options, error: null };
}

export type ResolveAttendanceStudentError =
  | 'invalid_student_id'
  | 'student_not_found'
  | 'card_unclaimed';

function mapResolveError(message: string): ResolveAttendanceStudentError {
  const lower = message.toLowerCase();
  if (lower.includes('card_unclaimed')) return 'card_unclaimed';
  if (lower.includes('student_not_found')) return 'student_not_found';
  return 'invalid_student_id';
}

/** Resolve a class-card token, mobile number, QR UUID, or legacy XEN ID to profiles.id. */
export async function resolveStudentUserIdForAttendance(
  raw: string,
): Promise<{ studentUserId: string | null; errorCode: ResolveAttendanceStudentError | null }> {
  const cleaned = sanitizeScanInput(raw);
  if (!cleaned) return { studentUserId: null, errorCode: 'invalid_student_id' };

  const { data, error } = await supabase.rpc('resolve_student_user_id_for_attendance', {
    p_identifier: cleaned,
  });

  if (error || !data) {
    return { studentUserId: null, errorCode: mapResolveError(error?.message ?? '') };
  }
  return { studentUserId: String(data), errorCode: null };
}

export async function markAttendanceByScan(
  studentUserId: string,
  opts?: {
    sessionDate?: string;
    groupId?: string;
    groupSource?: string;
    scheduleId?: string;
  },
): Promise<{ result: MarkAttendanceByScanResult | null; errorCode: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('teacher_mark_attendance_by_scan', {
    p_student_user_id: studentUserId,
    p_session_date: opts?.sessionDate ?? todayIso(),
    p_local_time: localTimeHm(),
    p_group_id: opts?.groupId ?? null,
    p_group_source: opts?.groupSource ?? null,
    p_schedule_id: opts?.scheduleId ?? null,
  });

  if (error) {
    return { result: null, errorCode: mapScanError(error.message), error: error.message };
  }

  const row = data as Record<string, unknown> | null;
  if (!row || row.ok !== true) {
    return { result: null, errorCode: 'unknown', error: 'Unexpected response from server.' };
  }

  return {
    result: {
      ok: true,
      session_id: String(row.session_id),
      student_user_id: String(row.student_user_id),
      student_name: String(row.student_name ?? ''),
      group_id: String(row.group_id),
      group_source: String(row.group_source),
      group_name: String(row.group_name ?? ''),
      schedule_id: String(row.schedule_id),
      class_label: String(row.class_label ?? ''),
      session_date: String(row.session_date),
      marked_at: String(row.marked_at ?? ''),
      already_present: Boolean(row.already_present),
      notifications_sent: Number(row.notifications_sent ?? 0),
    },
    errorCode: null,
    error: null,
  };
}
