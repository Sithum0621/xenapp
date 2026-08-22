import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { NativeFluidFlatList } from '@/src/components/layout/NativeFluidFlatList';
import { SafeAreaView } from 'react-native-safe-area-context';

import BrandHeader from '@/src/components/parent/BrandHeader';
import TeacherHeaderNotifications from '@/src/components/teacher/TeacherHeaderNotifications';
import TeacherAssignedGroupsSection from '@/src/components/teacher/TeacherAssignedGroupsSection';
import TeacherAttendanceSection from '@/src/components/teacher/TeacherAttendanceSection';
import TeacherDashboardOverviewSection from '@/src/components/teacher/TeacherDashboardOverviewSection';
import DashboardSubscriptionWrapper from '@/src/components/subscription/DashboardSubscriptionWrapper';
import PushNotificationSettingsRow from '@/src/components/push/PushNotificationSettingsRow';
import SuperadminDevDashboardSwitcher from '@/src/components/SuperadminDevDashboardSwitcher';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import { signOutAndReturnToLogin } from '@/src/navigation/signOutAndReturnToLogin';
import { supabase } from '@/src/services/supabaseClient';
import { useAppThemeColors } from '@/src/context/ThemePreferenceContext';
import { PAGE_CONTENT_TOP, PAGE_EDGE_INSET } from '@/src/theme/pageLayout';

function firstNameFromFullName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

type DashboardSection = 'overview' | 'classes' | 'chats' | 'attendance' | 'settings';

const BRAND_BLUE_DARK = '#00101F';
const BRAND_BLUE = '#041830';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const COMPACT_BREAKPOINT = 900;

