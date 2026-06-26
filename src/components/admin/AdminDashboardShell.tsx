import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AdminSidebar from '@/src/components/admin/AdminSidebar';
import { KeyboardAwareScreen } from '@/src/components/layout/KeyboardAwareScreen';
import DashboardSubscriptionWrapper from '@/src/components/subscription/DashboardSubscriptionWrapper';
import SuperadminDevDashboardSwitcher from '@/src/components/SuperadminDevDashboardSwitcher';
import { ADMIN_COMPACT_BREAKPOINT } from '@/src/constants/adminLayout';

const BRAND_BLUE_DARK = '#0E2F63';
const PAGE_BG = '#FFFFFF';
const OVERLAY = 'rgba(15, 23, 42, 0.45)';

function titleFromPath(pathname: string, t: (k: string) => string): string {
  const p = pathname.replace(/\/$/, '');
  if (p.includes('/settings/profile')) return t('adminPortal.settingsProfileTab');
  if (p.includes('/settings/app-lock')) return t('adminPortal.settingsAppLockTab');
  if (p.includes('/settings/language')) return t('adminPortal.settingsLanguageTab');
  if (p.includes('/settings')) return t('adminPortal.settingsTitle');
  if (/\/admin-dashboard\/teachers\/.+/.test(p)) return t('adminPortal.teacherDetailTitle');
  if (/\/admin-dashboard\/groups\/[^/]+/.test(p)) return t('adminPortal.manageGroupTitle');
  if (p.includes('/groups')) return t('adminPortal.groupsTitle');
  if (p.includes('/teachers')) return t('adminPortal.teachersTitle');
  if (p.includes('/students')) return t('adminPortal.studentsTitle');
  if (p.includes('/attendance')) return t('adminPortal.attendanceTitle');
  return t('adminPortal.dashboardTitle');
}

export default function AdminDashboardShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const isCompact = width < ADMIN_COMPACT_BREAKPOINT;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const headerTitle = useMemo(() => titleFromPath(pathname, t), [pathname, t]);

  const closeDrawer = () => setDrawerOpen(false);

  const sidebar = (
    <AdminSidebar variant={isCompact ? 'drawer' : 'rail'} onNavigate={isCompact ? closeDrawer : undefined} />
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <SuperadminDevDashboardSwitcher />
      <DashboardSubscriptionWrapper role="admin">
        <View style={styles.row}>
          {!isCompact ? (
            <View style={styles.sidebarRail}>{sidebar}</View>
          ) : (
            <Modal
              visible={drawerOpen}
              animationType="slide"
              transparent
              onRequestClose={closeDrawer}>
              <View style={styles.modalRoot}>
                <Pressable
                  style={styles.modalBackdrop}
                  accessibilityLabel={t('adminPortal.closeMenu')}
                  onPress={closeDrawer}
                />
                <View style={styles.modalDrawer}>{sidebar}</View>
              </View>
            </Modal>
          )}

          <View style={styles.main}>
            {isCompact ? (
              <View style={styles.mobileHeader}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('adminPortal.openMenu')}
                  onPress={() => setDrawerOpen(true)}
                  style={({ pressed }) => [styles.menuBtn, pressed && styles.menuBtnPressed]}>
                  <Ionicons name="menu-outline" size={26} color={BRAND_BLUE_DARK} />
                </Pressable>
                <Text style={styles.mobileHeaderTitle} numberOfLines={1}>
                  {headerTitle}
                </Text>
                <View style={styles.mobileHeaderSpacer} />
              </View>
            ) : null}
            <KeyboardAwareScreen avoidKeyboard={false} style={styles.mainInner}>
              {children}
            </KeyboardAwareScreen>
          </View>
        </View>
      </DashboardSubscriptionWrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    minHeight: Platform.OS === 'web' ? ('100%' as unknown as number) : undefined,
  },
  sidebarRail: {
    width: 280,
    flexShrink: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#E2E8F0',
  },
  modalRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: OVERLAY,
  },
  modalDrawer: {
    width: '82%',
    maxWidth: 300,
    backgroundColor: '#0E2F63',
    alignSelf: 'stretch',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '-4px 0 12px rgba(0, 0, 0, 0.15)' } as const)
      : {
          shadowColor: '#000',
          shadowOffset: { width: -4, height: 0 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 16,
        }),
  },
  main: {
    flex: 1,
    minWidth: 0,
    backgroundColor: PAGE_BG,
  },
  mobileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  menuBtn: {
    padding: 8,
    borderRadius: 12,
  },
  menuBtnPressed: {
    opacity: 0.7,
    backgroundColor: '#F1F5F9',
  },
  mobileHeaderTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  mobileHeaderSpacer: {
    width: 42,
  },
  mainInner: {
    flex: 1,
    minWidth: 0,
    width: '100%',
  },
});
