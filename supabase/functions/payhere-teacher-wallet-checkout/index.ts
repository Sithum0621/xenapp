/**
 * PayHere hosted checkout page (auto-submit HTML form).
 * Deploy: supabase functions deploy payhere-teacher-wallet-checkout --no-verify-jwt
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import {
  formatPayhereAmount,
  payhereCheckoutHash,
} from '../_shared/payhereHash.ts';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function supabaseUrl(): string {
  return Deno.env.get('SUPABASE_URL') ?? '';
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('t')?.trim();
  const returnUrlParam = url.searchParams.get('return')?.trim() ?? '';
  const cancelUrlParam = url.searchParams.get('cancel')?.trim() ?? '';
  if (!token) {
    return new Response('Missing checkout token', { status: 400 });
  }

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

  if (!allowedReturn(returnUrlParam) || !allowedReturn(cancelUrlParam)) {
    return new Response('Invalid return URLs', { status: 400 });
  }

  const merchantId = Deno.env.get('PAYHERE_MERCHANT_ID')?.trim();
  const merchantSecret = Deno.env.get('PAYHERE_MERCHANT_SECRET')?.trim();
  if (!merchantId || !merchantSecret) {
    return new Response('PayHere not configured', { status: 503 });
  }

  const sandbox = (Deno.env.get('PAYHERE_SANDBOX') ?? 'true').toLowerCase() !== 'false';
  const checkoutAction = sandbox
    ? 'https://sandbox.payhere.lk/pay/checkout'
    : 'https://www.payhere.lk/pay/checkout';

  const supabase = createClient(
    supabaseUrl(),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await supabase.rpc('teacher_wallet_payhere_checkout_by_token', {
    p_token: token,
  });

  if (error || !data || typeof data !== 'object') {
    return new Response('Checkout session expired or invalid', { status: 404 });
  }

  const session = data as Record<string, unknown>;
  const orderId = String(session.order_id ?? '');
  const amountCents = Number(session.amount_cents);
  const amount = formatPayhereAmount(amountCents);
  const currency = 'LKR';
  const hash = payhereCheckoutHash(merchantId, orderId, amount, currency, merchantSecret);

  const base = supabaseUrl().replace(/\/$/, '');
  const notifyUrl = `${base}/functions/v1/payhere-teacher-wallet-notify`;
  const returnUrl = returnUrlParam;
  const cancelUrl = cancelUrlParam;

  const fields: Record<string, string> = {
    merchant_id: merchantId,
    return_url: returnUrl,
    cancel_url: cancelUrl,
    notify_url: notifyUrl,
    order_id: orderId,
    items: 'MyTuition Teacher Wallet Top-up',
    currency,
    amount,
    hash,
    first_name: String(session.first_name ?? 'Teacher'),
    last_name: String(session.last_name ?? ''),
    email: String(session.email ?? 'teacher@xen.lk'),
    phone: String(session.phone ?? '0770000000'),
    address: String(session.address ?? 'Colombo'),
    city: 'Colombo',
    country: 'Sri Lanka',
  };

  const inputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}" />`)
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PayHere Checkout</title>
  <style>
    body { font-family: system-ui, sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; background:#f8fafc; color:#0e2f63; }
    .box { text-align:center; padding:24px; }
  </style>
</head>
<body>
  <div class="box">
    <p>Redirecting to PayHere…</p>
    <form id="payhere" method="post" action="${escapeHtml(checkoutAction)}">
      ${inputs}
    </form>
  </div>
  <script>document.getElementById('payhere').submit();</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});
