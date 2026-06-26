import AppUpdateScreen from '@/src/screens/settings/AppUpdateScreen';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';

export default function ParentAppUpdateSettings() {
  return <AppUpdateScreen fallbackRoute={appHref(AppRoutes.parentDashboard)} />;
}
