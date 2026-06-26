/**
 * Public signup via Admin API so Teacher / Parent–Student skip confirmation emails (no inbox flood or Auth email rate limits).
 * Institute admins are created only by platform superadmins (superadmin-create-institute-admin).
 *
 * Deploy: supabase functions deploy signup-public --no-verify-jwt
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { waitForProfileRow } from '../_shared/staffTempPassword.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** MUST match `src/utils/loginIdentifier.ts`. */
const SYNTHETIC_PHONE_EMAIL_DOMAIN = 'phone.wovello.app';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeNic(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

function validNicFormat(n: string): boolean {
  if (n.length === 12) return /^[0-9]{12}$/.test(n);
  if (n.length === 10) return /^[0-9]{9}[VX]$/.test(n);
  return false;
}

function syntheticEmailFromPhoneE164(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, '');
  return `wovello-${digits}@${SYNTHETIC_PHONE_EMAIL_DOMAIN}`;
}

function parseSriLankaMobile(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, '');
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
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl?.trim() || !serviceRole?.trim()) {
    return json({ error: 'server_misconfigured' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: {
    email?: string;
    mobile_number?: string;
    password?: string;
    full_name?: string;
    role?: string;
    nic_number?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const emailRaw = typeof body.email === 'string' ? body.email.trim() : '';
  const mobileRaw = typeof body.mobile_number === 'string' ? body.mobile_number.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const full_name = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const role = typeof body.role === 'string' ? body.role.trim() : '';
  const nic_raw = typeof body.nic_number === 'string' ? body.nic_number.trim() : '';

  const allowedRoles = ['teacher', 'parent_student'];
  if (!allowedRoles.includes(role)) {
    return json({ error: 'invalid_role' }, 400);
  }

  if (!password || password.length < 6) {
    return json({ error: 'validation_failed', detail: 'password' }, 400);
  }
  if (!full_name) {
    return json({ error: 'validation_failed', detail: 'full_name' }, 400);
  }

  let authEmail = '';
  let phoneE164: string | null = null;
  let contactEmail: string | null = null;

  if (role === 'parent_student') {
    phoneE164 = parseSriLankaMobile(mobileRaw);
    if (!phoneE164) {
      return json({ error: 'invalid_mobile' }, 400);
    }

    if (emailRaw) {
      const emailLower = emailRaw.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
        return json({ error: 'invalid_email' }, 400);
      }
      contactEmail = emailLower;
    }

    authEmail = syntheticEmailFromPhoneE164(phoneE164);
  } else {
    authEmail = emailRaw.toLowerCase();
    if (!authEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail)) {
      return json({ error: 'email_required' }, 400);
    }
  }

  const exemptNic = authEmail === 'sithumpriyashan12@gmail.com';

  let nicNormalized: string | null = null;
  if (!exemptNic) {
    nicNormalized = normalizeNic(nic_raw);
    if (!nicNormalized || !validNicFormat(nicNormalized)) {
      return json({ error: 'invalid_nic' }, 400);
    }

    const { data: avail, error: nicErr } = await admin.rpc('signup_nic_available', {
      p_nic: nicNormalized,
    });

    if (nicErr) {
      return json({ error: 'nic_check_failed', detail: nicErr.message }, 500);
    }
    if (avail !== true) {
      return json({ error: 'nic_taken' }, 409);
    }
  }

  /** Teachers & parents: confirm immediately → no confirmation email from Auth. */
  const skipConfirmationEmail = role === 'teacher' || role === 'parent_student';

  const user_metadata: Record<string, string> = {
    full_name,
    role,
  };
  if (nicNormalized) {
    user_metadata.nic_number = nicNormalized;
  }
  if (phoneE164) {
    user_metadata.login_phone = phoneE164;
    user_metadata.synthetic_email = 'true';
  }
  if (contactEmail) {
    user_metadata.contact_email = contactEmail;
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: skipConfirmationEmail,
    user_metadata,
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
    return json({ error: 'signup_failed', detail: createErr?.message ?? 'unknown' }, 400);
  }

  const userId = created.user.id;

  await waitForProfileRow(admin, userId);

  if (role === 'parent_student' && phoneE164) {
    const displayMobile = mobileDisplayFromE164(phoneE164);
    await admin.from('profiles').update({ mobile_number: displayMobile }).eq('id', userId);
    if (contactEmail) {
      await admin.from('profiles_contact').update({ contact_email: contactEmail }).eq('id', userId);
    }
  }

  return json({ ok: true, user_id: userId, auth_email: authEmail });
});
