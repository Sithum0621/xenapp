import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import DashboardScreenShell from '@/src/components/layout/DashboardScreenShell';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import { Text } from '@/src/theme/Text';
import { PAGE_EDGE_INSET } from '@/src/theme/pageLayout';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

const BRAND_BLUE_DARK = '#00101F';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';

export default function TeacherSecuritySettings() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <DashboardScreenShell
      showBack
      title={t('teacherDashboard.settingsSecurity', { defaultValue: 'Security & Preferences' })}
      onBack={() => routerBackOrReplace(router, appHref(AppRoutes.teacherDashboard))}>
      <View style={styles.card}>
        <Text style={styles.subtitle}>Choose a security option.</Text>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/teacher-dashboard/settings/app-lock')}
          style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
          <View style={styles.menuItemIcon}>
            <Ionicons name="lock-closed-outline" size={18} color={BRAND_BLUE_DARK} />
          </View>
          <View style={styles.menuItemTextWrap}>
            <Text style={styles.menuItemTitle}>App Lock Settings</Text>
            <Text style={styles.menuItemSub}>Manage PIN and lock behavior</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/teacher-dashboard/settings/password')}
          style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
          <View style={styles.menuItemIcon}>
            <Ionicons name="key-outline" size={18} color={BRAND_BLUE_DARK} />
          </View>
          <View style={styles.menuItemTextWrap}>
            <Text style={styles.menuItemTitle}>Password Management</Text>
            <Text style={styles.menuItemSub}>Change account password</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
        </Pressable>
      </View>
    </DashboardScreenShell>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: PAGE_EDGE_INSET,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_MUTED,
    lineHeight: 20,
  },
  menuItem: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  menuItemPressed: {
    backgroundColor: '#F8FAFC',
  },
  menuItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemTextWrap: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
  },
  menuItemSub: {
    marginTop: 2,
    fontSize: 12,
    color: TEXT_MUTED,
  },
});
