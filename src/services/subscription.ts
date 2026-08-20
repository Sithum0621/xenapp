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

export type SubscriptionPlanReason = 'ok' | 'free' | 'trial' | 'paid' | 'expired' | 'not_found' | 'device_mismatch';

export type SubscriptionAccessResult = {
  can_access: boolean;
  reason: SubscriptionPlanReason;
  expiry_date: string | null;
  is_active: boolean;
};

export type SubscriptionPlanTier = 'free' | 'trial' | 'paid' | 'unlimited';

export function isFreeTier(reason: string | undefined | null): boolean {
  return reason === 'free' || reason === 'not_found' || reason === 'expired';
}

/** Paid or trial with a real countdown (not free / not staff ok). */
export function isPaidLike(reason: string | undefined | null): boolean {
  return reason === 'paid' || reason === 'trial';
}

export function planTierFromReason(
  reason: string | undefined | null,
  bypass: boolean,
): SubscriptionPlanTier {
  if (bypass || reason === 'ok') return 'unlimited';
  if (reason === 'paid') return 'paid';
  if (reason === 'trial') return 'trial';
  return 'free';
}

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

  const reason = (row?.reason as SubscriptionPlanReason | undefined) ?? 'free';

  return {
    data: row
      ? {
          // Parents always retain access (free fallback); never treat as blocked.
          can_access: row.can_access === true || isFreeTier(reason) || isPaidLike(reason),
          reason,
          expiry_date: typeof row.expiry_date === 'string' ? row.expiry_date : null,
          is_active: row.is_active === true || isFreeTier(reason) || isPaidLike(reason),
        }
      : ({
          can_access: true,
          reason: 'free',
          expiry_date: null,
          is_active: true,
        } satisfies SubscriptionAccessResult),
    error,
  };
}

export function routeForPaymentPlan(role: string) {
  return { pathname: AppRoutes.paymentPlan as '/payment-plan', params: { role } };
}
