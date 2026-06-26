/**
 * Creates an institute admin in Auth + profiles (trigger), email confirmed for immediate login.
 * Credentials email sent via Resend (non-expiring admin account).
 *
 * Deploy: supabase functions deploy superadmin-create-institute-admin
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { sendHtmlEmailViaResend } from '../_shared/resendMail.ts';
import {
  buildStaffCredentialsEmailHtml,
  clearStaffTempPasswordExpiry,
  waitForProfileRow,
} from '../_shared/staffTempPassword.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl?.trim() || !anonKey?.trim() || !serviceRole?.trim()) {
    return json({ error: 'server_misconfigured' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401);
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
    return json({ error: 'unauthorized' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();

  if (callerProfile?.role !== 'superadmin') {
    return json({ error: 'not_superadmin' }, 403);
  }

  let body: {
    institute_id?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    password?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const instituteRaw = typeof body.institute_id === 'string' ? body.institute_id.trim() : '';
  const firstName = typeof body.first_name === 'string' ? body.first_name.trim() : '';
  const lastName = typeof body.last_name === 'string' ? body.last_name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!instituteRaw || !UUID_RE.test(instituteRaw)) {
    return json({ error: 'invalid_institute_id' }, 400);
  }

  if (!firstName || !lastName || !email || !password || password.length < 6) {
    return json({ error: 'validation_failed' }, 400);
  }

  if (!email.includes('@')) {
    return json({ error: 'validation_failed' }, 400);
  }

  const { data: instituteRow } = await admin.from('institutes').select('id').eq('id', instituteRaw).maybeSingle();

  if (!instituteRow?.id) {
    return json({ error: 'institute_not_found' }, 404);
  }

  const full_name = `${firstName} ${lastName}`.trim();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name,
      role: 'admin',
      institute_id: instituteRaw,
    },
  });

  if (createErr || !created?.user?.id) {
    const msg = (createErr?.message ?? 'create_failed').toLowerCase();
    if (
      msg.includes('already registered') ||
      msg.includes('already been registered') ||
      msg.includes('user already registered')
    ) {
      return json({ error: 'email_exists' }, 409);
    }
    if (
      msg.includes('institute_not_found_for_admin_provision') ||
      msg.includes('institute_not_found')
    ) {
      return json({ error: 'institute_not_found' }, 404);
    }
    if (msg.includes('nic_required')) {
      return json({ error: 'nic_required_for_admin' }, 400);
    }
    return json({ error: 'create_failed', detail: createErr?.message ?? 'unknown' }, 400);
  }

  const userId = created.user.id;
  const profileReady = await waitForProfileRow(admin, userId);
  if (!profileReady) {
    return json({ error: 'profile_not_ready', user_id: userId }, 500);
  }

  const cleared = await clearStaffTempPasswordExpiry(admin, userId);
  if (!cleared.ok) {
    return json({ error: 'profile_update_failed', detail: cleared.detail, user_id: userId }, 500);
  }

  const emailHtml = buildStaffCredentialsEmailHtml({
    fullName: full_name,
    email,
    password,
    roleLabel: 'institute admin',
  });

  const sent = await sendHtmlEmailViaResend({
    to: email,
    subject: 'Your XEN institute admin account',
    html: emailHtml,
  });

  if (!sent.ok) {
    console.error(
      '[superadmin-create-institute-admin] credentials email failed',
      email,
      sent.skippedReason,
    );
  }

  return json({
    ok: true,
    user_id: userId,
    email_sent: sent.ok,
    email_skip_reason: sent.ok ? null : sent.skippedReason,
    manual_password: sent.ok ? null : password,
  });
});
