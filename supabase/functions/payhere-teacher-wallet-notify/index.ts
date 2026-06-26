/**
 * PayHere payment notification webhook (server-to-server).
 * Deploy: supabase functions deploy payhere-teacher-wallet-notify --no-verify-jwt
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { payhereNotifyHash } from '../_shared/payhereHash.ts';

function supabaseUrl(): string {
  return Deno.env.get('SUPABASE_URL') ?? '';
}

async function parseBody(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const json = await req.json();
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
      out[k] = String(v ?? '');
    }
    return out;
  }

  const text = await req.text();
  const params = new URLSearchParams(text);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) {
    out[k] = v;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const merchantSecret = Deno.env.get('PAYHERE_MERCHANT_SECRET')?.trim();
  const merchantIdEnv = Deno.env.get('PAYHERE_MERCHANT_ID')?.trim();
  if (!merchantSecret || !merchantIdEnv) {
    return new Response('PayHere not configured', { status: 503 });
  }

  let fields: Record<string, string>;
  try {
    fields = await parseBody(req);
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const merchantId = fields.merchant_id ?? '';
  const orderId = fields.order_id ?? '';
  const paymentId = fields.payment_id ?? '';
  const amount = fields.payhere_amount ?? fields.amount ?? '';
  const currency = fields.payhere_currency ?? fields.currency ?? 'LKR';
  const statusCode = fields.status_code ?? '';
  const md5sig = (fields.md5sig ?? '').toUpperCase();

  const expected = payhereNotifyHash(
    merchantId,
    orderId,
    amount,
    currency,
    statusCode,
    merchantSecret,
  );

  if (!md5sig || md5sig !== expected) {
    return new Response('Invalid signature', { status: 400 });
  }

  // 2 = success per PayHere docs
  if (statusCode !== '2') {
    return new Response('Ignored status', { status: 200 });
  }

  const amountCents = Math.round(Number.parseFloat(amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return new Response('Invalid amount', { status: 400 });
  }

  const supabase = createClient(
    supabaseUrl(),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { error } = await supabase.rpc('teacher_wallet_complete_payhere_order', {
    p_order_id: orderId,
    p_payment_id: paymentId,
    p_amount_cents: amountCents,
  });

  if (error) {
    console.error('complete payhere order failed', error.message);
    return new Response('Processing failed', { status: 500 });
  }

  return new Response('OK', { status: 200 });
});
