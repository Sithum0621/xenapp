import { Slot } from 'expo-router';

import AdminDashboardShell from '@/src/components/admin/AdminDashboardShell';

export default function AdminDashboardLayout() {
  return (
    <AdminDashboardShell>
      <Slot />
    </AdminDashboardShell>
  );
}
