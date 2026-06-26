import type { PostgrestError } from '@supabase/supabase-js';

/** PostgREST / Postgres surfaced as HTTP 500 or explicit internal errors while reading `profiles`. */
export function isProfileFetchServerError(error: PostgrestError | null | undefined): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  const code = error.code ?? '';
  if (msg.includes('internal server error')) return true;
  if (/\b500\b/.test(msg)) return true;
  if (code === '57014') return true;
  if (code === 'XX000') return true;
  return false;
}

/** Likely offline, DNS, or blocked request — not an application-level “no profile row”. */
export function isProfileFetchNetworkError(error: PostgrestError | null | undefined): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  if (msg.includes('network request failed')) return true;
  if (msg.includes('failed to fetch')) return true;
  if (msg.includes('networkerror')) return true;
  return false;
}
