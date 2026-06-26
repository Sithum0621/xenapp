import { router } from 'expo-router';
import type { TFunction } from 'i18next';

import { appHref, dashboardRouteForProfileRole, type ProfileRole } from '@/src/navigation/AppNavigator';
import {
  routeForPaymentPlan,
  subscriptionChecksBypassForRole,
  validateSubscriptionAccessForCurrentUser,
} from '@/src/services/subscription';
import { recordLoginSessionSecurity } from '@/src/services/loginSessionSecurityApi';
import { supabase } from '@/src/services/supabaseClient';
import {
  isProfileFetchNetworkError,
  isProfileFetchServerError,
} from '@/src/utils/profileFetchErrors';
import { showLoginSecurityAlert } from '@/src/utils/showLoginSecurityAlert';

export type FinalizeLoginResult = { ok: true } | { ok: false; message: string };

async function notifyLoginSecurity(t: TFunction): Promise<void> {
  const result = await recordLoginSessionSecurity();
  showLoginSecurityAlert(t, result);
}

/**
 * After `signInWithPassword`, Edge login `skip_otp`, or MFA verify `setSession`: load profile
 * and navigate to the correct dashboard. Subscription UX is handled inside dashboard wrappers.
 */
export async function finalizeAuthenticatedLogin(
  t: TFunction,
  setSubmitting: (loading: boolean) => void,
): Promise<FinalizeLoginResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;

  if (!uid) {
    await supabase.auth.signOut();
    setSubmitting(false);
    return { ok: false, message: t('auth.errors.loginFailed') };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', uid)
    .maybeSingle<{ role: ProfileRole }>();

  if (profileError) {
    setSubmitting(false);
    if (isProfileFetchServerError(profileError)) {
      return { ok: false, message: t('auth.errors.profileServerError') };
    }
    if (isProfileFetchNetworkError(profileError)) {
      return { ok: false, message: t('auth.errors.profileNetworkError') };
    }
    await supabase.auth.signOut();
    return { ok: false, message: t('auth.errors.profileLoadFailed') };
  }

  if (!profile?.role) {
    await supabase.auth.signOut();
    setSubmitting(false);
    return { ok: false, message: t('auth.errors.profileMissing') };
  }

  if (subscriptionChecksBypassForRole(profile.role)) {
    await notifyLoginSecurity(t);
    setSubmitting(false);
    router.replace(appHref(dashboardRouteForProfileRole(profile.role)));
    return { ok: true };
  }

  const { data: accessData } = await validateSubscriptionAccessForCurrentUser(uid);
  if (accessData?.reason === 'expired') {
    await notifyLoginSecurity(t);
    router.replace(routeForPaymentPlan(profile.role));
    setSubmitting(false);
    return { ok: true };
  }

  await notifyLoginSecurity(t);
  setSubmitting(false);
  router.replace(appHref(dashboardRouteForProfileRole(profile.role)));
  return { ok: true };
}
