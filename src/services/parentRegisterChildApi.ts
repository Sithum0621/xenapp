import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/functions-js';

import { supabase } from '@/src/services/supabaseClient';

export type RegisterHouseholdChildPayload = {
  first_name: string;
  last_name: string;
};

export type RegisterHouseholdChildResult =
  | { ok: true; studentUserId: string; xenStudentId: string }
  | { ok: false; error: string; detail?: string };

async function invokeRegisterChild(
  body: RegisterHouseholdChildPayload,
): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const { data, error } = await supabase.functions.invoke('parent-register-child', { body });

  if (!error && data !== null && typeof data === 'object' && !Array.isArray(data)) {
    const payload = data as Record<string, unknown>;
    const success = payload.ok === true;
    return { ok: success, json: payload };
  }

  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    return { ok: false, json: { error: 'network_error', detail: error.message } };
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
}

export async function registerParentHouseholdChild(
  payload: RegisterHouseholdChildPayload,
): Promise<RegisterHouseholdChildResult> {
  const { ok, json } = await invokeRegisterChild(payload);
  if (ok) {
    const studentUserId =
      typeof json.student_user_id === 'string' ? json.student_user_id.trim() : '';
    const xenStudentId =
      typeof json.xen_student_id === 'string' ? json.xen_student_id.trim() : '';
    if (!studentUserId || !xenStudentId) {
      return { ok: false, error: 'invalid_response' };
    }
    return { ok: true, studentUserId, xenStudentId };
  }

  return {
    ok: false,
    error: typeof json.error === 'string' ? json.error : 'unknown_error',
    detail: typeof json.detail === 'string' ? json.detail : undefined,
  };
}
