import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import i18n from '@/src/locales/i18n';
import { AppRoutes, appHref, dashboardRouteForProfileRole } from '@/src/navigation/AppNavigator';
import { resolveInitialAppNavigation } from '@/src/navigation/appEntry';
import { getStoredLanguagePreference } from '@/src/services/languagePreference';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const nav = await resolveInitialAppNavigation();
      if (cancelled) return;

      const lang = await getStoredLanguagePreference();
      if (lang) await i18n.changeLanguage(lang);

      if (cancelled) return;

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
          router.replace(AppRoutes.roleSelect);
          break;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <View style={styles.boot}>
      <ActivityIndicator size="large" color="#123B7A" accessibilityLabel="Loading" />
    </View>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});
