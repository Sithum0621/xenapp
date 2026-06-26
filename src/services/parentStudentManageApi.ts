import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/functions-js';

import { supabase } from '@/src/services/supabaseClient';

export type UpdateStudentNameResult =
  | { ok: true }
  | { ok: false; error: string };

export type RemoveStudentResult =
  | { ok: true }
  | { ok: false; error: string; detail?: string };

function mapUpdateNameError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('name_required')) return 'name_required';
  if (m.includes('not_linked')) return 'not_linked';
  if (m.includes('not_authenticated')) return 'not_authenticated';
  return 'unknown_error';
}

export async function updateParentStudentName(
  studentUserId: string,
  fullName: string,
): Promise<UpdateStudentNameResult> {
  const trimmed = fullName.trim();
  if (!trimmed) return { ok: false, error: 'name_required' };

  try {
    const { error } = await supabase.rpc('parent_update_student_name', {
      p_student_user_id: studentUserId,
      p_full_name: trimmed,
    });
    if (error) return { ok: false, error: mapUpdateNameError(error.message) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function removeParentStudent(studentUserId: string): Promise<RemoveStudentResult> {
  try {
    const { data, error } = await supabase.functions.invoke('parent-remove-student', {
      body: { student_user_id: studentUserId },
    });

    if (!error && data && typeof data === 'object' && !Array.isArray(data)) {
      const payload = data as Record<string, unknown>;
      if (payload.ok === true) return { ok: true };
      return {
        ok: false,
        error: typeof payload.error === 'string' ? payload.error : 'unknown_error',
        detail: typeof payload.detail === 'string' ? payload.detail : undefined,
      };
    }

    if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
      return { ok: false, error: 'network_error', detail: error.message };
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
      return {
        ok: false,
        error: typeof payload.error === 'string' ? payload.error : 'edge_http_error',
        detail: typeof payload.detail === 'string' ? payload.detail : undefined,
      };
    }

    return {
      ok: false,
      error: 'invoke_failed',
      detail: error instanceof Error ? error.message : String(error),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
