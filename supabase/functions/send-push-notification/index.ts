/**
 * Sends FCM push notifications when a row is inserted into `public.notifications`.
 *
 * Trigger options (pick one):
 *  A) Database Webhook (Dashboard → Database → Webhooks): INSERT on `notifications`
 *     → POST to this function URL with header `x-push-webhook-secret`.
 *  B) pg_net trigger from migration `20260631300000_push_notifications_fcm.sql`
 *     (requires Vault secrets `push_notification_url` + `push_webhook_secret`).
 *
 * Deploy:
 *   supabase functions deploy send-push-notification --no-verify-jwt
 *
 * Secrets (NEVER commit to git — use Supabase CLI or Dashboard → Edge Functions → Secrets):
 *   supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
 *   supabase secrets set PUSH_WEBHOOK_SECRET='<long-random-string>'
 *
 * Manual test (service role):
 *   curl -X POST "$SUPABASE_URL/functions/v1/send-push-notification" \
 *     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
 *     -H "Content-Type: application/json" \
 *     -d '{"record":{"id":"...","user_id":"...","title":"Hi","body":"Test","data":{"route":"/home"}}}'
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { sendPushToTokens } from '../_shared/fcmAdmin.ts';
import { sendSmsViaSmsLenz, toSmsLenzContact } from '../_shared/smsLenz.ts';
import { timingSafeEqualString } from '../_shared/timingSafe.ts';

const PUSH_CORS_HEADERS = ['x-push-webhook-secret'];

function json(req: Request, body: Record<string, unknown>, status = 200) {
  return jsonResponse(req, body, status, PUSH_CORS_HEADERS);
}

type NotificationRecord = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
};

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: NotificationRecord;
};

function parseNotificationRecord(payload: WebhookPayload): NotificationRecord | null {
  const record = payload.record;
  if (!record || typeof record !== 'object') return null;
  if (typeof record.id !== 'string' || typeof record.user_id !== 'string') return null;
  if (typeof record.title !== 'string' || typeof record.body !== 'string') return null;
  return record;
}

function isAuthorized(req: Request, serviceRole: string): boolean {
  const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET')?.trim() ?? '';
  const headerSecret = req.headers.get('x-push-webhook-secret')?.trim() ?? '';

  if (webhookSecret && timingSafeEqualString(headerSecret, webhookSecret)) {
    return true;
  }

  const authHeader = req.headers.get('Authorization')?.trim() ?? '';
  if (serviceRole && timingSafeEqualString(authHeader, `Bearer ${serviceRole}`)) {
    return true;
  }

  return false;
}

type AdminClient = ReturnType<typeof createClient>;

/**
 * Optional SMS for attendance / payment events.
 * Push is always attempted separately — SMS off or 0 credits must not block push.
 *
 * Global kill switch: notification SMS stays off (teachers use push / in-app instead).
 * Set secret SMS_NOTIFICATIONS_ENABLED=true only if SMS should be re-enabled later.
 */
