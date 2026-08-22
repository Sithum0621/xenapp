import { supabase } from '@/src/services/supabaseClient';
import {
  fetchPersonalRoster,
} from '@/src/services/teacherGroupWorkspaceApi';
import {
  teacherStudentEnrollLookupByMobile,
} from '@/src/services/teacherStudentEnrollApi';
import {
  buildClassCardGroupQrPayload,
  buildClassCardQrPayload,
} from '@/src/utils/xenQrPayload';

export type ClassCardStudentRow = {
  studentUserId: string;
  fullName: string;
  mobileNumber: string;
};

export function classCardQrPayloadForStudent(
  source: 'institute' | 'personal',
  groupId: string,
  studentUserId: string,
): string {
  if (source === 'institute') {
    return buildClassCardGroupQrPayload(studentUserId, groupId);
  }
  return buildClassCardQrPayload(studentUserId);
}

async function isStudentInGroup(
  source: 'institute' | 'personal',
  groupId: string,
  studentUserId: string,
): Promise<boolean> {
  if (source === 'personal') {
    const { data } = await supabase
      .from('teacher_personal_roster_entries')
      .select('id')
      .eq('teacher_personal_group_id', groupId)
      .eq('student_user_id', studentUserId)
      .maybeSingle();
    return !!data;
  }
  const { data } = await supabase
    .from('lecture_group_students')
    .select('student_user_id')
    .eq('lecture_group_id', groupId)
    .eq('student_user_id', studentUserId)
    .maybeSingle();
  return !!data;
}

/** Find the student on this mobile who belongs to the selected class only. */
export async function lookupClassCardStudentByMobile(
  source: 'institute' | 'personal',
  groupId: string,
  mobileE164: string,
): Promise<{ row: ClassCardStudentRow | null; error?: string }> {
  const result = await teacherStudentEnrollLookupByMobile({
    mobile_number: mobileE164,
    group_source: source,
    group_id: groupId,
  });

  if (!result.ok || result.candidates.length === 0) {
    return { row: null, error: result.error ?? 'student_not_found' };
  }

  for (const candidate of result.candidates) {
    if (await isStudentInGroup(source, groupId, candidate.studentUserId)) {
      return {
        row: {
          studentUserId: candidate.studentUserId,
          fullName: candidate.fullName,
          mobileNumber: result.mobileNumber ?? mobileE164,
        },
      };
    }
  }

  return { row: null, error: 'student_not_in_group' };
}

async function loadStudentNamesAndMobiles(
  studentUserIds: string[],
): Promise<{
  nameById: Map<string, string>;
  mobileById: Map<string, string>;
  error: string | null;
}> {
  if (studentUserIds.length === 0) {
    return { nameById: new Map(), mobileById: new Map(), error: null };
  }

  const [profilesRes, contactRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name').in('id', studentUserIds),
    supabase.from('profiles_contact').select('id, mobile_number').in('id', studentUserIds),
  ]);

  if (profilesRes.error) {
    return { nameById: new Map(), mobileById: new Map(), error: profilesRes.error.message };
  }
  if (contactRes.error) {
    return { nameById: new Map(), mobileById: new Map(), error: contactRes.error.message };
  }

  const nameById = new Map(
    (profilesRes.data ?? []).map((p: { id: string; full_name: string | null }) => [
      p.id,
      p.full_name?.trim() ?? '',
    ]),
  );
  const mobileById = new Map(
    (contactRes.data ?? []).map((c: { id: string; mobile_number: string | null }) => [
      c.id,
      c.mobile_number?.trim() ?? '',
    ]),
  );

  return { nameById, mobileById, error: null };
}

export async function fetchClassCardStudentsForGroup(
  source: 'institute' | 'personal',
  groupId: string,
): Promise<{ rows: ClassCardStudentRow[]; error: string | null }> {
  if (source === 'institute') {
    const { data, error } = await supabase
      .from('lecture_group_students')
      .select('student_user_id')
      .eq('lecture_group_id', groupId);

    if (error) return { rows: [], error: error.message };

    const ids = (data ?? [])
      .map((r: { student_user_id: string }) => r.student_user_id)
      .filter(Boolean);

    const { nameById, mobileById, error: loadError } = await loadStudentNamesAndMobiles(ids);
    if (loadError) return { rows: [], error: loadError };

    const rows: ClassCardStudentRow[] = ids
      .map((studentUserId) => {
        const fullName = nameById.get(studentUserId) || studentUserId.slice(0, 8) + '…';
        return {
          studentUserId,
          fullName,
          mobileNumber: mobileById.get(studentUserId) ?? '',
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    return { rows, error: null };
  }

  const { rows: roster, error: rosterError } = await fetchPersonalRoster(groupId);
  if (rosterError) return { rows: [], error: rosterError };

  const linked = roster.filter((r) => r.student_user_id);
  if (linked.length === 0) return { rows: [], error: null };

  const ids = linked.map((r) => r.student_user_id as string);
  const { nameById, mobileById, error: loadError } = await loadStudentNamesAndMobiles(ids);
  if (loadError) return { rows: [], error: loadError };

  const rows: ClassCardStudentRow[] = linked
    .map((entry) => {
      const studentUserId = entry.student_user_id as string;
      const fullName =
        nameById.get(studentUserId) ||
        entry.display_name.trim() ||
        studentUserId.slice(0, 8) + '…';
      return {
        studentUserId,
        fullName,
        mobileNumber: mobileById.get(studentUserId) ?? '',
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return { rows, error: null };
}
