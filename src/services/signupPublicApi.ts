import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/functions-js';

import { supabase } from '@/src/services/supabaseClient';

export type SignupPublicPayload = {
  email?: string;
  mobile_number?: string;
  mobile_otp_token?: string;
  password: string;
  full_name: string;
  role: string;
  nic_number: string;
};

async function invokeSignup(body: SignupPublicPayload): Promise<{
  ok: boolean;
  json: Record<string, unknown>;
}> {
  const { data, error } = await supabase.functions.invoke('signup-public', { body });

  if (!error && data !== null && typeof data === 'object' && !Array.isArray(data)) {
    const payload = data as Record<string, unknown>;
    const success = payload.ok === true && typeof payload.error !== 'string';
    return { ok: success, json: payload };
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
}

export async function signupPublic(
  payload: SignupPublicPayload,
): Promise<{ ok: boolean; error?: string; detail?: string; authEmail?: string }> {
  const { ok, json } = await invokeSignup(payload);
  return {
    ok,
    error: typeof json.error === 'string' ? json.error : undefined,
    detail: typeof json.detail === 'string' ? json.detail : undefined,
    authEmail: typeof json.auth_email === 'string' ? json.auth_email : undefined,
  };
}
