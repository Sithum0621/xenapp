import { supabase } from '@/src/services/supabaseClient';

export type StudentLeaderboardSnapshot = {
  inTop100: boolean;
  rank: number | null;
  aheadPercent: number | null;
  bestSubject: string;
  totalScore: number;
  participantCount: number;
};

function asInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === 'string' && value.trim()) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function fetchStudentLeaderboardSnapshot(
  studentUserId: string,
): Promise<
  { ok: true; snapshot: StudentLeaderboardSnapshot } | { ok: false; error: string }
> {
  const studentId = studentUserId.trim();
  if (!studentId) return { ok: false, error: 'Student is required.' };

  try {
    const { data, error } = await supabase.rpc('student_leaderboard_snapshot', {
      p_student_user_id: studentId,
    });
    if (error) return { ok: false, error: error.message };
    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'Invalid leaderboard response.' };
    }

    const r = data as Record<string, unknown>;
    const inTop100 = r.in_top_100 === true || r.in_top_100 === 'true';

    return {
      ok: true,
      snapshot: {
        inTop100,
        rank: inTop100 ? asInt(r.rank) : null,
        aheadPercent:
          !inTop100 && r.ahead_percent != null ? asInt(r.ahead_percent) : null,
        bestSubject:
          typeof r.best_subject === 'string' && r.best_subject.trim()
            ? r.best_subject.trim()
            : 'General',
        totalScore: asInt(r.total_score),
        participantCount: asInt(r.participant_count),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
