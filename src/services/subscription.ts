import { AppRoutes, PROFILE_ROLE_SUPERADMIN, type ProfileRole } from '@/src/navigation/AppNavigator';
import { supabase } from '@/src/services/supabaseClient';

/** Roles with non-expiring platform access (only parent_student packages expire). */
export const UNLIMITED_SUBSCRIPTION_ROLES: readonly ProfileRole[] = [
  PROFILE_ROLE_SUPERADMIN,
  'admin',
  'teacher',
];

/** Roles that skip subscription/device gates (no package expiry). */
export function subscriptionChecksBypassForRole(role: string | undefined | null): boolean {
  return (
    role === PROFILE_ROLE_SUPERADMIN ||
    role === 'admin' ||
    role === 'teacher'
  );
}

/** Roles that show the subscription time-remaining bar (parent/student packages only). */
export function subscriptionCountdownVisibleForRole(role: string | undefined | null): boolean {
  return role === 'parent_student';
}

export type SubscriptionAccessResult = {
  can_access: boolean;
  reason: 'ok' | 'expired' | 'not_found' | 'device_mismatch';
  expiry_date: string | null;
  is_active: boolean;
};

export async function validateSubscriptionAccessForCurrentUser(userId: string) {
  const { data, error } = await supabase.rpc('validate_subscription_access', {
    p_user_id: userId,
    p_device_id: 'unused',
  });

  const raw = data as unknown;
  let row: Partial<SubscriptionAccessResult> | null = null;
  if (Array.isArray(raw)) {
    row = (raw[0] as Partial<SubscriptionAccessResult> | undefined) ?? null;
  } else if (raw && typeof raw === 'object') {
    row = raw as Partial<SubscriptionAccessResult>;
  }

  return {
    data: row
      ? {
          can_access: row.can_access === true,
          reason: (row.reason as SubscriptionAccessResult['reason'] | undefined) ?? 'not_found',
          expiry_date: typeof row.expiry_date === 'string' ? row.expiry_date : null,
          is_active: row.is_active === true,
        }
      : null,
    error,
  };
}

export function routeForPaymentPlan(role: string) {
  return { pathname: AppRoutes.paymentPlan as '/payment-plan', params: { role } };
}
