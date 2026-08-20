import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import DashboardScreenShell from '@/src/components/layout/DashboardScreenShell';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import SettingsLanguageScreen from '@/src/screens/settings/SettingsLanguageScreen';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

export default function ParentLanguageSettings() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <DashboardScreenShell
      showBack
      title={t('parentDashboard.settingsLanguage')}
      onBack={() => routerBackOrReplace(router, appHref(AppRoutes.parentDashboard))}
      padContent={false}>
      <SettingsLanguageScreen />
    </DashboardScreenShell>
  );
}
