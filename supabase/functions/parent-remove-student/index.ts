/**
 * Parent removes a linked student from their dashboard.
 * Household children (registered via parent-register-child) are fully deleted.
 *
 * Deploy: supabase functions deploy parent-remove-student --no-verify-jwt
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const DEFAULT_ALLOWED_ORIGINS = new Set([
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://localhost:19006',
  'http://127.0.0.1:19006',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

function allowedOrigins(): Set<string> {
  const extra =
    Deno.env.get('TEACHER_ENROLL_ALLOWED_ORIGINS')?.split(',').map((s) => s.trim()).filter(Boolean) ??
    [];
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}

function corsHeadersFor(req: Request): Headers {
  const origin = req.headers.get('Origin');
  const allow = allowedOrigins();
  const allowOrigin = origin && allow.has(origin) ? origin : '*';
  const h = new Headers();
  h.set('Access-Control-Allow-Origin', allowOrigin);
  h.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  h.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  h.set('Access-Control-Max-Age', '86400');
  if (allowOrigin !== '*') {
    h.set('Vary', 'Origin');
  }
  return h;
}

function json(body: Record<string, unknown>, req: Request, status = 200) {
  const headers = corsHeadersFor(req);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeadersFor(req) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl?.trim() || !anonKey?.trim() || !serviceRole?.trim()) {
      return json({ error: 'server_misconfigured' }, req, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'unauthorized' }, req, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user: parentUser },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !parentUser?.id) {
      return json({ error: 'unauthorized' }, req, 401);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'invalid_json' }, req, 400);
    }

    const studentUserId =
      typeof body.student_user_id === 'string' ? body.student_user_id.trim() : '';
    if (!studentUserId) {
      return json({ error: 'validation_failed', detail: 'student_user_id' }, req, 400);
    }

    if (studentUserId === parentUser.id) {
      return json({ error: 'cannot_remove_self' }, req, 400);
    }

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: linkRow, error: linkErr } = await admin
      .from('parent_student_links')
      .select('student_user_id')
      .eq('parent_user_id', parentUser.id)
      .eq('student_user_id', studentUserId)
      .maybeSingle();

    if (linkErr) {
      return json({ error: 'link_lookup_failed', detail: linkErr.message }, req, 500);
    }
    if (!linkRow) {
      return json({ error: 'not_linked' }, req, 404);
    }

    const { data: studentProfile, error: profileErr } = await admin
      .from('profiles')
      .select('is_household_child')
      .eq('id', studentUserId)
      .maybeSingle();

    if (profileErr || !studentProfile) {
      return json({ error: 'student_profile_missing' }, req, 400);
    }

    const { error: unlinkErr } = await admin
      .from('parent_student_links')
      .delete()
      .eq('parent_user_id', parentUser.id)
      .eq('student_user_id', studentUserId);

    if (unlinkErr) {
      return json({ error: 'unlink_failed', detail: unlinkErr.message }, req, 500);
    }

    if (studentProfile.is_household_child === true) {
      const { error: deleteErr } = await admin.auth.admin.deleteUser(studentUserId);
      if (deleteErr) {
        return json({ error: 'delete_failed', detail: deleteErr.message }, req, 500);
      }
    }

    return json({ ok: true }, req);
  } catch (e) {
    console.error('parent-remove-student:', e);
    return json({ error: 'internal_error', detail: String(e) }, req, 500);
  }
});
