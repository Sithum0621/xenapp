import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/functions-js';

import { supabase } from '@/src/services/supabaseClient';

type StartResponse = {
  challenge_id?: string;
  skip_otp?: boolean;
  access_token?: string;
  refresh_token?: string;
  error?: string;
  detail?: string;
};
type VerifyResponse = {
  access_token?: string;
  refresh_token?: string;
  error?: string;
  detail?: string;
};

async function invokeMfa(body: Record<string, unknown>): Promise<{
  ok: boolean;
  status: number;
  json: Record<string, unknown>;
}> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url.trim() || !key.trim()) {
    return { ok: false, status: 0, json: { error: 'missing_supabase_env' } };
  }

  const { data, error } = await supabase.functions.invoke('superadmin-mfa', { body });

  if (!error && data !== null && typeof data === 'object' && !Array.isArray(data)) {
    const payload = data as Record<string, unknown>;
    const errStr = typeof payload.error === 'string' ? payload.error : undefined;
    return {
      ok: errStr === undefined,
      status: errStr ? 400 : 200,
      json: payload,
    };
  }

  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    const ctx = error.context;
    const detail = ctx instanceof Error ? ctx.message : error.message;
    return {
      ok: false,
      status: 0,
      json: { error: 'network_error', detail },
    };
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
      status: resp.status,
      json: payload,
    };
  }

  return {
    ok: false,
    status: 0,
    json: {
      error: 'invoke_failed',
      detail: error instanceof Error ? error.message : String(error),
    },
  };
}

export async function superadminMfaStart(email: string, password: string): Promise<
  StartResponse & { ok: boolean; status: number }
> {
  const { ok, status, json } = await invokeMfa({ action: 'start', email, password });
  return {
    ok,
    status,
    challenge_id: typeof json.challenge_id === 'string' ? json.challenge_id : undefined,
    skip_otp: json.skip_otp === true,
    access_token: typeof json.access_token === 'string' ? json.access_token : undefined,
    refresh_token: typeof json.refresh_token === 'string' ? json.refresh_token : undefined,
    error: typeof json.error === 'string' ? json.error : undefined,
    detail: typeof json.detail === 'string' ? json.detail : undefined,
  };
}

export async function superadminMfaVerify(
  challengeId: string,
  code: string,
): Promise<VerifyResponse & { ok: boolean; status: number }> {
  const { ok, status, json } = await invokeMfa({ action: 'verify', challenge_id: challengeId, code });
  return {
    ok,
    status,
    access_token: typeof json.access_token === 'string' ? json.access_token : undefined,
    refresh_token: typeof json.refresh_token === 'string' ? json.refresh_token : undefined,
    error: typeof json.error === 'string' ? json.error : undefined,
    detail: typeof json.detail === 'string' ? json.detail : undefined,
  };
}
