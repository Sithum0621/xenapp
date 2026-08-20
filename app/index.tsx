import { usePathname, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';

import { BrandLoadingScreen } from '@/src/components/BrandLoader';
import i18n from '@/src/locales/i18n';
import { AppRoutes, appHref, dashboardRouteForProfileRole } from '@/src/navigation/AppNavigator';
import { resolveInitialAppNavigation } from '@/src/navigation/appEntry';
import { normalizeAppPathname } from '@/src/navigation/publicRoutes';
import { getStoredLanguagePreference } from '@/src/services/languagePreference';

function currentBrowserPath(pathname: string | null): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.pathname || pathname || '/';
  }
  return pathname || '/';
}

export default function Index() {
  const router = useRouter();
  const pathname = usePathname();
  const isColdStartEntry = useMemo(
    () => normalizeAppPathname(currentBrowserPath(pathname)) === '/',
    [pathname],
  );

  useEffect(() => {
    if (!isColdStartEntry) return;

    let cancelled = false;

    void (async () => {
      /**
       * Root `unstable_settings.anchor = 'index'` still mounts this screen when deep-linking
       * (e.g. `/policies`). Never steal navigation away from that URL.
       */
      if (normalizeAppPathname(currentBrowserPath(pathname)) !== '/') {
        return;
      }

      const nav = await resolveInitialAppNavigation();
      if (cancelled) return;

      const lang = await getStoredLanguagePreference();
      if (lang) await i18n.changeLanguage(lang);

      if (cancelled) return;

      // Re-check after async work — URL may still be a public deep link.
      if (normalizeAppPathname(currentBrowserPath(pathname)) !== '/') {
        return;
      }

      switch (nav.destination) {
        case 'dashboard':
          router.replace(appHref(dashboardRouteForProfileRole(nav.profileRole)));
          break;
        case 'login':
          if (nav.profileIssue) {
            router.replace({
              pathname: AppRoutes.login,
              params: { profileIssue: nav.profileIssue },
            });
          } else {
            router.replace(AppRoutes.login);
          }
          break;
        case 'onboarding':
        default:
          router.replace(
            Platform.OS === 'web' ? appHref(AppRoutes.welcome) : AppRoutes.roleSelect,
          );
          break;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, pathname, isColdStartEntry]);

  // Anchor-only mount behind a deep link — do not cover the real screen with the loader.
  if (!isColdStartEntry) {
    return null;
  }

  return <BrandLoadingScreen accessibilityLabel="Loading" />;
}
