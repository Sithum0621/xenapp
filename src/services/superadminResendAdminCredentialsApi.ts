import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/functions-js';

import { supabase } from '@/src/services/supabaseClient';

export type SuperadminResendAdminCredentialsPayload = {
  institute_id: string;
  user_id: string;
};

async function invokeResend(payload: SuperadminResendAdminCredentialsPayload): Promise<{
  ok: boolean;
  error?: string;
  detail?: string;
  email_sent?: boolean;
  email_skip_reason?: string | null;
  manual_password?: string | null;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {};
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const { data, error } = await supabase.functions.invoke('superadmin-resend-admin-credentials', {
    body: payload,
    headers,
  });

  if (!error && data !== null && typeof data === 'object' && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    if (record.ok === true) {
      return {
        ok: true,
        email_sent: record.email_sent === true,
        email_skip_reason:
          typeof record.email_skip_reason === 'string' ? record.email_skip_reason : null,
        manual_password:
          typeof record.manual_password === 'string' ? record.manual_password : null,
      };
    }
    return {
      ok: false,
      error: typeof record.error === 'string' ? record.error : 'invoke_failed',
      detail: typeof record.detail === 'string' ? record.detail : undefined,
    };
  }

  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    const ctx = error.context;
    const detail = ctx instanceof Error ? ctx.message : error.message;
    return { ok: false, error: 'network_error', detail };
  }

  if (error instanceof FunctionsHttpError) {
    const resp = error.context;
    try {
      const parsed = (await resp.json()) as Record<string, unknown>;
      return {
        ok: false,
        error: typeof parsed.error === 'string' ? parsed.error : 'edge_http_error',
        detail:
          typeof parsed.detail === 'string'
            ? parsed.detail
            : `${resp.status} ${resp.statusText}`.trim(),
      };
    } catch {
      return {
        ok: false,
        error: 'edge_http_error',
        detail: `${resp.status} ${resp.statusText}`.trim(),
      };
    }
  }

  return {
    ok: false,
    error: 'invoke_failed',
    detail: error instanceof Error ? error.message : String(error),
  };
}

export async function superadminResendAdminCredentials(
  payload: SuperadminResendAdminCredentialsPayload,
) {
  return invokeResend(payload);
}
