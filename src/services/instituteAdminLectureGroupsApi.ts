import { supabase } from '@/src/services/supabaseClient';

export type LectureGroupRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  primary_teacher_user_id?: string | null;
  primary_teacher_full_name?: string | null;
  /** Present when listing groups for a specific teacher. */
  is_primary?: boolean;
};

export type TeacherProfileRow = {
  user_id: string;
  email: string;
  full_name: string;
};

export type LectureGroupStudentRow = {
  user_id: string;
  email: string;
  full_name: string;
};

export async function instituteAdminGetLectureGroup(
  lectureGroupId: string,
): Promise<{ row: LectureGroupRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc('institute_admin_get_lecture_group', {
    p_lecture_group_id: lectureGroupId,
  });

  if (error) {
    return { row: null, error: error.message };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const r = rows[0];
  if (!r) {
    return { row: null, error: null };
  }

  return {
    row: {
      id: String(r.id),
      name: (r.name as string) ?? '',
      description: (r.description as string | null) ?? null,
      created_at: (r.created_at as string) ?? '',
      primary_teacher_user_id: r.primary_teacher_user_id != null ? String(r.primary_teacher_user_id) : null,
      primary_teacher_full_name: (r.primary_teacher_full_name as string | null) ?? null,
    },
    error: null,
  };
}

export async function instituteAdminListLectureGroups(filters: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: LectureGroupRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('institute_admin_list_lecture_groups', {
    p_filters: {
      search: filters.search?.trim() ?? '',
      limit: filters.limit ?? 10,
      offset: filters.offset ?? 0,
    },
  });

  if (error) {
    return { rows: [], error: error.message };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    rows: rows.map((r) => ({
      id: String(r.id),
      name: (r.name as string) ?? '',
      description: (r.description as string | null) ?? null,
      created_at: (r.created_at as string) ?? '',
      primary_teacher_user_id: r.primary_teacher_user_id != null ? String(r.primary_teacher_user_id) : null,
      primary_teacher_full_name: (r.primary_teacher_full_name as string | null) ?? null,
    })),
    error: null,
  };
}

export async function instituteAdminCreateLectureGroup(payload: {
  name: string;
  description?: string;
  primary_teacher_user_id: string;
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('institute_admin_create_lecture_group', {
    p_payload: {
      name: payload.name.trim(),
      description: payload.description?.trim() ?? '',
      primary_teacher_user_id: payload.primary_teacher_user_id,
    },
  });

  if (error) {
    return { id: null, error: error.message };
  }

  return { id: data != null ? String(data) : null, error: null };
}

export async function instituteAdminGetTeacherProfile(
  teacherUserId: string,
): Promise<{ row: TeacherProfileRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc('institute_admin_get_teacher_profile', {
    p_teacher_user_id: teacherUserId,
  });

  if (error) {
    return { row: null, error: error.message };
  }

  const rows = (data ?? []) as TeacherProfileRow[];
  const r = rows[0];
  if (!r) {
    return { row: null, error: 'not_found' };
  }

  return {
    row: {
      user_id: String(r.user_id),
      email: r.email ?? '',
      full_name: r.full_name ?? '',
    },
    error: null,
  };
}

export async function instituteAdminListLectureGroupStudents(
  lectureGroupId: string,
): Promise<{ rows: LectureGroupStudentRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('institute_admin_list_lecture_group_students', {
    p_lecture_group_id: lectureGroupId,
  });

  if (error) {
    return { rows: [], error: error.message };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    rows: rows.map((r) => ({
      user_id: String(r.user_id),
      email: (r.email as string) ?? '',
      full_name: (r.full_name as string) ?? '',
    })),
    error: null,
  };
}

export async function instituteAdminListTeacherLectureGroups(
  teacherUserId: string,
): Promise<{ rows: LectureGroupRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('institute_admin_list_teacher_lecture_groups', {
    p_teacher_user_id: teacherUserId,
  });

  if (error) {
    return { rows: [], error: error.message };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    rows: rows.map((r) => ({
      id: String(r.id),
      name: (r.name as string) ?? '',
      description: (r.description as string | null) ?? null,
      created_at: (r.created_at as string) ?? '',
      is_primary: Boolean(r.is_primary),
    })),
    error: null,
  };
}

export async function instituteAdminLinkTeacherToLectureGroup(
  teacherUserId: string,
  lectureGroupId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('institute_admin_link_teacher_to_lecture_group', {
    p_payload: {
      teacher_user_id: teacherUserId,
      lecture_group_id: lectureGroupId,
    },
  });
  return { error: error?.message ?? null };
}

export async function instituteAdminUnlinkTeacherFromLectureGroup(
  teacherUserId: string,
  lectureGroupId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('institute_admin_unlink_teacher_from_lecture_group', {
    p_payload: {
      teacher_user_id: teacherUserId,
      lecture_group_id: lectureGroupId,
    },
  });
  return { error: error?.message ?? null };
}
