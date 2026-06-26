/**
 * Start PayHere checkout for teacher wallet top-up.
 * Deploy: supabase functions deploy payhere-teacher-wallet-init
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function supabaseUrl(): string {
  return Deno.env.get('SUPABASE_URL') ?? '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ok: false, error: 'not_authenticated' }, 401);
  }

  const supabase = createClient(
    supabaseUrl(),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const jwt = authHeader.replace('Bearer ', '');
  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !userData.user?.id) {
    return json({ ok: false, error: 'not_authenticated' }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const amountCents = Number(body.amount_cents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return json({ ok: false, error: 'invalid_amount' }, 400);
  }

  const returnUrl = typeof body.return_url === 'string' ? body.return_url.trim() : '';
  const cancelUrl = typeof body.cancel_url === 'string' ? body.cancel_url.trim() : '';

  function allowedReturn(u: string): boolean {
    if (!u) return false;
    if (u.startsWith('xen://')) return u.includes('teacher-dashboard/wallet');
    try {
      const parsed = new URL(u);
      return (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        parsed.pathname.includes('/teacher-dashboard/wallet')
      );
    } catch {
      return false;
    }
  }

  if (!allowedReturn(returnUrl) || !allowedReturn(cancelUrl)) {
    return json({ ok: false, error: 'invalid_return_urls' }, 400);
  }

  const merchantId = Deno.env.get('PAYHERE_MERCHANT_ID')?.trim();
  const merchantSecret = Deno.env.get('PAYHERE_MERCHANT_SECRET')?.trim();
  if (!merchantId || !merchantSecret) {
    return json({ ok: false, error: 'payhere_not_configured' }, 503);
  }

  const { data: orderData, error: orderError } = await supabase.rpc(
    'teacher_wallet_create_payhere_order',
    {
      p_teacher_user_id: userData.user.id,
      p_amount_cents: Math.round(amountCents),
    },
  );

  if (orderError || !orderData || typeof orderData !== 'object') {
    return json({ ok: false, error: orderError?.message ?? 'order_create_failed' }, 500);
  }

  const order = orderData as Record<string, unknown>;
  const checkoutToken = String(order.checkout_token ?? '');
  if (!checkoutToken) {
    return json({ ok: false, error: 'order_create_failed' }, 500);
  }

  const base = supabaseUrl().replace(/\/$/, '');
  const checkoutUrl =
    `${base}/functions/v1/payhere-teacher-wallet-checkout?t=${checkoutToken}` +
    `&return=${encodeURIComponent(returnUrl)}&cancel=${encodeURIComponent(cancelUrl)}`;

  return json({
    ok: true,
    order_id: order.order_id,
    amount_cents: order.amount_cents,
    checkout_url: checkoutUrl,
    sandbox: (Deno.env.get('PAYHERE_SANDBOX') ?? 'true').toLowerCase() !== 'false',
  });
});
