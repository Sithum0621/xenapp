/**
 * Teachers register new parent_student accounts (optional NIC via teacher_invited metadata)
 * or link an existing student UUID into a personal group or institute lecture group.
 *
 * Deploy: supabase functions deploy teacher-student-enroll --no-verify-jwt
 * (OPTIONS preflight has no JWT; gateway JWT verify must be off. Auth is enforced via Bearer + getUser().)
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

/** CORS for browser dev (Expo web) and production; reflects Origin when allowlisted, else *. */
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * MUST match the client constant in `src/utils/loginIdentifier.ts`.
 * Phone identifiers are stored as a deterministic synthetic email so logins flow through
 * Supabase's email provider — phone provider does not need to be enabled at the project level.
 */
const SYNTHETIC_PHONE_EMAIL_DOMAIN = 'phone.wovello.app';

function syntheticEmailFromPhoneE164(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, '');
  return `wovello-${digits}@${SYNTHETIC_PHONE_EMAIL_DOMAIN}`;
}

function parseUsername(raw: string): { kind: 'email'; email: string } | { kind: 'phone'; phone: string } | null {
  const t = raw.trim();
  if (!t) return null;
  if (t.includes('@')) {
    const email = t.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    return { kind: 'email', email };
  }
  const digits = t.replace(/\D/g, '');
  let rest = digits;
  if (rest.startsWith('94')) rest = rest.slice(2);
  if (rest.startsWith('0')) rest = rest.slice(1);
  if (rest.length === 9 && /^7[0-9]{8}$/.test(rest)) {
    return { kind: 'phone', phone: `+94${rest}` };
  }
  if (digits.length >= 10 && digits.length <= 15 && t.startsWith('+')) {
    return { kind: 'phone', phone: t.replace(/\s/g, '') };
  }
  return null;
}

type GroupSource = 'personal' | 'institute';

async function assertTeacherCanManageGroup(
  admin: ReturnType<typeof createClient>,
  teacherId: string,
  source: GroupSource,
  groupId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: profile, error: pe } = await admin.from('profiles').select('role').eq('id', teacherId).maybeSingle();
  if (pe || !profile || profile.role !== 'teacher') {
    return { ok: false, status: 403, error: 'not_teacher' };
  }

  if (source === 'personal') {
    const { data, error } = await admin
      .from('teacher_personal_groups')
      .select('id')
      .eq('id', groupId)
      .eq('teacher_user_id', teacherId)
      .maybeSingle();
    if (error || !data) return { ok: false, status: 403, error: 'not_group_owner' };
    return { ok: true };
  }

  const { data: lg, error: lge } = await admin
    .from('lecture_groups')
    .select('id, primary_teacher_user_id')
    .eq('id', groupId)
    .maybeSingle();
  if (lge || !lg) return { ok: false, status: 404, error: 'group_not_found' };
  if (lg.primary_teacher_user_id === teacherId) return { ok: true };

  const { data: co } = await admin
    .from('lecture_group_teachers')
    .select('teacher_user_id')
    .eq('lecture_group_id', groupId)
    .eq('teacher_user_id', teacherId)
    .maybeSingle();
  if (!co) return { ok: false, status: 403, error: 'not_assigned_teacher' };
  return { ok: true };
}

async function enrollExistingStudent(
  admin: ReturnType<typeof createClient>,
  source: GroupSource,
  groupId: string,
  studentUserId: string,
  displayNameFallback: string,
): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  const { data: studentProfile, error: spErr } = await admin
    .from('profiles')
    .select('full_name, role')
    .eq('id', studentUserId)
    .maybeSingle();

  if (spErr || !studentProfile) return { ok: false, error: 'student_not_found' };
  if (studentProfile.role !== 'parent_student') return { ok: false, error: 'not_a_student_account' };

  const displayName =
    displayNameFallback.trim() ||
    (typeof studentProfile.full_name === 'string' ? studentProfile.full_name.trim() : '') ||
    'Student';

  if (source === 'personal') {
    const { error } = await admin.from('teacher_personal_roster_entries').insert({
      teacher_personal_group_id: groupId,
      student_user_id: studentUserId,
      display_name: displayName,
    });
    if (error) {
      if (error.code === '23505') return { ok: false, error: 'already_enrolled', code: error.code };
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }

  const { data: lg, error: lgErr } = await admin
    .from('lecture_groups')
    .select('institute_id')
    .eq('id', groupId)
    .single();
  if (lgErr || !lg?.institute_id) return { ok: false, error: 'group_not_found' };

  const { error: mErr } = await admin.from('institute_student_membership').upsert(
    { institute_id: lg.institute_id, user_id: studentUserId },
    { onConflict: 'institute_id,user_id' },
  );
  if (mErr) return { ok: false, error: mErr.message };

  const { error: eErr } = await admin.from('lecture_group_students').upsert(
    { lecture_group_id: groupId, student_user_id: studentUserId },
    { onConflict: 'lecture_group_id,student_user_id' },
  );
  if (eErr) {
    if (eErr.code === '23505') return { ok: false, error: 'already_enrolled', code: eErr.code };
    return { ok: false, error: eErr.message };
  }

  return { ok: true };
}

