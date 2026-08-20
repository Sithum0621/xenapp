/** Shared helpers for staff credential emails (edge functions). */

export const STAFF_TEMP_PASSWORD_HOURS = 3;

export function staffTempPasswordExpiresIso(): string {
  return new Date(Date.now() + STAFF_TEMP_PASSWORD_HOURS * 60 * 60 * 1000).toISOString();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Non-expiring institute admin / staff welcome email (no temporary-password expiry). */
export function buildStaffCredentialsEmailHtml(options: {
  fullName: string;
  email: string;
  password: string;
  roleLabel: string;
}): string {
  const safeName = escapeHtml(options.fullName || 'there');
  const safeEmail = escapeHtml(options.email);
  const safePassword = escapeHtml(options.password);
  const safeRole = escapeHtml(options.roleLabel);

  return `
    <div style="font-family:sans-serif;color:#0F172A;max-width:520px;line-height:1.5;">
      <p style="font-size:16px;font-weight:700;color:#123B7A;">MyTuition</p>
      <p>Hello ${safeName},</p>
      <p>Your ${safeRole} account has been created. Use the credentials below to sign in:</p>
      <table style="margin:16px 0;border-collapse:collapse;width:100%;">
        <tr>
          <td style="padding:8px 12px;background:#F8FAFC;border:1px solid #E2E8F0;font-weight:600;">Email</td>
          <td style="padding:8px 12px;border:1px solid #E2E8F0;">${safeEmail}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;background:#F8FAFC;border:1px solid #E2E8F0;font-weight:600;">Password</td>
          <td style="padding:8px 12px;border:1px solid #E2E8F0;font-family:monospace;">${safePassword}</td>
        </tr>
      </table>
      <p>After you sign in, you can change your password anytime from Settings.</p>
      <p style="font-size:13px;color:#64748B;">If you did not expect this email, you can ignore it.</p>
    </div>`;
}

/** @deprecated Use buildStaffCredentialsEmailHtml — staff no longer receive expiring temp passwords. */
export function buildStaffTempPasswordEmailHtml(options: {
  fullName: string;
  email: string;
  password: string;
  roleLabel: string;
  expiryHours?: number;
}): string {
  return buildStaffCredentialsEmailHtml(options);
}

export async function waitForProfileRow(
  admin: { from: (table: string) => unknown },
  userId: string,
  attempts = 12,
  delayMs = 250,
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    const { data } = await (admin.from('profiles') as {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: { id?: string } | null }>;
        };
      };
    })
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    if (data?.id) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/** Clears any temp-password expiry flag (staff accounts are non-expiring). */
export async function clearStaffTempPasswordExpiry(
  admin: { from: (table: string) => unknown },
  userId: string,
): Promise<{ ok: boolean; detail?: string }> {
  const { error } = await (admin.from('profiles') as {
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
  })
    .update({ temp_password_expires_at: null })
    .eq('id', userId);
  if (error) return { ok: false, detail: error.message };
  return { ok: true };
}

/** @deprecated Staff no longer use expiring temp passwords — use clearStaffTempPasswordExpiry. */
export async function provisionStaffTempPassword(
  admin: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }> },
  userId: string,
  _hours = STAFF_TEMP_PASSWORD_HOURS,
): Promise<{ ok: boolean; detail?: string }> {
  const { error } = await admin.rpc('provision_staff_temp_password', {
    p_user_id: userId,
    p_hours: 0,
  });
  if (error) return { ok: false, detail: error.message };
  return { ok: true };
}
