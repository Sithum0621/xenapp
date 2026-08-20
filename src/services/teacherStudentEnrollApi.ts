import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/functions-js';

import { supabase } from '@/src/services/supabaseClient';
import { invalidateSessionCache, SessionCacheKeys } from '@/src/services/sessionDataCache';

export type TeacherStudentEnrollGroupSource = 'personal' | 'institute';

export type TeacherStudentEnrollRegisterPayload = {
  mode: 'register';
  group_source: TeacherStudentEnrollGroupSource;
  group_id: string;
  first_name: string;
  last_name: string;
  username: string;
  address: string;
  password: string;
};

export type TeacherStudentEnrollLinkPayload = {
  mode: 'link';
  group_source: TeacherStudentEnrollGroupSource;
  group_id: string;
  student_user_id: string;
};

export type TeacherStudentEnrollLinkByMobilePayload = {
  mode: 'link_by_mobile';
  mobile_number: string;
  card_token: string;
  student_user_id?: string;
  group_source?: TeacherStudentEnrollGroupSource;
  group_id?: string;
};

export type TeacherStudentEnrollAddByNameMobilePayload = {
  mode: 'add_by_name_mobile';
  group_source: TeacherStudentEnrollGroupSource;
  group_id: string;
  full_name: string;
  mobile_number: string;
};

async function invokeTeacherStudentEnroll(
  body:
    | TeacherStudentEnrollRegisterPayload
    | TeacherStudentEnrollLinkPayload
    | TeacherStudentEnrollLinkByMobilePayload
    | TeacherStudentEnrollAddByNameMobilePayload,
): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  try {
    const { data, error } = await supabase.functions.invoke('teacher-student-enroll', { body });

    if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
      const payload = data as Record<string, unknown>;
      if (payload.ok === true || typeof payload.error === 'string') {
        return { ok: payload.ok === true, json: payload };
      }
    }

    if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
      const ctx = error.context;
      const detail = ctx instanceof Error ? ctx.message : error.message;
      return { ok: false, json: { error: 'network_error', detail } };
    }

    if (error instanceof FunctionsHttpError) {
      const resp = error.context;
      let payload: Record<string, unknown> = { error: 'edge_http_error', detail: resp.statusText };
      try {
        const ct = resp.headers.get('Content-Type') ?? '';
        if (ct.includes('application/json')) {
          const parsed = (await resp.json()) as Record<string, unknown>;
          if (parsed && typeof parsed === 'object') payload = parsed;
        }
      } catch {
        /* ignore */
      }
      return { ok: false, json: payload };
    }

    return {
      ok: false,
      json: {
        error: 'invoke_failed',
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, json: { error: 'network_error', detail } };
  }
}

export async function teacherStudentEnrollRegister(
  payload: Omit<TeacherStudentEnrollRegisterPayload, 'mode'>,
): Promise<{ ok: boolean; error?: string; detail?: string; xenStudentId?: string }> {
  const { ok, json } = await invokeTeacherStudentEnroll({ mode: 'register', ...payload });
  const xenStudentId =
    typeof json.xen_student_id === 'string' && json.xen_student_id.trim()
      ? json.xen_student_id.trim()
      : undefined;
  return {
    ok,
    error: typeof json.error === 'string' ? json.error : undefined,
    detail: typeof json.detail === 'string' ? json.detail : undefined,
    xenStudentId: ok ? xenStudentId : undefined,
  };
}

export async function teacherStudentEnrollLink(
  payload: Omit<TeacherStudentEnrollLinkPayload, 'mode'>,
): Promise<{ ok: boolean; error?: string; detail?: string }> {
  const { ok, json } = await invokeTeacherStudentEnroll({ mode: 'link', ...payload });
  if (ok) {
    invalidateSessionCache(SessionCacheKeys.TEACHER_DASHBOARD_OVERVIEW);
  }
  return {
    ok,
    error: typeof json.error === 'string' ? json.error : undefined,
    detail: typeof json.detail === 'string' ? json.detail : undefined,
  };
}

export async function teacherStudentEnrollLinkByMobile(
  payload: Omit<TeacherStudentEnrollLinkByMobilePayload, 'mode'>,
): Promise<{ ok: boolean; error?: string; detail?: string; studentUserId?: string }> {
  const { ok, json } = await invokeTeacherStudentEnroll({ mode: 'link_by_mobile', ...payload });
  if (ok) {
    invalidateSessionCache(SessionCacheKeys.TEACHER_DASHBOARD_OVERVIEW);
  }
  return {
    ok,
    error: typeof json.error === 'string' ? json.error : undefined,
    detail: typeof json.detail === 'string' ? json.detail : undefined,
    studentUserId: typeof json.student_user_id === 'string' ? json.student_user_id : undefined,
  };
}

export async function teacherStudentEnrollAddByNameMobile(
  payload: Omit<TeacherStudentEnrollAddByNameMobilePayload, 'mode'>,
): Promise<{
  ok: boolean;
  error?: string;
  detail?: string;
  created?: boolean;
  xenStudentId?: string;
  password?: string;
}> {
  const { ok, json } = await invokeTeacherStudentEnroll({ mode: 'add_by_name_mobile', ...payload });
  if (ok) {
    invalidateSessionCache(SessionCacheKeys.TEACHER_DASHBOARD_OVERVIEW);
  }
  return {
    ok,
    error: typeof json.error === 'string' ? json.error : undefined,
    detail: typeof json.detail === 'string' ? json.detail : undefined,
    created: json.created === true,
    xenStudentId:
      typeof json.xen_student_id === 'string' && json.xen_student_id.trim()
        ? json.xen_student_id.trim()
        : undefined,
    password: typeof json.password === 'string' ? json.password : undefined,
  };
}
