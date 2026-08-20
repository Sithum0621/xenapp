/**
 * Teachers register new parent_student accounts (optional NIC via teacher_invited metadata)
 * or link an existing student UUID into a personal group or institute lecture group.
 *
 * Deploy: supabase functions deploy teacher-student-enroll --no-verify-jwt
 * (OPTIONS preflight has no JWT; gateway JWT verify must be off. Auth is enforced via Bearer + getUser().)
 */
import { corsHeadersFor, jsonResponse } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

function json(body: Record<string, unknown>, req: Request, status = 200) {
  return jsonResponse(req, body, status);
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

/** Unique auth email so multiple students may share one mobile number. */
function syntheticEmailForSharedMobileStudent(): string {
  const id = crypto.randomUUID().replace(/-/g, '');
  return `wovello-s-${id}@${SYNTHETIC_PHONE_EMAIL_DOMAIN}`;
}

function randomTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]!).join('');
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
      console.error('personal roster insert:', error.message);
      return { ok: false, error: 'enroll_failed', code: error.code };
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

async function lookupStudentByMobile(
  admin: ReturnType<typeof createClient>,
  mobileE164: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc('lookup_parent_student_id_by_mobile', {
    p_mobile: mobileE164,
  });
  if (error || typeof data !== 'string' || !data) return null;
  return data;
}

async function upsertStudentMobile(
  admin: ReturnType<typeof createClient>,
  studentUserId: string,
  mobileE164: string,
): Promise<void> {
  const { error } = await admin.from('profiles_contact').upsert(
    { id: studentUserId, mobile_number: mobileE164 },
    { onConflict: 'id' },
  );
  if (error) {
    await admin
      .from('profiles_contact')
      .update({ mobile_number: mobileE164 })
      .eq('id', studentUserId);
  }
}

