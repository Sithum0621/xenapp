/**
 * Parent registers an additional child on the household dashboard.
 * Shares parent NIC + mobile; each child gets a unique auth UUID and XEN student ID.
 *
 * Deploy: supabase functions deploy parent-register-child --no-verify-jwt
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { waitForProfileRow } from '../_shared/staffTempPassword.ts';

const SYNTHETIC_PHONE_EMAIL_DOMAIN = 'phone.wovello.app';
const STUDENT_LIMIT = 3;

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

function syntheticHouseholdChildEmail(studentUserId: string): string {
  const compact = studentUserId.replace(/-/g, '');
  return `wovello-hh-${compact}@${SYNTHETIC_PHONE_EMAIL_DOMAIN}`;
}

function parsePhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  let local = digits;
  if (local.startsWith('0094')) local = local.slice(4);
  if (local.startsWith('94')) local = local.slice(2);
  if (local.startsWith('0')) local = local.slice(1);
  if (!/^7\d{8}$/.test(local)) return null;
  return `+94${local}`;
}

function mobileDisplayFromE164(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, '');
  const local = digits.startsWith('94') ? digits.slice(2) : digits;
  if (local.length === 9 && local.startsWith('7')) return `0${local}`;
  return phoneE164;
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

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'invalid_json' }, req, 400);
    }

    const firstName = typeof body.first_name === 'string' ? body.first_name.trim() : '';
    const lastName = typeof body.last_name === 'string' ? body.last_name.trim() : '';

    if (!firstName || !lastName) {
      return json({ error: 'validation_failed', detail: 'name' }, req, 400);
    }

    const password =
      typeof body.password === 'string' && body.password.length >= 6
        ? body.password
        : crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8);

    const { data: parentProfile, error: parentProfileErr } = await admin
      .from('profiles')
      .select('role, nic_number, mobile_number')
      .eq('id', parentUser.id)
      .maybeSingle();

    if (parentProfileErr || !parentProfile) {
      return json({ error: 'parent_profile_missing' }, req, 400);
    }
    if (parentProfile.role !== 'parent_student') {
      return json({ error: 'not_parent_account' }, req, 403);
    }

    const { count: householdCount, error: countErr } = await admin.rpc('parent_household_child_count', {
      p_parent_user_id: parentUser.id,
    });
    if (countErr) {
      return json({ error: 'count_failed', detail: countErr.message }, req, 500);
    }
    if ((householdCount ?? 0) >= STUDENT_LIMIT) {
      return json({ error: 'student_limit_reached' }, req, 409);
    }

    const parentMeta = parentUser.user_metadata ?? {};
    const loginPhone =
      parsePhoneE164(
        typeof parentMeta.login_phone === 'string' ? parentMeta.login_phone : null,
      ) ??
      parsePhoneE164(parentProfile.mobile_number) ??
      null;

    const parentNic =
      typeof parentProfile.nic_number === 'string' && parentProfile.nic_number.trim()
        ? parentProfile.nic_number.trim().toUpperCase()
        : null;

    if (!loginPhone) {
      return json({ error: 'parent_mobile_missing' }, req, 400);
    }
    if (!parentNic) {
      return json({ error: 'parent_nic_missing' }, req, 400);
    }

    const fullName = `${firstName} ${lastName}`.trim();
    const displayMobile = mobileDisplayFromE164(loginPhone);
    const childUserId = crypto.randomUUID();
    const authEmail = syntheticHouseholdChildEmail(childUserId);

    const user_metadata: Record<string, string> = {
      full_name: fullName,
      role: 'parent_student',
      parent_household_child: 'true',
      household_parent_id: parentUser.id,
      nic_number: parentNic,
      login_phone: loginPhone,
      synthetic_email: 'true',
    };

    const contactEmail =
      typeof parentMeta.contact_email === 'string' ? parentMeta.contact_email.trim().toLowerCase() : '';
    if (contactEmail) {
      user_metadata.contact_email = contactEmail;
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      id: childUserId,
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata,
    });

    if (createErr || !created?.user?.id) {
      return json({ error: 'signup_failed', detail: createErr?.message ?? 'unknown' }, req, 400);
    }

    const studentUserId = created.user.id;

    await waitForProfileRow(admin, studentUserId);

    const { error: profileUpErr } = await admin
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        mobile_number: displayMobile,
        nic_number: parentNic,
        is_household_child: true,
      })
      .eq('id', studentUserId);

    if (profileUpErr) {
      return json({ error: 'profile_update_failed', detail: profileUpErr.message }, req, 500);
    }

    const { error: linkErr } = await admin.from('parent_student_links').insert({
      parent_user_id: parentUser.id,
      student_user_id: studentUserId,
    });

    if (linkErr && linkErr.code !== '23505') {
      return json({ error: 'link_failed', detail: linkErr.message }, req, 500);
    }

    const { data: xenStudentId, error: xenErr } = await admin.rpc('allocate_xen_student_id', {
      p_student_user_id: studentUserId,
    });

    if (xenErr || typeof xenStudentId !== 'string' || !xenStudentId.trim()) {
      return json(
        { error: 'xen_id_failed', detail: xenErr?.message ?? 'missing xen_student_id' },
        req,
        500,
      );
    }

    return json(
      {
        ok: true,
        student_user_id: studentUserId,
        xen_student_id: xenStudentId.trim(),
      },
      req,
    );
  } catch (e) {
    console.error('parent-register-child:', e);
    return json({ error: 'internal_error', detail: String(e) }, req, 500);
  }
});
