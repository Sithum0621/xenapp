import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import DashboardScreenShell from '@/src/components/layout/DashboardScreenShell';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import AppLockSettingsScreen from '@/src/screens/settings/AppLockSettingsScreen';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

export default function ParentAppLockSettings() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <DashboardScreenShell
      showBack
      title={t('appLock.screenTitle')}
      onBack={() => routerBackOrReplace(router, appHref(AppRoutes.parentDashboard))}
      padContent={false}>
      <AppLockSettingsScreen />
    </DashboardScreenShell>
  );
}
