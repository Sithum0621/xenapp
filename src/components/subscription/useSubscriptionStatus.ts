import { useEffect, useState } from 'react';

import {
  isFreeTier,
  isPaidLike,
  planTierFromReason,
  subscriptionChecksBypassForRole,
  subscriptionCountdownVisibleForRole,
  validateSubscriptionAccessForCurrentUser,
  type SubscriptionPlanReason,
  type SubscriptionPlanTier,
} from '@/src/services/subscription';
import { supabase } from '@/src/services/supabaseClient';

export type SubscriptionStatus = {
  loading: boolean;
  /** True for roles without package expiry (teacher, admin, superadmin). */
  bypass: boolean;
  /** True when the time-remaining bar should be shown (paid/trial parent only). */
  showCountdown: boolean;
  expiryDateIso: string | null;
  /** True when the user may use the app (free, paid, trial, or staff). */
  isActive: boolean;
  reason: SubscriptionPlanReason | null;
  tier: SubscriptionPlanTier;
  /** True when on Free (soft upsell / no countdown). */
  isFree: boolean;
};

/**
 * Headless subscription status for dashboards and package UI.
 */
export function useSubscriptionStatus(): SubscriptionStatus {
  const [state, setState] = useState<SubscriptionStatus>({
    loading: true,
    bypass: false,
    showCountdown: false,
    expiryDateIso: null,
    isActive: true,
    reason: null,
    tier: 'free',
    isFree: true,
  });

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        if (mounted) setState((s) => ({ ...s, loading: false }));
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .maybeSingle();
      if (!mounted) return;

      const role = profile?.role ?? null;

      if (subscriptionChecksBypassForRole(role)) {
        setState({
          loading: false,
          bypass: true,
          showCountdown: false,
          expiryDateIso: null,
          isActive: true,
          reason: 'ok',
          tier: 'unlimited',
          isFree: false,
        });
        return;
      }

      const { data } = await validateSubscriptionAccessForCurrentUser(userData.user.id);
      if (!mounted) return;

      const reason = data?.reason ?? 'free';
      const paidLike = isPaidLike(reason);
      const free = isFreeTier(reason);
      const canShowCountdown =
        subscriptionCountdownVisibleForRole(role) &&
        paidLike &&
        Boolean(data?.expiry_date) &&
        data.expiry_date !== 'infinity';

      setState({
        loading: false,
        bypass: false,
        showCountdown: canShowCountdown,
        expiryDateIso: paidLike ? (data?.expiry_date ?? null) : null,
        isActive: Boolean(data?.can_access ?? true),
        reason,
        tier: planTierFromReason(reason, false),
        isFree: free,
      });
    };

    void run();
    return () => {
      mounted = false;
    };
  }, []);

  return state;
}
