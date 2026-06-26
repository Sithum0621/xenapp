import type { ProfileRole } from '@/src/navigation/AppNavigator';
import { supabase } from '@/src/services/supabaseClient';
import {
  isProfileFetchNetworkError,
  isProfileFetchServerError,
} from '@/src/utils/profileFetchErrors';

export type ProfileBootstrapIssue = 'server' | 'network' | 'unknown';

export type InitialAppNavigation =
  | { destination: 'dashboard'; profileRole: ProfileRole }
  | { destination: 'login'; profileIssue?: ProfileBootstrapIssue }
  | { destination: 'onboarding' };

/**
 * Cold-start routing: existing session → dashboard; else onboarding (role selection first).
 */
export async function resolveInitialAppNavigation(): Promise<InitialAppNavigation> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .maybeSingle<{ role: ProfileRole }>();

    if (profileError) {
      if (isProfileFetchServerError(profileError)) {
        return { destination: 'login', profileIssue: 'server' };
      }
      if (isProfileFetchNetworkError(profileError)) {
        return { destination: 'login', profileIssue: 'network' };
      }
      return { destination: 'login', profileIssue: 'unknown' };
    }

    if (profile?.role) {
      return { destination: 'dashboard', profileRole: profile.role };
    }

    return { destination: 'login' };
  }

  return { destination: 'onboarding' };
}
