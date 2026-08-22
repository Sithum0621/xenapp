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

export type TeacherStudentEnrollLookupByMobilePayload = {
  mode: 'lookup_by_mobile';
  mobile_number: string;
  group_source?: TeacherStudentEnrollGroupSource;
  group_id?: string;
};

export type TeacherStudentMobileCandidate = {
  studentUserId: string;
  fullName: string;
  inYourClasses: boolean;
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
    | TeacherStudentEnrollLookupByMobilePayload
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
): Promise<{ ok: boolean; error?: string; detail?: string }> {
  const { ok, json } = await invokeTeacherStudentEnroll({ mode: 'register', ...payload });
  return {
    ok,
    error: typeof json.error === 'string' ? json.error : undefined,
    detail: typeof json.detail === 'string' ? json.detail : undefined,
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

function parseCandidates(raw: unknown): TeacherStudentMobileCandidate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
      const r = row as Record<string, unknown>;
      const studentUserId =
        typeof r.student_user_id === 'string' ? r.student_user_id.trim() : '';
      if (!studentUserId) return null;
      return {
        studentUserId,
        fullName:
          typeof r.full_name === 'string' && r.full_name.trim()
            ? r.full_name.trim()
            : 'Student',
        inYourClasses: r.in_your_classes === true,
      };
    })
    .filter((x): x is TeacherStudentMobileCandidate => Boolean(x));
}

export async function teacherStudentEnrollLookupByMobile(
  payload: Omit<TeacherStudentEnrollLookupByMobilePayload, 'mode'>,
): Promise<{
  ok: boolean;
  error?: string;
  candidates: TeacherStudentMobileCandidate[];
  mobileNumber?: string;
}> {
  const { ok, json } = await invokeTeacherStudentEnroll({ mode: 'lookup_by_mobile', ...payload });
  return {
    ok,
    error: typeof json.error === 'string' ? json.error : undefined,
    candidates: parseCandidates(json.candidates),
    mobileNumber: typeof json.mobile_number === 'string' ? json.mobile_number : undefined,
  };
}

export async function teacherStudentEnrollLinkByMobile(
  payload: Omit<TeacherStudentEnrollLinkByMobilePayload, 'mode'>,
): Promise<{
  ok: boolean;
  error?: string;
  detail?: string;
  studentUserId?: string;
  studentFullName?: string;
  candidates?: TeacherStudentMobileCandidate[];
}> {
  const { ok, json } = await invokeTeacherStudentEnroll({ mode: 'link_by_mobile', ...payload });
  if (ok) {
    invalidateSessionCache(SessionCacheKeys.TEACHER_DASHBOARD_OVERVIEW);
  }
  return {
    ok,
    error: typeof json.error === 'string' ? json.error : undefined,
    detail: typeof json.detail === 'string' ? json.detail : undefined,
    studentUserId: typeof json.student_user_id === 'string' ? json.student_user_id : undefined,
    studentFullName:
      typeof json.student_full_name === 'string' ? json.student_full_name : undefined,
    candidates: parseCandidates(json.candidates),
  };
}

export async function teacherStudentEnrollAddByNameMobile(
  payload: Omit<TeacherStudentEnrollAddByNameMobilePayload, 'mode'>,
): Promise<{
  ok: boolean;
  error?: string;
  detail?: string;
  created?: boolean;
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
    password: typeof json.password === 'string' ? json.password : undefined,
  };
}
