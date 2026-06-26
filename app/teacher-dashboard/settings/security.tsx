import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text } from '@/src/theme/Text';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

const BRAND_BLUE_DARK = '#0E2F63';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';

export default function TeacherSecuritySettings() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => routerBackOrReplace(router, appHref(AppRoutes.teacherDashboard))}
          style={({ pressed }) => [styles.backRow, pressed && { opacity: 0.75 }]}>
          <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Security & Preferences</Text>
      </View>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12, alignSelf: 'flex-start' },
  backLabel: { fontSize: 16, fontWeight: '700', color: BRAND_BLUE_DARK },
  title: { fontSize: 22, fontWeight: '800', color: BRAND_BLUE_DARK, paddingHorizontal: 8 },
  card: {
    margin: 16,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 16,
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
    backgroundColor: '#EFF6FF',
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
