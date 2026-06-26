import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/functions-js';

import { supabase } from '@/src/services/supabaseClient';

export type PayhereWalletInitResult =
  | {
      ok: true;
      orderId: string;
      amountCents: number;
      checkoutUrl: string;
      sandbox: boolean;
    }
  | { ok: false; error: string };

function parseInitPayload(data: unknown): PayhereWalletInitResult | null {
  if (!data || typeof data !== 'object') return null;
  const r = data as Record<string, unknown>;
  if (r.ok !== true) {
    return { ok: false, error: String(r.error ?? 'payhere_init_failed') };
  }
  const checkoutUrl = String(r.checkout_url ?? '').trim();
  const orderId = String(r.order_id ?? '').trim();
  if (!checkoutUrl || !orderId) {
    return { ok: false, error: 'payhere_init_failed' };
  }
  return {
    ok: true,
    orderId,
    amountCents: Number(r.amount_cents) || 0,
    checkoutUrl,
    sandbox: r.sandbox !== false,
  };
}

export async function initPayhereTeacherWalletTopUp(
  amountCents: number,
  options?: { returnUrl?: string; cancelUrl?: string },
): Promise<PayhereWalletInitResult> {
  if (amountCents <= 0) {
    return { ok: false, error: 'invalid_amount' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('payhere-teacher-wallet-init', {
      body: {
        amount_cents: amountCents,
        return_url: options?.returnUrl ?? null,
        cancel_url: options?.cancelUrl ?? null,
      },
    });

    const parsed = parseInitPayload(data);
    if (parsed) return parsed;

    if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
      return { ok: false, error: 'network_error' };
    }

    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        if (body && typeof body === 'object') {
          const p = parseInitPayload(body);
          if (p) return p;
        }
      } catch {
        /* ignore */
      }
      return { ok: false, error: 'payhere_init_failed' };
    }

    return { ok: false, error: error?.message ?? 'payhere_init_failed' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
