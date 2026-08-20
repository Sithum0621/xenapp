import AppUpdateScreen from '@/src/screens/settings/AppUpdateScreen';

export default function AdminAppUpdateSettings() {
  return (
    <AppUpdateScreen embedded fallbackRoute="/admin-dashboard/settings/profile" />
  );
}
