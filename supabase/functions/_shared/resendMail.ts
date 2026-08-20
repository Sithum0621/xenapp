/**
 * Server-side email via Resend. API key is read only from `Deno.env` (Supabase secrets
 * or `supabase functions serve --env-file <path>`). Never import this from the Expo app.
 */
import { Resend } from 'npm:resend@4.1.2';

export type SendHtmlEmailResult =
  | { ok: true }
  | { ok: false; skippedReason: string };

/**
 * Resend only delivers from `onboarding@resend.dev` to the Resend account email.
 * Production sender; override with secret `RESEND_FROM_EMAIL` if needed.
 */
const DEFAULT_RESEND_FROM = 'MyTuition <noreply@wovello.com>';

/** Resend API key from environment only (e.g. RESEND_API_KEY secret). */
export function getResendApiKeyFromEnv(): string | undefined {
  const k = Deno.env.get('RESEND_API_KEY')?.trim();
  return k || undefined;
}

export function getResendFromAddress(): string {
  return Deno.env.get('RESEND_FROM_EMAIL')?.trim() || DEFAULT_RESEND_FROM;
}

function classifyResendFailure(message: string, statusCode: number | undefined, from: string): string {
  const msg = message.toLowerCase();
  if (
    msg.includes('domain is not verified') ||
    (msg.includes('not verified') && msg.includes('domain'))
  ) {
    return 'resend_unverified_domain';
  }
  if (
    statusCode === 403 &&
    (msg.includes('testing domain') || msg.includes('resend.dev') || msg.includes('only send to'))
  ) {
    return 'resend_testing_domain';
  }
  if (statusCode === 403 && /\bresend\.dev\b|onboarding@resend/i.test(from)) {
    return 'resend_testing_domain';
  }
  return 'resend_http_error';
}

/**
 * Send a single HTML email via the official Resend SDK.
 * Caller must handle missing API key (e.g. dev console OTP) before invoking if needed.
 */
export async function sendHtmlEmailViaResend(options: {
  to: string;
  /** Defaults to RESEND_FROM_EMAIL env or product default. */
  from?: string;
  subject: string;
  html: string;
}): Promise<SendHtmlEmailResult> {
  const apiKey = getResendApiKeyFromEnv();
  if (!apiKey) {
    return { ok: false, skippedReason: 'missing_resend' };
  }

  const from = options.from ?? getResendFromAddress();
  const resend = new Resend(apiKey);

  console.info('[_shared/resendMail] send', { to: options.to, from });

  const { error } = await resend.emails.send({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });

  if (error) {
    const statusCode =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? (error as { statusCode?: number }).statusCode
        : undefined;
    const message = typeof error.message === 'string' ? error.message : String(error);
    console.error('[_shared/resendMail] Resend error', statusCode, message);
    const skippedReason = classifyResendFailure(message, statusCode, from);
    return { ok: false, skippedReason };
  }

  return { ok: true };
}

/** Operational / system notifications (same transport and env as other transactional mail). */
export function sendSystemNotificationEmail(
  to: string,
  subject: string,
  html: string,
): Promise<SendHtmlEmailResult> {
  return sendHtmlEmailViaResend({ to, subject, html });
}