async function bindIssuedClassCard(
  admin: ReturnType<typeof createClient>,
  token: string,
  teacherId: string,
  studentUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing } = await admin
    .from('issued_class_cards')
    .select('teacher_user_id, student_user_id')
    .eq('token', token)
    .maybeSingle();

  if (existing?.teacher_user_id && existing.teacher_user_id !== teacherId) {
    return { ok: false, error: 'card_owned_by_other' };
  }
  if (
    typeof existing?.student_user_id === 'string' &&
    existing.student_user_id &&
    existing.student_user_id !== studentUserId
  ) {
    return { ok: false, error: 'card_already_linked' };
  }

  const nowIso = new Date().toISOString();
  const { error } = await admin.from('issued_class_cards').upsert(
    {
      token,
      teacher_user_id: teacherId,
      student_user_id: studentUserId,
      claimed_at: nowIso,
    },
    { onConflict: 'token' },
  );
  if (error) return { ok: false, error: 'card_bind_failed' };
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
  maxAttempts = 25,
): Promise<{ role: string } | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await admin
      .from('profiles')
      .select('role')
      .eq('id', studentUserId)
      .maybeSingle();
    if (!error && data) {
      return { role: String(data.role ?? '') };
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
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
  | { ok: true }
  | { ok: false; error: string; detail?: string; status: number }
> {
  const { firstName, lastName, fullName, address, password, ident, groupSource, groupId } = opts;

  const roleRow = await waitForStudentProfile(admin, studentUserId);
  if (!roleRow) {
    return { ok: false, error: 'student_not_found', status: 404 };
  }
  if (roleRow.role !== 'parent_student') {
    // Teacher-invited creates should always land as parent_student; repair if trigger raced.
    const { error: roleFixErr } = await admin
      .from('profiles')
      .update({ role: 'parent_student', is_teacher_invited: true })
      .eq('id', studentUserId);
    if (roleFixErr) {
      return { ok: false, error: 'username_exists', status: 409 };
    }
    roleRow.role = 'parent_student';
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
    console.error('teacher_upsert_student_profile:', profileRpcErr.message);
    const { error: legacyUpErr } = await admin
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        is_teacher_invited: true,
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

    if (ident.kind === 'phone') {
      await upsertStudentMobile(admin, studentUserId, ident.phone);
    }
    await admin.from('profiles_contact').upsert(
      {
        id: studentUserId,
        address: address || null,
        password_created_at: nowIso,
        temp_password_expires_at: tempExpiresIso,
        ...(ident.kind === 'phone' ? { mobile_number: ident.phone } : {}),
      },
      { onConflict: 'id' },
    );
  } else {
    await admin.from('profiles').update({ is_teacher_invited: true }).eq('id', studentUserId);
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

  // Mobile number is the login identity — no XEN ID allocation.
  return { ok: true };
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

    if (mode === 'link_by_mobile') {
      const mobileRaw = typeof body.mobile_number === 'string' ? body.mobile_number.trim() : '';
      const ident = parseUsername(mobileRaw);
      if (!ident || ident.kind !== 'phone') {
        return json({ error: 'invalid_username' }, req, 400);
      }

      const cardToken =
        typeof body.card_token === 'string' && /^mtc1_[A-Za-z0-9]{20}$/.test(body.card_token.trim())
          ? body.card_token.trim()
          : '';
      if (!cardToken) {
        return json({ error: 'card_required' }, req, 400);
      }
      const scannedId =
        typeof body.student_user_id === 'string' && UUID_RE.test(body.student_user_id.trim())
          ? body.student_user_id.trim()
          : '';

      let studentUserId: string | null = scannedId || null;
      if (studentUserId) {
        const { data: scannedProfile } = await admin
          .from('profiles')
          .select('id, role')
          .eq('id', studentUserId)
          .maybeSingle();
        if (!scannedProfile || scannedProfile.role !== 'parent_student') {
          studentUserId = null;
        }
      }
      if (!studentUserId) {
        studentUserId = await lookupStudentByMobile(admin, ident.phone);
      }
      if (!studentUserId) {
        return json({ error: 'student_not_found' }, req, 404);
      }

      await upsertStudentMobile(admin, studentUserId, ident.phone);

      if (UUID_RE.test(groupId) && (groupSource === 'personal' || groupSource === 'institute')) {
        const gate = await assertTeacherCanManageGroup(
          admin,
          user.id,
          groupSource as GroupSource,
          groupId,
        );
        if (!gate.ok) {
          return json({ error: gate.error }, req, gate.status);
        }
        const r = await enrollExistingStudent(
          admin,
          groupSource as GroupSource,
          groupId,
          studentUserId,
          '',
        );
        if (!r.ok && r.error !== 'already_enrolled') {
          return json({ error: r.error }, req, 400);
        }
      }

      if (cardToken) {
        const bound = await bindIssuedClassCard(admin, cardToken, user.id, studentUserId);
        if (!bound.ok) {
          return json({ error: bound.error, student_user_id: studentUserId }, req, 409);
        }
      }

      return json(
        { ok: true, student_user_id: studentUserId, mobile_number: ident.phone },
        req,
      );
    }

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

    if (mode === 'add_by_name_mobile') {
      const fullNameRaw = typeof body.full_name === 'string' ? body.full_name.trim() : '';
      const mobileRaw = typeof body.mobile_number === 'string' ? body.mobile_number.trim() : '';
      if (!fullNameRaw) {
        return json({ error: 'validation_failed' }, req, 400);
      }
      const ident = parseUsername(mobileRaw);
      if (!ident || ident.kind !== 'phone') {
        return json({ error: 'invalid_username' }, req, 400);
      }

      const nameParts = fullNameRaw.split(/\s+/).filter(Boolean);
      const firstName = nameParts[0] ?? fullNameRaw;
      const lastName = nameParts.slice(1).join(' ') || '-';
      const fullName = `${firstName} ${lastName}`.trim();

      // Always create a new student row. Same mobile may be shared by many students.
      // Login credentials are not shown — card / mobile linking is used later.
      const password = randomTempPassword();
      const authEmail = syntheticEmailForSharedMobileStudent();
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role: 'parent_student',
          teacher_invited: 'true',
          login_phone: ident.phone,
          synthetic_email: 'true',
          shared_mobile_student: 'true',
        },
      });

      let studentUserId: string | null = created?.user?.id ?? null;
      if (createErr || !studentUserId) {
        console.error('createUser:', createErr?.message ?? 'no user id');
        return json(
          { error: 'signup_failed', detail: createErr?.message ?? 'unknown' },
          req,
          400,
        );
      }

      const finalized = await finalizeRegisteredStudent(admin, studentUserId, {
        firstName,
        lastName,
        fullName,
        address: '—',
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
        {
          ok: true,
          created: true,
          user_id: studentUserId,
        },
        req,
      );
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
        { ok: true, user_id: studentUserId },
        req,
      );
    }

    return json({ error: 'invalid_mode' }, req, 400);
  } catch (e) {
    console.error('teacher-student-enroll:', e);
    return json({ error: 'internal_error', detail: String(e) }, req, 500);
  }
});
