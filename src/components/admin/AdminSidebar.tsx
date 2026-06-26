import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { type Href, usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import { clearSessionCountdown } from '@/src/services/sessionManager';
import { supabase } from '@/src/services/supabaseClient';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const SIDEBAR_BG = '#0E2F63';
const SIDEBAR_ACTIVE = '#123B7A';
const TEXT_ON_NAV = '#FFFFFF';
const TEXT_ON_NAV_MUTED = 'rgba(255,255,255,0.72)';
const SUBTLE_LINE = 'rgba(255,255,255,0.12)';

type IconName = ComponentProps<typeof Ionicons>['name'];

type NavItem = {
  href: Href;
  labelKey: string;
  icon: IconName;
  match: 'dashboard' | 'teachers' | 'students' | 'groups' | 'attendance' | 'settings';
};

const NAV_ITEMS: NavItem[] = [
  {
    href: appHref(AppRoutes.adminDashboard),
    labelKey: 'adminPortal.navDashboard',
    icon: 'grid-outline',
    match: 'dashboard',
  },
  {
    href: '/admin-dashboard/teachers',
    labelKey: 'adminPortal.navTeachers',
    icon: 'school-outline',
    match: 'teachers',
  },
  {
    href: '/admin-dashboard/students',
    labelKey: 'adminPortal.navStudents',
    icon: 'people-outline',
    match: 'students',
  },
  {
    // Use `/groups` only — `/groups/index` is matched by `[groupId]` with id "index" and breaks the list screen.
    href: '/admin-dashboard/groups' as Href,
    labelKey: 'adminPortal.navGroups',
    icon: 'albums-outline',
    match: 'groups',
  },
  {
    href: '/admin-dashboard/attendance',
    labelKey: 'adminPortal.navAttendance',
    icon: 'calendar-outline',
    match: 'attendance',
  },
  {
    href: '/admin-dashboard/settings/profile',
    labelKey: 'adminPortal.navSettings',
    icon: 'settings-outline',
    match: 'settings',
  },
];

function routeMatches(pathname: string, match: NavItem['match']): boolean {
  const p = pathname.replace(/\/$/, '');
  if (match === 'dashboard') {
    return p === '/admin-dashboard' || p.endsWith('/admin-dashboard');
  }
  if (match === 'settings') {
    return p.includes('/admin-dashboard/settings');
  }
  if (match === 'teachers') return p.includes('/admin-dashboard/teachers');
  if (match === 'students') return p.includes('/admin-dashboard/students');
  if (match === 'groups') return p.includes('/admin-dashboard/groups');
  if (match === 'attendance') return p.includes('/admin-dashboard/attendance');
  return false;
}

type AdminSidebarProps = {
  onNavigate?: () => void;
  variant?: 'rail' | 'drawer';
};

export default function AdminSidebar({ onNavigate, variant = 'rail' }: AdminSidebarProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();

  const go = (href: Href) => {
    router.replace(href);
    onNavigate?.();
  };

  const logout = async () => {
    clearSessionCountdown();
    await supabase.auth.signOut();
    router.replace(AppRoutes.login);
  };

  return (
    <View style={[styles.sidebar, variant === 'drawer' && styles.sidebarDrawer]} accessibilityRole="menu">
      <View style={styles.brandBlock}>
        <View style={styles.brandMark}>
          <Ionicons name="book" size={26} color={BRAND_BLUE} />
        </View>
        <Text style={styles.brandTitle}>{t('adminPortal.shellTitle')}</Text>
        <Text style={styles.brandSubtitle}>{t('adminPortal.shellSubtitle')}</Text>
      </View>

      <View style={styles.navScrollContent}>
        {NAV_ITEMS.map((item) => {
          const active = routeMatches(pathname, item.match);
          return (
            <Pressable
              key={item.labelKey}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: active }}
              onPress={() => go(item.href)}
              style={({ pressed }) => [
                styles.navRow,
                active && styles.navRowActive,
                pressed && styles.navRowPressed,
              ]}>
              <Ionicons
                name={item.icon}
                size={22}
                color={active ? TEXT_ON_NAV : TEXT_ON_NAV_MUTED}
              />
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>{t(item.labelKey)}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('adminPortal.logout')}
          onPress={() => void logout()}
          style={({ pressed }) => [styles.logoutBtn, pressed && styles.logoutBtnPressed]}>
          <Ionicons name="log-out-outline" size={22} color={TEXT_ON_NAV} />
          <Text style={styles.logoutText}>{t('adminPortal.logout')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 280,
    flex: 1,
    backgroundColor: SIDEBAR_BG,
    paddingTop: Platform.OS === 'web' ? 16 : 8,
    ...Platform.select({
      web: { maxHeight: '100vh' as unknown as number },
      default: {},
    }),
  },
  sidebarDrawer: {
    width: '100%',
    maxWidth: '100%',
  },
  brandBlock: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SUBTLE_LINE,
  },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  brandTitle: {
    color: TEXT_ON_NAV,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  brandSubtitle: {
    marginTop: 4,
    color: TEXT_ON_NAV_MUTED,
    fontSize: 13,
    fontWeight: '600',
  },
  navScrollContent: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 4,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  navRowActive: {
    backgroundColor: SIDEBAR_ACTIVE,
  },
  navRowPressed: {
    opacity: 0.88,
  },
  navLabel: {
    flex: 1,
    color: TEXT_ON_NAV_MUTED,
    fontSize: 15,
    fontWeight: '600',
  },
  navLabelActive: {
    color: TEXT_ON_NAV,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SUBTLE_LINE,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  logoutBtnPressed: {
    opacity: 0.88,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  logoutText: {
    color: TEXT_ON_NAV,
    fontSize: 15,
    fontWeight: '700',
  },
});
