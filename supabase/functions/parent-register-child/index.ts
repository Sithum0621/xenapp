/**
 * Parent registers an additional child on the household dashboard.
 * Shares parent NIC + mobile; each child gets a unique auth UUID.
 *
 * Deploy: supabase functions deploy parent-register-child --no-verify-jwt
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { corsHeadersFor, jsonResponse } from '../_shared/cors.ts';
import { waitForProfileRow } from '../_shared/staffTempPassword.ts';

const SYNTHETIC_PHONE_EMAIL_DOMAIN = 'phone.wovello.app';
const STUDENT_LIMIT = 3;

function json(body: Record<string, unknown>, req: Request, status = 200) {
  return jsonResponse(req, body, status);
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
      .select('role')
      .eq('id', parentUser.id)
      .maybeSingle();

    if (parentProfileErr || !parentProfile) {
      return json({ error: 'parent_profile_missing' }, req, 400);
    }
    if (parentProfile.role !== 'parent_student') {
      return json({ error: 'not_parent_account' }, req, 403);
    }

    const { data: parentContact } = await admin
      .from('profiles_contact')
      .select('mobile_number, nic_number')
      .eq('id', parentUser.id)
      .maybeSingle();

    const { data: parentProfileLegacy } = await admin
      .from('profiles')
      .select('nic_number, mobile_number')
      .eq('id', parentUser.id)
      .maybeSingle();

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
      parsePhoneE164(parentContact?.mobile_number) ??
      parsePhoneE164(parentProfileLegacy?.mobile_number) ??
      null;

    const parentNicRaw =
      (typeof parentContact?.nic_number === 'string' && parentContact.nic_number.trim()
        ? parentContact.nic_number.trim()
        : null) ??
      (typeof parentProfileLegacy?.nic_number === 'string' && parentProfileLegacy.nic_number.trim()
        ? parentProfileLegacy.nic_number.trim()
        : null);
    const parentNic = parentNicRaw ? parentNicRaw.toUpperCase() : null;

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

    return json(
      {
        ok: true,
        student_user_id: studentUserId,
      },
      req,
    );
  } catch (e) {
    console.error('parent-register-child:', e);
    return json({ error: 'internal_error', detail: String(e) }, req, 500);
  }
});
