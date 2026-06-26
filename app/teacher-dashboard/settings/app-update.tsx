import AppUpdateScreen from '@/src/screens/settings/AppUpdateScreen';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';

export default function TeacherAppUpdateSettings() {
  return <AppUpdateScreen fallbackRoute={appHref(AppRoutes.teacherDashboard)} />;
}