export default function TeacherDashboardHome() {
  const router = useRouter();
  const { t } = useTranslation();
  const themeColors = useAppThemeColors();

  const NAV_ITEMS: { key: DashboardSection; label: string; icon: keyof typeof Ionicons.glyphMap }[] =
    useMemo(
      () => [
        { key: 'overview', label: t('teacherDashboard.overviewNav'), icon: 'grid-outline' },
        { key: 'classes', label: t('teacherDashboard.classesNav'), icon: 'book-outline' },
        { key: 'chats', label: t('teacherDashboard.chatsNav'), icon: 'chatbubbles-outline' },
        { key: 'attendance', label: t('teacherDashboard.attendanceNav'), icon: 'calendar-outline' },
        { key: 'settings', label: t('teacherDashboard.settingsNav'), icon: 'settings-outline' },
      ],
      [t],
    );
  const { width } = useWindowDimensions();
  const isCompact = width < COMPACT_BREAKPOINT;
  const [active, setActive] = useState<DashboardSection>('overview');
  const [modeModalOpen, setModeModalOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [headerUserName, setHeaderUserName] = useState<string | null>(null);

  const current = useMemo(() => NAV_ITEMS.find((item) => item.key === active) ?? NAV_ITEMS[0], [active]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled) return;

      const full = profile?.full_name?.trim();
      if (full) {
        setHeaderUserName(firstNameFromFullName(full));
      } else {
        setHeaderUserName(t('teacherDashboard.overview.teacherFallback'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const openLogoutConfirm = () => {
    if (signingOut) return;
    setLogoutModalOpen(true);
  };

  const closeLogoutConfirm = () => {
    if (signingOut) return;
    setLogoutModalOpen(false);
  };

  const confirmLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    const result = await signOutAndReturnToLogin(router);
    setSigningOut(false);
    setLogoutModalOpen(false);
    if (!result.ok) {
      appAlert('Signed out', `You were signed out, but the server reported: ${result.message}`);
    }
  };

  const scrollBottomPadding = isCompact ? 90 : 24;

  const pageHeader = useMemo(
    () => (
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.pageTitle}>{current.label}</Text>
          <Text style={styles.pageSub}>Welcome back, Teacher</Text>
        </View>
      </View>
    ),
    [current.label],
  );

  const renderSection = () => {
    if (active === 'settings') {
      return (
        <View style={styles.sectionBody}>
          <View style={styles.settingsCard}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setModeModalOpen(true)}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
              <View style={styles.menuItemIcon}>
                <Ionicons name="swap-horizontal-outline" size={18} color={BRAND_BLUE_DARK} />
              </View>
              <View style={styles.menuItemTextWrap}>
                <Text style={styles.menuItemTitle}>Mode</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/teacher-dashboard/settings/profile')}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
              <View style={styles.menuItemIcon}>
                <Ionicons name="person-outline" size={18} color={BRAND_BLUE_DARK} />
              </View>
              <View style={styles.menuItemTextWrap}>
                <Text style={styles.menuItemTitle}>Profile</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('teacherDashboard.settingsWalletA11y')}
              onPress={() => router.push(appHref(AppRoutes.teacherWallet))}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
              <View style={styles.menuItemIcon}>
                <Ionicons name="cash-outline" size={18} color={BRAND_BLUE_DARK} />
              </View>
              <View style={styles.menuItemTextWrap}>
                <Text style={styles.menuItemTitle}>{t('teacherDashboard.settingsWalletTitle')}</Text>
                <Text style={styles.menuItemSub}>{t('teacherDashboard.settingsWalletHint')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/teacher-dashboard/settings/app-update')}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
              <View style={styles.menuItemIcon}>
                <Ionicons name="download-outline" size={18} color={BRAND_BLUE_DARK} />
              </View>
              <View style={styles.menuItemTextWrap}>
                <Text style={styles.menuItemTitle}>App update</Text>
                <Text style={styles.menuItemSub}>Download and install the latest APK</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
            </Pressable>

            <View style={styles.menuItem}>
              <PushNotificationSettingsRow />
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/teacher-dashboard/settings/security')}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
              <View style={styles.menuItemIcon}>
                <Ionicons name="shield-checkmark-outline" size={18} color={BRAND_BLUE_DARK} />
              </View>
              <View style={styles.menuItemTextWrap}>
                <Text style={styles.menuItemTitle}>Security & Preferences</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(appHref(AppRoutes.policies))}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
              <View style={styles.menuItemIcon}>
                <Ionicons name="document-text-outline" size={18} color={BRAND_BLUE_DARK} />
              </View>
              <View style={styles.menuItemTextWrap}>
                <Text style={styles.menuItemTitle}>{t('policies.settingsEntry')}</Text>
                <Text style={styles.menuItemSub}>{t('policies.settingsEntryHint')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log out"
              disabled={signingOut}
              onPress={openLogoutConfirm}
              style={({ pressed }) => [styles.menuItem, styles.logoutMenuItem, pressed && styles.menuItemPressed]}>
              <View style={[styles.menuItemIcon, styles.logoutIconWrap]}>
                <Ionicons name="log-out-outline" size={18} color="#B42318" />
              </View>
              <View style={styles.menuItemTextWrap}>
                <Text style={styles.logoutTitle}>{signingOut ? 'Logging out...' : 'Log out'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
            </Pressable>
          </View>

          <Modal
            visible={modeModalOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setModeModalOpen(false)}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Switch mode</Text>
                <Text style={styles.modalSub}>Move to Parent dashboard now?</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setModeModalOpen(false);
                    router.replace(appHref(AppRoutes.parentDashboard));
                  }}
                  style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}>
                  <Ionicons name="swap-horizontal-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>Switch to Parent Mode</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setModeModalOpen(false)}
                  style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}>
                  <Ionicons name="close-outline" size={18} color={BRAND_BLUE_DARK} />
                  <Text style={styles.secondaryBtnText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </Modal>

          <Modal
            visible={logoutModalOpen}
            transparent
            animationType="fade"
            onRequestClose={closeLogoutConfirm}>
            <View style={styles.modalOverlay}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
                onPress={closeLogoutConfirm}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Log out</Text>
                <Text style={styles.modalSub}>
                  You will be signed out of this device and returned to the login screen. Continue?
                </Text>
                <View style={styles.modalActionsRow}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={signingOut}
                    onPress={closeLogoutConfirm}
                    style={({ pressed }) => [
                      styles.secondaryBtnInline,
                      pressed && styles.secondaryBtnPressed,
                      signingOut && styles.btnDisabled,
                    ]}>
                    <Text style={styles.secondaryBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={signingOut}
                    onPress={() => void confirmLogout()}
                    style={({ pressed }) => [
                      styles.destructiveBtn,
                      pressed && !signingOut && styles.destructiveBtnPressed,
                      signingOut && styles.btnDisabled,
                    ]}>
                    <Ionicons name="log-out-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.destructiveBtnText}>
                      {signingOut ? 'Logging out...' : 'Log out'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        </View>
      );
    }

    return (
      <View style={styles.sectionBody}>
        <Text style={styles.heroTitle}>{current.label}</Text>
        <Text style={styles.heroSub}>{t('teacherDashboard.sectionPlaceholder', { section: current.label })}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.page }]} edges={['top', 'left', 'right', 'bottom']}>
      <SuperadminDevDashboardSwitcher />
      <BrandHeader
        helloPrefix={t('teacherDashboard.overview.helloPrefix')}
        userName={headerUserName}
        trailing={<TeacherHeaderNotifications isVisible />}
      />
      <DashboardSubscriptionWrapper role="teacher" fullWidth>
        <View style={styles.wrap}>
          {!isCompact ? (
            <View style={styles.sidebar}>
              <View style={styles.sidebarNav}>
                {NAV_ITEMS.map((item) => {
                  const selected = item.key === active;
                  return (
                    <Pressable
                      key={item.key}
                      accessibilityRole="button"
                      onPress={() => setActive(item.key)}
                      style={({ pressed }) => [
                        styles.navItem,
                        selected && styles.navItemSelected,
                        pressed && !selected && styles.navItemPressed,
                      ]}>
                      <Ionicons
                        name={item.icon}
                        size={18}
                        color={selected ? '#FFFFFF' : BRAND_BLUE_DARK}
                      />
                      <Text style={[styles.navLabel, selected && styles.navLabelSelected]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          <View style={styles.main}>
            {active === 'overview' ? (
              <TeacherDashboardOverviewSection
                variant="overview"
                contentPaddingBottom={scrollBottomPadding}
                onOpenClasses={() => setActive('classes')}
              />
            ) : active === 'classes' ? (
              <TeacherDashboardOverviewSection
                variant="classes"
                contentPaddingBottom={scrollBottomPadding}
              />
            ) : active === 'chats' ? (
              <TeacherAssignedGroupsSection
                topHeader={pageHeader}
                contentPaddingBottom={scrollBottomPadding}
              />
            ) : active === 'attendance' ? (
              <NativeFluidFlatList
                style={styles.flex1}
                data={[]}
                renderItem={() => null}
                keyExtractor={() => 'teacher-attendance'}
                ListHeaderComponent={() => (
                  <View style={styles.mainContentHeader}>
                    {pageHeader}
                    <TeacherAttendanceSection />
                  </View>
                )}
                contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
              />
            ) : (
              <NativeFluidFlatList
                style={styles.flex1}
                data={[]}
                renderItem={() => null}
                keyExtractor={() => 'teacher-tab'}
                ListHeaderComponent={() => (
                  <View style={styles.mainContentHeader}>
                    {pageHeader}
                    {renderSection()}
                  </View>
                )}
                contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
              />
            )}
            {isCompact ? (
              <View style={styles.bottomBar}>
                {NAV_ITEMS.map((item) => {
                  const selected = item.key === active;
                  return (
                    <Pressable
                      key={item.key}
                      accessibilityRole="button"
                      onPress={() => setActive(item.key)}
                      style={({ pressed }) => [
                        styles.bottomItem,
                        selected && styles.bottomItemSelected,
                        pressed && styles.bottomItemPressed,
                      ]}>
                      <Ionicons
                        name={item.icon}
                        size={20}
                        color={selected ? BRAND_BLUE : TEXT_MUTED}
                      />
                      <Text style={[styles.bottomLabel, selected && styles.bottomLabelSelected]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        </View>
      </DashboardSubscriptionWrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  wrap: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
  },
  sidebar: {
    width: 250,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  sidebarNav: {
    gap: 8,
  },
  navItem: {
    minHeight: 42,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  navItemSelected: {
    backgroundColor: BRAND_BLUE,
  },
  navItemPressed: {
    backgroundColor: '#EEF2FF',
  },
  navLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  navLabelSelected: {
    color: '#FFFFFF',
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  flex1: { flex: 1 },
  mainContentHeader: {
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: PAGE_CONTENT_TOP,
  },
  mainContent: {
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: PAGE_CONTENT_TOP,
    paddingBottom: 90,
  },
  headerRow: {
    marginBottom: 12,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
  },
  pageSub: {
    marginTop: 4,
    color: TEXT_MUTED,
    fontSize: 14,
  },
  sectionBody: {
    gap: 12,
  },
  settingsCard: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 16,
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
  menuItemFirst: {
    marginTop: 0,
  },
  menuItemPressed: {
    backgroundColor: '#F8FAFC',
  },
  logoutMenuItem: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
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
  logoutIconWrap: {
    backgroundColor: '#FEE2E2',
  },
  logoutTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#B42318',
  },
  menuItemSub: {
    marginTop: 2,
    fontSize: 12,
    color: TEXT_MUTED,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
  },
  heroSub: {
    marginTop: 8,
    color: TEXT_MUTED,
    fontSize: 14,
    lineHeight: 20,
  },
  cardGrid: {
    marginTop: 16,
    gap: 10,
  },
  card: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#F8FAFC',
  },
  cardTitle: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
  cardValue: {
    color: BRAND_BLUE_DARK,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
  },
  cardHint: {
    color: TEXT_MUTED,
    fontSize: 13,
    marginTop: 4,
  },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: BRAND_BLUE,
    borderRadius: 12,
    minHeight: 44,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondaryBtn: {
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    minHeight: 44,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  secondaryBtnPressed: {
    backgroundColor: '#F8FAFC',
  },
  secondaryBtnText: {
    color: BRAND_BLUE_DARK,
    fontSize: 14,
    fontWeight: '800',
  },
  primaryBtnPressed: {
    opacity: 0.85,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
  },
  modalSub: {
    marginTop: 8,
    fontSize: 14,
    color: TEXT_MUTED,
    lineHeight: 20,
  },
  modalActionsRow: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  secondaryBtnInline: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  destructiveBtn: {
    backgroundColor: '#B42318',
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  destructiveBtnPressed: {
    opacity: 0.88,
  },
  destructiveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  bottomBar: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 4,
    flexDirection: 'row',
  },
  bottomItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 12,
  },
  bottomItemSelected: {
    backgroundColor: '#E3F2FD',
  },
  bottomItemPressed: {
    opacity: 0.8,
  },
  bottomLabel: {
    marginTop: 2,
    color: TEXT_MUTED,
    fontSize: 11,
    fontWeight: '600',
  },
  bottomLabelSelected: {
    color: BRAND_BLUE,
  },
});
