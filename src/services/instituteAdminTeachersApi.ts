/**
 * Institute admin teacher APIs. Server enforces:
 * - List/search scoped to the caller's institute via RPCs.
 * - Add-user search returns only user_id, email, full_name (no other-institute data).
 */
import { supabase } from '@/src/services/supabaseClient';

export type InstituteTeacherRow = {
  user_id: string;
  email: string;
  full_name: string;
};

export async function instituteAdminListTeachers(filters: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: InstituteTeacherRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('institute_admin_list_teachers', {
    p_filters: {
      search: filters.search?.trim() ?? '',
      limit: filters.limit ?? 100,
      offset: filters.offset ?? 0,
    },
  });

  if (error) {
    return { rows: [], error: error.message };
  }

  const rows = (data ?? []) as InstituteTeacherRow[];
  return {
    rows: rows.map((r) => ({
      user_id: String(r.user_id),
      email: r.email ?? '',
      full_name: r.full_name ?? '',
    })),
    error: null,
  };
}

export async function instituteAdminSearchTeachersToAssign(query: {
  search: string;
  limit?: number;
}): Promise<{ rows: InstituteTeacherRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('institute_admin_search_teachers_to_assign', {
    p_query: {
      search: query.search.trim(),
      limit: query.limit ?? 25,
    },
  });

  if (error) {
    return { rows: [], error: error.message };
  }

  const rows = (data ?? []) as InstituteTeacherRow[];
  return {
    rows: rows.map((r) => ({
      user_id: String(r.user_id),
      email: r.email ?? '',
      full_name: r.full_name ?? '',
    })),
    error: null,
  };
}

export async function instituteAdminAssignTeacher(teacherUserId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('institute_admin_assign_teacher', {
    p_payload: { teacher_user_id: teacherUserId },
  });

  return { error: error?.message ?? null };
}
