import { useEffect, useState } from 'react';

import AppUpdateScreen from '@/src/screens/settings/AppUpdateScreen';
import {
  AppRoutes,
  appHref,
  dashboardRouteForProfileRole,
  type AppRoutePath,
  type ProfileRole,
} from '@/src/navigation/AppNavigator';
import { supabase } from '@/src/services/supabaseClient';

export default function UniversalAppUpdateScreen() {
  const [fallbackRoute, setFallbackRoute] = useState<AppRoutePath>(
    appHref(AppRoutes.parentDashboard) as AppRoutePath,
  );

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', uid)
        .maybeSingle();

      const role = profile?.role as ProfileRole | undefined;
      if (role) {
        setFallbackRoute(dashboardRouteForProfileRole(role));
      }
    })();
  }, []);

  return <AppUpdateScreen fallbackRoute={fallbackRoute} />;
}