type StudentIdent = { kind: 'email'; email: string } | { kind: 'phone'; phone: string };

async function lookupAuthUserIdByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc('lookup_auth_user_id_by_email', {
    p_email: email,
  });
  if (error || typeof data !== 'string' || !data) return null;
  return data;
}

async function waitForStudentProfile(
  admin: ReturnType<typeof createClient>,
  studentUserId: string,
  maxAttempts = 10,
): Promise<{ role: string; xen_student_id: string | null } | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await admin
      .from('profiles')
      .select('role, xen_student_id')
      .eq('id', studentUserId)
      .maybeSingle();
    if (!error && data) {
      return {
        role: String(data.role ?? ''),
        xen_student_id:
          typeof data.xen_student_id === 'string' ? data.xen_student_id : null,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return null;
}

async function finalizeRegisteredStudent(
  admin: ReturnType<typeof createClient>,
  studentUserId: string,
  opts: {
    firstName: string;
    lastName: string;
    fullName: string;
    address: string;
    password: string;
    ident: StudentIdent;
    groupSource: GroupSource;
    groupId: string;
  },
): Promise<
  | { ok: true; xenStudentId: string }
  | { ok: false; error: string; detail?: string; status: number }
> {
  const { firstName, lastName, fullName, address, password, ident, groupSource, groupId } = opts;

  const roleRow = await waitForStudentProfile(admin, studentUserId);
  if (!roleRow) {
    return { ok: false, error: 'student_not_found', status: 404 };
  }
  if (roleRow.role !== 'parent_student') {
    return { ok: false, error: 'username_exists', status: 409 };
  }

  const { error: pwErr } = await admin.auth.admin.updateUserById(studentUserId, {
    password,
    user_metadata: {
      full_name: fullName,
      role: 'parent_student',
      teacher_invited: 'true',
      ...(ident.kind === 'phone'
        ? { login_phone: ident.phone, synthetic_email: 'true' }
        : {}),
    },
  });
  if (pwErr) {
    return { ok: false, error: 'signup_failed', detail: pwErr.message, status: 400 };
  }

  const nowIso = new Date().toISOString();
  const tempExpiresIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error: profileRpcErr } = await admin.rpc('teacher_upsert_student_profile', {
    p_student_user_id: studentUserId,
    p_first_name: firstName,
    p_last_name: lastName,
    p_full_name: fullName,
    p_address: address || null,
    p_mobile_number: ident.kind === 'phone' ? ident.phone : null,
    p_password_created_at: nowIso,
    p_temp_password_expires_at: tempExpiresIso,
  });

  if (profileRpcErr) {
    const { error: legacyUpErr } = await admin
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        address: address || null,
        mobile_number: ident.kind === 'phone' ? ident.phone : null,
        password_created_at: nowIso,
        temp_password_expires_at: tempExpiresIso,
      })
      .eq('id', studentUserId);

    if (legacyUpErr) {
      return {
        ok: false,
        error: 'profile_update_failed',
        detail: profileRpcErr.message || legacyUpErr.message,
        status: 500,
      };
    }
  }

  const enrollResult = await enrollExistingStudent(
    admin,
    groupSource,
    groupId,
    studentUserId,
    fullName,
  );
  if (!enrollResult.ok && enrollResult.error !== 'already_enrolled') {
    return {
      ok: false,
      error: 'enroll_failed',
      detail: enrollResult.error,
      status: 500,
    };
  }

  const { data: xenStudentId, error: xenErr } = await admin.rpc('allocate_xen_student_id', {
    p_student_user_id: studentUserId,
  });

  if (!xenErr && typeof xenStudentId === 'string' && xenStudentId.trim()) {
    return { ok: true, xenStudentId: xenStudentId.trim() };
  }

  const existing =
    typeof roleRow.xen_student_id === 'string' ? roleRow.xen_student_id.trim() : '';
  if (existing) {
    return { ok: true, xenStudentId: existing };
  }

  const { data: refreshed } = await admin
    .from('profiles')
    .select('xen_student_id')
    .eq('id', studentUserId)
    .maybeSingle();
  const refreshedXen =
    typeof refreshed?.xen_student_id === 'string' ? refreshed.xen_student_id.trim() : '';
  if (refreshedXen) {
    return { ok: true, xenStudentId: refreshedXen };
  }

  return {
    ok: false,
    error: 'xen_id_failed',
    detail: xenErr?.message ?? 'missing xen_student_id',
    status: 500,
  };
}

