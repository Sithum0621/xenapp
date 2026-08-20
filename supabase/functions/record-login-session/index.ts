/**
 * Records a login from the current device, sends email on first-seen device, returns alert metadata.
 *
 * Deploy: supabase functions deploy record-login-session
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { sendSystemNotificationEmail } from '../_shared/resendMail.ts';

function json(req: Request, body: Record<string, unknown>, status = 200) {
  return jsonResponse(req, body, status);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return optionsResponse(req);
  }

  if (req.method !== 'POST') {
    return json(req, { error: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim();
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  if (!supabaseUrl || !anonKey || !serviceRole) {
    return json(req, { error: 'server_misconfigured' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json(req, { error: 'not_authenticated' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return json(req, { error: 'not_authenticated' }, 401);
  }

  let body: {
    device_fingerprint?: string;
    device_label?: string;
    platform?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'invalid_json' }, 400);
  }

  const deviceFingerprint =
    typeof body.device_fingerprint === 'string' ? body.device_fingerprint.trim() : '';
  const deviceLabel =
    typeof body.device_label === 'string' && body.device_label.trim()
      ? body.device_label.trim().slice(0, 120)
      : 'Unknown device';
  const platform =
    typeof body.platform === 'string' && body.platform.trim()
      ? body.platform.trim().slice(0, 32)
      : 'unknown';

  if (!deviceFingerprint || deviceFingerprint.length > 256) {
    return json(req, { error: 'invalid_device_fingerprint' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await admin
    .from('user_device_sessions')
    .select('id, email_notified_at')
    .eq('user_id', user.id)
    .eq('device_fingerprint', deviceFingerprint)
    .maybeSingle();

  if (existingError) {
    console.error('[record-login-session] lookup failed', existingError.message);
    return json(req, { error: 'db_error', detail: existingError.message }, 500);
  }

  const isNewDevice = !existing?.id;

  const { error: upsertError } = await admin.from('user_device_sessions').upsert(
    {
      user_id: user.id,
      device_fingerprint: deviceFingerprint,
      device_label: deviceLabel,
      platform,
      last_seen_at: now,
      ...(isNewDevice ? { first_seen_at: now } : {}),
    },
    { onConflict: 'user_id,device_fingerprint' },
  );

  if (upsertError) {
    console.error('[record-login-session] upsert failed', upsertError.message);
    return json(req, { error: 'db_error', detail: upsertError.message }, 500);
  }

  let emailSent = false;
  let emailSkipReason: string | null = null;

  if (isNewDevice || !existing?.email_notified_at) {
    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(user.id);
    const email = authUser?.user?.email?.trim();

    if (authUserError || !email) {
      emailSkipReason = authUserError ? 'user_lookup_failed' : 'missing_email';
    } else {
      const when = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <h2 style="color:#123B7A;margin:0 0 12px">New sign-in to your MyTuition account</h2>
          <p>A new device just signed in to your MyTuition account.</p>
          <ul>
            <li><strong>Device:</strong> ${escapeHtml(deviceLabel)}</li>
            <li><strong>Platform:</strong> ${escapeHtml(platform)}</li>
            <li><strong>Time:</strong> ${escapeHtml(when)} UTC</li>
          </ul>
          <p>If this was you, no action is needed. You can stay signed in on multiple devices.</p>
          <p style="color:#64748b;font-size:13px">If you did not sign in, change your password immediately and contact support.</p>
        </div>`;

      const mail = await sendSystemNotificationEmail(
        email,
        'Security alert: new device signed in to MyTuition',
        html,
      );

      if (mail.ok) {
        emailSent = true;
        await admin
          .from('user_device_sessions')
          .update({ email_notified_at: now })
          .eq('user_id', user.id)
          .eq('device_fingerprint', deviceFingerprint);
      } else {
        emailSkipReason = mail.skippedReason;
      }
    }
  }

  return json(req, {
    ok: true,
    is_new_device: isNewDevice,
    device_label: deviceLabel,
    email_sent: emailSent,
    email_skip_reason: emailSkipReason,
    show_security_alert: true,
  });
});
