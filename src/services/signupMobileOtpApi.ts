import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/functions-js';

import { supabase } from '@/src/services/supabaseClient';

type OtpJson = Record<string, unknown>;

async function invokeOtp(body: Record<string, unknown>): Promise<{ ok: boolean; json: OtpJson }> {
  const { data, error } = await supabase.functions.invoke('signup-mobile-otp', { body });

  if (!error && data !== null && typeof data === 'object' && !Array.isArray(data)) {
    const payload = data as OtpJson;
    return { ok: payload.ok === true, json: payload };
  }

  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    return { ok: false, json: { error: 'network_error' } };
  }

  if (error instanceof FunctionsHttpError) {
    try {
      const parsed = (await error.context.json()) as OtpJson;
      if (parsed && typeof parsed === 'object') return { ok: false, json: parsed };
    } catch {
      /* ignore */
    }
    return { ok: false, json: { error: 'edge_http_error' } };
  }

  return { ok: false, json: { error: 'invoke_failed' } };
}

export async function signupMobileOtpSend(input: {
  mobileNumber: string;
  email?: string;
}): Promise<{
  ok: boolean;
  otpChallenge?: string;
  delivery?: string;
  error?: string;
}> {
  const { ok, json } = await invokeOtp({
    action: 'send',
    mobile_number: input.mobileNumber,
    email: input.email,
  });
  return {
    ok,
    otpChallenge: typeof json.otp_challenge === 'string' ? json.otp_challenge : undefined,
    delivery: typeof json.delivery === 'string' ? json.delivery : undefined,
    error: typeof json.error === 'string' ? json.error : undefined,
  };
}

export async function signupMobileOtpVerify(input: {
  otpChallenge: string;
  code: string;
}): Promise<{ ok: boolean; verifiedToken?: string; error?: string }> {
  const { ok, json } = await invokeOtp({
    action: 'verify',
    otp_challenge: input.otpChallenge,
    code: input.code,
  });
  return {
    ok,
    verifiedToken: typeof json.verified_token === 'string' ? json.verified_token : undefined,
    error: typeof json.error === 'string' ? json.error : undefined,
  };
}
