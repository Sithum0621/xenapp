/**
 * Resets an institute admin password and emails new credentials via Resend (non-expiring account).
 *
 * Deploy: supabase functions deploy superadmin-resend-admin-credentials
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { sendHtmlEmailViaResend } from '../_shared/resendMail.ts';
import {
  buildStaffCredentialsEmailHtml,
  clearStaffTempPasswordExpiry,
} from '../_shared/staffTempPassword.ts';

function json(req: Request, body: Record<string, unknown>, status = 200) {
  return jsonResponse(req, body, status);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function randomTempPassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

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

  let body: { institute_id?: string; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'invalid_json' }, 400);
  }

  const instituteRaw = typeof body.institute_id === 'string' ? body.institute_id.trim() : '';
  const targetUserId = typeof body.user_id === 'string' ? body.user_id.trim() : '';

  if (!instituteRaw || !UUID_RE.test(instituteRaw) || !targetUserId || !UUID_RE.test(targetUserId)) {
    return json(req, { error: 'validation_failed' }, 400);
  }

  const { data: targetProfile } = await admin
    .from('profiles')
    .select('role, institute_id, full_name')
    .eq('id', targetUserId)
    .maybeSingle();

  if (
    !targetProfile ||
    targetProfile.role !== 'admin' ||
    targetProfile.institute_id !== instituteRaw
  ) {
    return json(req, { error: 'admin_not_found' }, 404);
  }

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(targetUserId);
  const email = authUser?.user?.email?.trim().toLowerCase();
  if (authErr || !email) {
    return json(req, { error: 'admin_not_found' }, 404);
  }

  const password = randomTempPassword();
  const { error: updateErr } = await admin.auth.admin.updateUserById(targetUserId, { password });
  if (updateErr) {
    return json(req, { error: 'password_update_failed', detail: updateErr.message }, 500);
  }

  const cleared = await clearStaffTempPasswordExpiry(admin, targetUserId);
  if (!cleared.ok) {
    return json(req, { error: 'profile_update_failed', detail: cleared.detail }, 500);
  }

  const fullName = typeof targetProfile.full_name === 'string' ? targetProfile.full_name.trim() : '';
  const emailHtml = buildStaffCredentialsEmailHtml({
    fullName,
    email,
    password,
    roleLabel: 'institute admin',
  });

  const sent = await sendHtmlEmailViaResend({
    to: email,
    subject: 'Your MyTuition institute admin credentials',
    html: emailHtml,
  });

  if (!sent.ok) {
    console.error(
      '[superadmin-resend-admin-credentials] email failed',
      email,
      sent.skippedReason,
    );
  }

  return json(req, {
    ok: true,
    email_sent: sent.ok,
    email_skip_reason: sent.ok ? null : sent.skippedReason,
    /** Returned when email could not be sent so superadmin can share manually. */
    manual_password: sent.ok ? null : password,
  });
});
