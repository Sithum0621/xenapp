import { useEffect, useState } from 'react';

import {
  subscriptionChecksBypassForRole,
  subscriptionCountdownVisibleForRole,
  validateSubscriptionAccessForCurrentUser,
} from '@/src/services/subscription';
import { supabase } from '@/src/services/supabaseClient';

export type SubscriptionStatus = {
  loading: boolean;
  /** True for roles without package expiry (teacher, admin, superadmin). */
  bypass: boolean;
  /** True when the time-remaining bar should be shown (parent_student only). */
  showCountdown: boolean;
  expiryDateIso: string | null;
  isActive: boolean;
};

/**
 * Headless version of the work currently done inside `DashboardSubscriptionWrapper`.
 * Returns the same shape so screens that need to render their own countdown UI
 * (e.g. the parent dashboard's floating bar) can do so without duplicating the
 * fetch logic.
 */
export function useSubscriptionStatus(): SubscriptionStatus {
  const [state, setState] = useState<SubscriptionStatus>({
    loading: true,
    bypass: false,
    showCountdown: false,
    expiryDateIso: null,
    isActive: false,
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
      const showCountdown = subscriptionCountdownVisibleForRole(role);

      if (subscriptionChecksBypassForRole(role)) {
        setState({
          loading: false,
          bypass: true,
          showCountdown: false,
          expiryDateIso: null,
          isActive: true,
        });
        return;
      }

      const { data } = await validateSubscriptionAccessForCurrentUser(userData.user.id);
      if (!mounted) return;
      setState({
        loading: false,
        bypass: false,
        showCountdown,
        expiryDateIso: data?.expiry_date ?? null,
        isActive: Boolean(data?.can_access),
      });
    };

    void run();
    return () => {
      mounted = false;
    };
  }, []);

  return state;
}