async function maybeSendTeacherSms(
  admin: AdminClient,
  notification: NotificationRecord,
): Promise<{ sent: boolean; skipped?: string }> {
  const smsEnabled = (Deno.env.get('SMS_NOTIFICATIONS_ENABLED')?.trim() ?? '').toLowerCase();
  if (smsEnabled !== 'true' && smsEnabled !== '1') {
    return { sent: false, skipped: 'sms_globally_disabled' };
  }

  const data = notification.data ?? {};
  const type = typeof data.type === 'string' ? data.type : '';
  const isAttendance = type === 'attendance_marked' || type === 'attendance_not_arrived';
  const isPayment = type === 'class_fee_paid';
  if (!isAttendance && !isPayment) {
    return { sent: false, skipped: 'not_sms_type' };
  }

  const teacherId = typeof data.teacher_user_id === 'string' ? data.teacher_user_id : '';
  if (!teacherId) {
    return { sent: false, skipped: 'no_teacher' };
  }

  // Teacher's own in-app push (e.g. payment received) must not consume SMS credits.
  if (notification.user_id === teacherId) {
    return { sent: false, skipped: 'recipient_is_teacher' };
  }

  const { data: account, error: accountErr } = await admin
    .from('teacher_sms_accounts')
    .select('credit_balance, attendance_sms_enabled, payments_sms_enabled, sms_name')
    .eq('teacher_user_id', teacherId)
    .maybeSingle();

  if (accountErr || !account) {
    return { sent: false, skipped: accountErr?.message ?? 'no_sms_account' };
  }

  if (isAttendance && account.attendance_sms_enabled !== true) {
    return { sent: false, skipped: 'attendance_sms_off' };
  }
  if (isPayment && account.payments_sms_enabled !== true) {
    return { sent: false, skipped: 'payments_sms_off' };
  }
  if (typeof account.credit_balance !== 'number' || account.credit_balance <= 0) {
    return { sent: false, skipped: 'no_credits' };
  }

  const { data: contact } = await admin
    .from('profiles_contact')
    .select('mobile_number')
    .eq('id', notification.user_id)
    .maybeSingle();
  const phone = toSmsLenzContact(
    typeof contact?.mobile_number === 'string' ? contact.mobile_number : null,
  );
  if (!phone) {
    return { sent: false, skipped: 'no_phone' };
  }

  const { data: consumed, error: consumeErr } = await admin.rpc('teacher_sms_consume_credit', {
    p_teacher_user_id: teacherId,
  });
  if (consumeErr || consumed !== true) {
    return { sent: false, skipped: consumeErr?.message ?? 'no_credits' };
  }

  const smsName = typeof account.sms_name === 'string' ? account.sms_name.trim() : '';
  const message = [smsName ? `${smsName}:` : '', notification.title, notification.body]
    .filter(Boolean)
    .join('\n');
  const sent = await sendSmsViaSmsLenz(phone, message);
  if (!sent.ok) {
    await admin.rpc('teacher_sms_refund_credit', { p_teacher_user_id: teacherId });
    return { sent: false, skipped: sent.reason };
  }
  return { sent: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return optionsResponse(req, PUSH_CORS_HEADERS);
  }

  if (req.method !== 'POST') {
    return json(req, { error: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  if (!supabaseUrl || !serviceRole) {
    return json(req, { error: 'server_misconfigured' }, 500);
  }

  if (!isAuthorized(req, serviceRole)) {
    return json(req, { error: 'forbidden' }, 403);
  }

  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return json(req, { error: 'invalid_json' }, 400);
  }

  const notification = parseNotificationRecord(payload);
  if (!notification) {
    return json(req, { error: 'invalid_notification_record' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tokenRows, error: tokenErr } = await admin
    .from('user_device_tokens')
    .select('device_token')
    .eq('user_id', notification.user_id)
    .is('invalidated_at', null);

  if (tokenErr) {
    await admin
      .from('notifications')
      .update({ push_error: tokenErr.message })
      .eq('id', notification.id);
    return json(req, { error: 'token_lookup_failed', detail: tokenErr.message }, 500);
  }

  const tokens = (tokenRows ?? [])
    .map((row) => (typeof row.device_token === 'string' ? row.device_token : null))
    .filter((token): token is string => Boolean(token));

  let sentCount = 0;
  let failedCount = 0;
  let invalidTokens: string[] = [];
  let pushSkipped: string | null = null;

  if (tokens.length === 0) {
    pushSkipped = 'no_active_device_tokens';
    await admin
      .from('notifications')
      .update({ push_error: 'no_active_device_tokens' })
      .eq('id', notification.id);
  } else {
    let results;
    try {
      results = await sendPushToTokens({
        tokens,
        title: notification.title,
        body: notification.body,
        data: {
          notification_id: notification.id,
          ...(notification.data ?? {}),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'fcm_send_failed';
      await admin
        .from('notifications')
        .update({ push_error: message })
        .eq('id', notification.id);
      const sms = await maybeSendTeacherSms(admin, notification);
      return json(req, { error: 'fcm_send_failed', detail: message, sms }, 500);
    }

    invalidTokens = results.filter((r) => r.tokenInvalid).map((r) => r.token);
    if (invalidTokens.length > 0) {
      await admin
        .from('user_device_tokens')
        .delete()
        .in('device_token', invalidTokens);
    }

    sentCount = results.filter((r) => r.success).length;
    failedCount = results.length - sentCount;
    const pushError =
      failedCount > 0
        ? results
            .filter((r) => !r.success)
            .map((r) => `${r.token.slice(0, 8)}…:${r.errorCode ?? r.errorMessage ?? 'failed'}`)
            .join('; ')
        : null;

    await admin
      .from('notifications')
      .update({
        push_sent_at: sentCount > 0 ? new Date().toISOString() : null,
        push_error: pushError,
      })
      .eq('id', notification.id);
  }

  const sms = await maybeSendTeacherSms(admin, notification);

  return json(req, {
    ok: true,
    notification_id: notification.id,
    sent: sentCount,
    failed: failedCount,
    skipped: pushSkipped,
    invalidated_tokens: invalidTokens.length,
    sms,
  });
});
