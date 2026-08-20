/**
 * Deletes an auth user via Admin API (works on hosted Supabase; raw SQL DELETE on auth.users often fails).
 * Caller must be an authenticated platform superadmin (profiles.role = superadmin).
 *
 * Deploy: supabase functions deploy superadmin-delete-user
 * (JWT verification on by default — client invoke sends the logged-in user's access token.)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';

function json(req: Request, body: Record<string, unknown>, status = 200) {
  return jsonResponse(req, body, status);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return optionsResponse(req);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl?.trim() || !anonKey?.trim() || !serviceRole?.trim()) {
    return json(req, { error: 'server_misconfigured' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json(req, { error: 'unauthorized' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();

  if (userErr || !user?.id) {
    return json(req, { error: 'unauthorized' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();

  if (callerProfile?.role !== 'superadmin') {
    return json(req, { error: 'not_superadmin' }, 403);
  }

  let body: { target_user_id?: string };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'invalid_json' }, 400);
  }

  const rawId = typeof body.target_user_id === 'string' ? body.target_user_id.trim() : '';
  if (!rawId || !UUID_RE.test(rawId)) {
    return json(req, { error: 'invalid_target' }, 400);
  }

  if (rawId === user.id) {
    return json(req, { error: 'cannot_delete_self' }, 400);
  }

  const { data: targetProfile } = await admin.from('profiles').select('role').eq('id', rawId).maybeSingle();

  if (targetProfile?.role === 'superadmin') {
    return json(req, { error: 'cannot_delete_superadmin' }, 400);
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(rawId);

  if (delErr) {
    return json(req, { error: 'delete_failed', detail: delErr.message ?? 'unknown' }, 400);
  }

  return json(req, { ok: true });
});
