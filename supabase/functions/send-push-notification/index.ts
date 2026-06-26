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

import { isInvalidFcmTokenError, sendPushToTokens } from '../_shared/fcmAdmin.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-push-webhook-secret',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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
  const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET')?.trim();
  const headerSecret = req.headers.get('x-push-webhook-secret')?.trim();

  if (webhookSecret && headerSecret && headerSecret === webhookSecret) {
    return true;
  }

  const authHeader = req.headers.get('Authorization')?.trim();
  if (authHeader === `Bearer ${serviceRole}`) {
    return true;
  }

  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  if (!supabaseUrl || !serviceRole) {
    return json({ error: 'server_misconfigured' }, 500);
  }

  if (!isAuthorized(req, serviceRole)) {
    return json({ error: 'forbidden' }, 403);
  }

  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const notification = parseNotificationRecord(payload);
  if (!notification) {
    return json({ error: 'invalid_notification_record' }, 400);
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
    return json({ error: 'token_lookup_failed', detail: tokenErr.message }, 500);
  }

  const tokens = (tokenRows ?? [])
    .map((row) => (typeof row.device_token === 'string' ? row.device_token : null))
    .filter((token): token is string => Boolean(token));

  if (tokens.length === 0) {
    await admin
      .from('notifications')
      .update({ push_error: 'no_active_device_tokens' })
      .eq('id', notification.id);
    return json({ ok: true, sent: 0, skipped: 'no_active_device_tokens' });
  }

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
    return json({ error: 'fcm_send_failed', detail: message }, 500);
  }

  const invalidTokens = results.filter((r) => r.tokenInvalid).map((r) => r.token);
  if (invalidTokens.length > 0) {
    await admin
      .from('user_device_tokens')
      .delete()
      .in('device_token', invalidTokens);
  }

  const sentCount = results.filter((r) => r.success).length;
  const failedCount = results.length - sentCount;
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

  return json({
    ok: true,
    notification_id: notification.id,
    sent: sentCount,
    failed: failedCount,
    invalidated_tokens: invalidTokens.length,
    results: results.map((r) => ({
      token_prefix: r.token.slice(0, 8),
      success: r.success,
      error_code: r.errorCode,
      token_invalid: r.tokenInvalid || isInvalidFcmTokenError(r.errorCode),
    })),
  });
});