Deno.serve(async (req) => {
  // 204 must use a null body (not ''); otherwise the runtime can error and browsers see no CORS headers.
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeadersFor(req),
    });
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
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user?.id) {
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

    const mode = typeof body.mode === 'string' ? body.mode.trim() : '';
    const groupSource = typeof body.group_source === 'string' ? body.group_source.trim() : '';
    const groupId = typeof body.group_id === 'string' ? body.group_id.trim() : '';

    if (!UUID_RE.test(groupId)) {
      return json({ error: 'invalid_group_id' }, req, 400);
    }

    if (groupSource !== 'personal' && groupSource !== 'institute') {
      return json({ error: 'invalid_group_source' }, req, 400);
    }

    const gate = await assertTeacherCanManageGroup(admin, user.id, groupSource as GroupSource, groupId);
    if (!gate.ok) {
      return json({ error: gate.error }, req, gate.status);
    }

    if (mode === 'link') {
      const sid = typeof body.student_user_id === 'string' ? body.student_user_id.trim() : '';
      if (!UUID_RE.test(sid)) {
        return json({ error: 'invalid_student_id' }, req, 400);
      }

      const r = await enrollExistingStudent(admin, groupSource as GroupSource, groupId, sid, '');
      if (!r.ok) {
        const status = r.error === 'already_enrolled' ? 409 : 400;
        return json({ error: r.error }, req, status);
      }
      return json({ ok: true, student_user_id: sid }, req);
    }

    if (mode === 'register') {
      const firstName = typeof body.first_name === 'string' ? body.first_name.trim() : '';
      const lastName = typeof body.last_name === 'string' ? body.last_name.trim() : '';
      const username = typeof body.username === 'string' ? body.username.trim() : '';
      const address = typeof body.address === 'string' ? body.address.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';

      if (!firstName || !lastName || !username || !address || !password || password.length < 6) {
        return json({ error: 'validation_failed' }, req, 400);
      }

      const ident = parseUsername(username);
      if (!ident) {
        return json({ error: 'invalid_username' }, req, 400);
      }

      const fullName = `${firstName} ${lastName}`.trim();
      const user_metadata: Record<string, string> = {
        full_name: fullName,
        role: 'parent_student',
        teacher_invited: 'true',
      };

      const authEmail =
        ident.kind === 'email' ? ident.email : syntheticEmailFromPhoneE164(ident.phone);

      const enrichedMetadata: Record<string, string> =
        ident.kind === 'phone'
          ? { ...user_metadata, login_phone: ident.phone, synthetic_email: 'true' }
          : user_metadata;

      let studentUserId: string | null = null;

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: enrichedMetadata,
      });

      if (createErr || !created?.user?.id) {
        const msg = (createErr?.message ?? '').toLowerCase();
        if (msg.includes('already registered') || msg.includes('already been registered')) {
          studentUserId = await lookupAuthUserIdByEmail(admin, authEmail);
          if (!studentUserId) {
            return json({ error: 'username_exists' }, req, 409);
          }
        } else {
          return json({ error: 'signup_failed', detail: createErr?.message ?? 'unknown' }, req, 400);
        }
      } else {
        studentUserId = created.user.id;
      }

      const finalized = await finalizeRegisteredStudent(admin, studentUserId, {
        firstName,
        lastName,
        fullName,
        address,
        password,
        ident,
        groupSource: groupSource as GroupSource,
        groupId,
      });

      if (!finalized.ok) {
        return json(
          { error: finalized.error, detail: finalized.detail },
          req,
          finalized.status,
        );
      }

      return json(
        { ok: true, user_id: studentUserId, xen_student_id: finalized.xenStudentId },
        req,
      );
    }

    return json({ error: 'invalid_mode' }, req, 400);
  } catch (e) {
    console.error('teacher-student-enroll:', e);
    return json({ error: 'internal_error', detail: String(e) }, req, 500);
  }
});
