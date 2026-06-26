import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/functions-js';

import { supabase } from '@/src/services/supabaseClient';

/** Errors where Postgres RPC cannot fix the outcome — skip fallback. */
const EDGE_ONLY_ERRORS = new Set([
  'cannot_delete_self',
  'cannot_delete_superadmin',
  'not_superadmin',
  'unauthorized',
  'invalid_target',
  'delete_failed',
]);

async function invokeEdgeDelete(targetUserId: string): Promise<{
  ok: boolean;
  error?: string;
  detail?: string;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {};
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const { data, error } = await supabase.functions.invoke('superadmin-delete-user', {
    body: { target_user_id: targetUserId },
    headers,
  });

  if (!error && data !== null && typeof data === 'object' && !Array.isArray(data)) {
    const payload = data as Record<string, unknown>;
    if (payload.ok === true) return { ok: true };
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : 'invoke_failed',
      detail: typeof payload.detail === 'string' ? payload.detail : undefined,
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

/**
 * Deletes a user: Edge Function (Auth Admin API) first; falls back to RPC if the function
 * is missing or unreachable (e.g. not deployed yet).
 */
export async function deleteSuperadminUser(targetUserId: string): Promise<{
  ok: boolean;
  error?: string;
  detail?: string;
}> {
  const edge = await invokeEdgeDelete(targetUserId);
  if (edge.ok) return edge;

  if (edge.error && EDGE_ONLY_ERRORS.has(edge.error)) {
    return edge;
  }

  const { error } = await supabase.rpc('superadmin_delete_user', {
    p_target_user_id: targetUserId,
  });

  if (!error) {
    return { ok: true };
  }

  const msg = error.message ?? '';
  const lower = msg.toLowerCase();
  if (lower.includes('cannot_delete_self')) return { ok: false, error: 'cannot_delete_self' };
  if (lower.includes('cannot_delete_superadmin')) {
    return { ok: false, error: 'cannot_delete_superadmin' };
  }

  return { ok: false, error: 'rpc_failed', detail: msg };
}

/** @deprecated Prefer deleteSuperadminUser (includes fallback). */
export async function invokeSuperadminDeleteUser(targetUserId: string) {
  return invokeEdgeDelete(targetUserId);
}
