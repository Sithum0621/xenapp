import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { ActivityIndicator, Modal, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { NativeFluidFlatList } from '@/src/components/layout/NativeFluidFlatList';
import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import ChangePasswordModal from '@/src/components/auth/ChangePasswordModal';
import ParentStudentTempPasswordPrompt from '@/src/components/auth/ParentStudentTempPasswordPrompt';
import { type BottomNavItem } from '@/src/components/navigation/BottomNavBar';
import AddStudentModal from '@/src/components/parent/AddStudentModal';
import ActiveGamesScheduleExamOverlay from '@/src/components/parent/ActiveGamesScheduleExamOverlay';
import BrandHeader from '@/src/components/parent/BrandHeader';
import ParentDashboardChatsSection from '@/src/components/parent/ParentDashboardChatsSection';
import ParentDashboardClassesSection from '@/src/components/parent/ParentDashboardClassesSection';
import ParentDashboardGamesSection from '@/src/components/parent/ParentDashboardGamesSection';
import ParentDashboardHomeSection from '@/src/components/parent/ParentDashboardHomeSection';
import ParentHomeGreetingBar, {
  firstNameForGreeting,
} from '@/src/components/parent/ParentHomeGreetingBar';
import ParentBottomDock, {
  parentBottomDockReserve,
} from '@/src/components/parent/ParentBottomDock';
import SubscriptionExpiredOverlay from '@/src/components/subscription/SubscriptionExpiredOverlay';
import { useSubscriptionStatus } from '@/src/components/subscription/useSubscriptionStatus';
import SuperadminDevDashboardSwitcher from '@/src/components/SuperadminDevDashboardSwitcher';
import { signOutAndReturnToLogin } from '@/src/navigation/signOutAndReturnToLogin';
import { getParentDashboardTab } from '@/src/navigation/parentDashboardTabStore';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import { useActiveGamesScheduleExam } from '@/src/contexts/ActiveGamesScheduleExamContext';
import {
  fetchParentStudents,
  type ParentLinkedStudent,
} from '@/src/services/parentStudentsApi';

type ParentTab = 'home' | 'classes' | 'games' | 'chats' | 'settings';

import {
  languageLabelKeyForCode,
  normalizeAppLanguage,
} from '@/src/screens/settings/SettingsLanguageScreen';
import { useAppThemeColors } from '@/src/context/ThemePreferenceContext';
import { routeForPaymentPlan } from '@/src/services/subscription';
import {
  parentBorder,
  parentBrandBlue,
  parentBrandBlueDark,
  parentInkSoft,
  parentSurface,
  parentSurfaceAlt,
} from '@/src/theme/parentDashboardPalette';
import { PAGE_CONTENT_TOP, PAGE_EDGE_INSET } from '@/src/theme/pageLayout';

const BRAND_BLUE_DARK = parentBrandBlueDark;
const BRAND_BLUE = parentBrandBlue;
const TEXT_MUTED = parentInkSoft;
const BORDER = parentBorder;
const SURFACE = parentSurface;
const SURFACE_ALT = parentSurfaceAlt;

const PARENT_ROLE = 'parent_student';

export default function ParentDashboardHome() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const themeColors = useAppThemeColors();
  const currentLanguageLabel = t(
    languageLabelKeyForCode(normalizeAppLanguage(i18n.language)),
  );
  const insets = useSafeAreaInsets();

  const [active, setActive] = useState<ParentTab>(() => getParentDashboardTab());
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [changePwOpen, setChangePwOpen] = useState(false);

  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState<string | null>(null);
  const [students, setStudents] = useState<ParentLinkedStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [classesRefreshNonce, setClassesRefreshNonce] = useState(0);
  const [classesRefreshing, setClassesRefreshing] = useState(false);

  const homeWasShown = useRef(false);
  const [skipHomeEntrance, setSkipHomeEntrance] = useState(false);

  const [freeBannerDismissed, setFreeBannerDismissed] = useState(false);
  const subscription = useSubscriptionStatus();
  const {
    activeExam,
    refresh: refreshActiveExam,
    setDashboardTab,
    pendingDashboardTab,
    clearPendingDashboardTab,
  } = useActiveGamesScheduleExam();
  const showFreeBanner =
    !subscription.loading &&
    !subscription.bypass &&
    subscription.isFree &&
    !freeBannerDismissed;
  const showNextPaymentBar =
    !subscription.loading &&
    subscription.showCountdown &&
    Boolean(subscription.expiryDateIso) &&
    subscription.isActive;

  const scrollBottomPadding = parentBottomDockReserve(
    showNextPaymentBar,
    insets.bottom,
  );

  const loadStudents = useCallback(async (preferStudentId?: string) => {
    setStudentsLoading(true);
    setStudentsError(null);
    const result = await fetchParentStudents();
    if (result.ok) {
      setStudents(result.students);
      setSelectedStudentId((current) => {
        if (
          preferStudentId &&
          result.students.some((s) => s.studentUserId === preferStudentId)
        ) {
          return preferStudentId;
        }
        if (current && result.students.some((s) => s.studentUserId === current)) {
          return current;
        }
        return result.students[0]?.studentUserId ?? null;
      });
    } else {
      setStudents([]);
      setStudentsError(result.error);
    }
    setStudentsLoading(false);
  }, []);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    if (active !== 'classes') return;
    setClassesRefreshNonce((n) => n + 1);
  }, [active]);

  const refreshClassesTab = useCallback(async () => {
    setClassesRefreshing(true);
    await loadStudents();
    setClassesRefreshNonce((n) => n + 1);
    setClassesRefreshing(false);
  }, [loadStudents]);

  const selectedStudent = useMemo(
    () => students.find((s) => s.studentUserId === selectedStudentId) ?? null,
    [students, selectedStudentId],
  );

  const tabs = useMemo<ReadonlyArray<BottomNavItem<ParentTab>>>(
    () => [
      {
        key: 'home',
        label: t('parentDashboard.navHome'),
        icon: 'home-outline',
        activeIcon: 'home',
      },
      {
        key: 'classes',
        label: t('parentDashboard.navClasses'),
        icon: 'book-outline',
        activeIcon: 'book',
      },
      {
        key: 'games',
        label: t('parentDashboard.navGames'),
        icon: 'game-controller-outline',
        activeIcon: 'game-controller',
      },
      {
        key: 'chats',
        label: t('parentDashboard.navChats'),
        icon: 'chatbubble-ellipses-outline',
        activeIcon: 'chatbubble-ellipses',
      },
      {
        key: 'settings',
        label: t('parentDashboard.navSettings'),
        icon: 'settings-outline',
        activeIcon: 'settings',
      },
    ],
    [t],
  );

  const handleSelectStudent = useCallback((studentUserId: string) => {
    setSelectedStudentId(studentUserId);
  }, []);

  const handleAddStudent = useCallback(() => {
    setAddStudentOpen(true);
  }, []);

  const handleOpenGames = useCallback(() => {
    setActive('games');
  }, []);

  const handleStudentLinked = useCallback(
    (studentUserId?: string) => {
      void loadStudents(studentUserId);
    },
    [loadStudents],
  );

  const openLogoutConfirm = useCallback(() => {
    if (signingOut) return;
    setLogoutModalOpen(true);
  }, [signingOut]);

  const closeLogoutConfirm = useCallback(() => {
    if (signingOut) return;
    setLogoutModalOpen(false);
  }, [signingOut]);

  const confirmLogout = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    const result = await signOutAndReturnToLogin(router);
    setSigningOut(false);
    setLogoutModalOpen(false);
    if (!result.ok) {
      appAlert(
        t('parentDashboard.logoutPartialTitle'),
        `${t('parentDashboard.logoutPartialBody')} ${result.message}`,
      );
    }
  }, [router, signingOut, t]);

  const onPasswordChangeSuccess = useCallback(() => {
    setTimeout(() => setChangePwOpen(false), 700);
  }, []);

  const isHomeActive = active === 'home';
  const headerGreetingName = useMemo(() => {
    if (!selectedStudent) return null;
    return firstNameForGreeting(selectedStudent.fullName, selectedStudent.firstName);
  }, [selectedStudent]);
  const showExamBlocker = Boolean(activeExam) && active !== 'games';
  const examBlockerBottom = parentBottomDockReserve(showNextPaymentBar, insets.bottom);

  useFocusEffect(
    useCallback(() => {
      void refreshActiveExam();
    }, [refreshActiveExam]),
  );

  useEffect(() => {
    if (!pendingDashboardTab) return;
    setActive(pendingDashboardTab);
    clearPendingDashboardTab();
  }, [pendingDashboardTab, clearPendingDashboardTab]);

  useEffect(() => {
    setDashboardTab(active);
    void refreshActiveExam();
  }, [active, refreshActiveExam, setDashboardTab]);

  useEffect(() => {
    if (active === 'home') {
      homeWasShown.current = true;
      return;
    }
    if (homeWasShown.current) {
      setSkipHomeEntrance(true);
    }
  }, [active]);

  const renderPlaceholder = (
    titleKey: string,
    bodyKey: string,
    icon: keyof typeof Ionicons.glyphMap,
  ) => (
    <View style={styles.sectionBody}>
      <View style={styles.placeholderCard}>
        <View style={styles.placeholderIconWrap}>
          <Ionicons name={icon} size={26} color={BRAND_BLUE} />
        </View>
        <Text style={styles.placeholderTitle}>{t(titleKey)}</Text>
        <Text style={styles.placeholderBody}>{t(bodyKey)}</Text>
      </View>
    </View>
  );

  const renderSettings = () => (
    <View style={styles.sectionBody}>
      <Text style={styles.sectionTitle}>{t('parentDashboard.settingsTitle')}</Text>
      <Text style={styles.sectionSub}>{t('parentDashboard.settingsSubtitle')}</Text>

      <View style={styles.settingsCard}>
        <ScrollFriendlyPressable
          accessibilityRole="button"
          onPress={() => router.push('/parent-dashboard/settings/app-update')}
          style={styles.menuItem}
          innerStyle={styles.menuItemInner}>
          <View style={styles.menuItemIcon}>
            <Ionicons name="download-outline" size={18} color={BRAND_BLUE_DARK} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuItemTitle}>{t('parentDashboard.settingsAppUpdate')}</Text>
            <Text style={styles.menuItemSub}>{t('parentDashboard.settingsAppUpdateHint')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
        </ScrollFriendlyPressable>

        <ScrollFriendlyPressable
          accessibilityRole="button"
          onPress={() => router.push('/parent-dashboard/settings/profile')}
          style={styles.menuItem}
          innerStyle={styles.menuItemInner}>
          <View style={styles.menuItemIcon}>
            <Ionicons name="person-outline" size={18} color={BRAND_BLUE_DARK} />
          </View>
          <Text style={styles.menuItemTitle}>{t('parentDashboard.settingsProfile')}</Text>
          <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
        </ScrollFriendlyPressable>

        <ScrollFriendlyPressable
          accessibilityRole="button"
          onPress={() => setChangePwOpen(true)}
          style={styles.menuItem}
          innerStyle={styles.menuItemInner}>
          <View style={styles.menuItemIcon}>
            <Ionicons name="key-outline" size={18} color={BRAND_BLUE_DARK} />
          </View>
          <Text style={styles.menuItemTitle}>{t('parentDashboard.settingsChangePassword')}</Text>
          <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
        </ScrollFriendlyPressable>

        <ScrollFriendlyPressable
          accessibilityRole="button"
          onPress={() => router.push('/parent-dashboard/settings/app-lock')}
          style={styles.menuItem}
          innerStyle={styles.menuItemInner}>
          <View style={styles.menuItemIcon}>
            <Ionicons name="lock-closed-outline" size={18} color={BRAND_BLUE_DARK} />
          </View>
          <Text style={styles.menuItemTitle}>{t('parentDashboard.settingsAppLock')}</Text>
          <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
        </ScrollFriendlyPressable>

        <ScrollFriendlyPressable
          accessibilityRole="button"
          onPress={() => router.push('/parent-dashboard/settings/language')}
          style={styles.menuItem}
          innerStyle={styles.menuItemInner}>
          <View style={styles.menuItemIcon}>
            <Ionicons name="language-outline" size={18} color={BRAND_BLUE_DARK} />
          </View>
          <Text style={styles.menuItemTitle}>{t('parentDashboard.settingsLanguage')}</Text>
          <Text style={styles.menuItemValue} numberOfLines={1}>
            {currentLanguageLabel}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
        </ScrollFriendlyPressable>

        <ScrollFriendlyPressable
          accessibilityRole="button"
          onPress={() => router.push(appHref(AppRoutes.policies))}
          style={styles.menuItem}
          innerStyle={styles.menuItemInner}>
          <View style={styles.menuItemIcon}>
            <Ionicons name="document-text-outline" size={18} color={BRAND_BLUE_DARK} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuItemTitle}>{t('parentDashboard.settingsPolicies')}</Text>
            <Text style={styles.menuItemSub}>{t('parentDashboard.settingsPoliciesHint')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
        </ScrollFriendlyPressable>

        <ScrollFriendlyPressable
          accessibilityRole="button"
          onPress={() => router.push(routeForPaymentPlan(PARENT_ROLE))}
          style={styles.menuItem}
          innerStyle={styles.menuItemInner}>
          <View style={styles.menuItemIcon}>
            <Ionicons name="diamond-outline" size={18} color={BRAND_BLUE_DARK} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuItemTitle}>{t('parentDashboard.settingsPackage')}</Text>
            <Text style={styles.menuItemSub} numberOfLines={1}>
              {subscription.isFree
                ? t('package.tierFree')
                : subscription.tier === 'paid'
                  ? t('package.tierPaid')
                  : subscription.tier === 'trial'
                    ? t('package.tierTrial')
                    : t('package.tierFree')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
        </ScrollFriendlyPressable>

        <ScrollFriendlyPressable
          accessibilityRole="button"
          onPress={() => router.push('/fcm-test')}
          style={styles.menuItem}
          innerStyle={styles.menuItemInner}>
          <View style={styles.menuItemIcon}>
            <Ionicons name="notifications-outline" size={18} color={BRAND_BLUE_DARK} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuItemTitle}>{t('parentDashboard.settingsPushTest')}</Text>
            <Text style={styles.menuItemSub}>{t('parentDashboard.settingsPushTestHint')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
        </ScrollFriendlyPressable>

        <ScrollFriendlyPressable
          accessibilityRole="button"
          accessibilityLabel={t('parentDashboard.settingsLogout')}
          enabled={!signingOut}
          onPress={openLogoutConfirm}
          style={[styles.menuItem, styles.logoutMenuItem]}
          innerStyle={styles.menuItemInner}>
          <View style={[styles.menuItemIcon, styles.logoutIconWrap]}>
            <Ionicons name="log-out-outline" size={18} color="#B42318" />
          </View>
          <Text style={styles.logoutTitle}>
            {signingOut ? t('parentDashboard.loggingOut') : t('parentDashboard.settingsLogout')}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
        </ScrollFriendlyPressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.page }]} edges={['top', 'left', 'right', 'bottom']}>
      <SuperadminDevDashboardSwitcher />

      <BrandHeader
        helloPrefix={headerGreetingName ? t('parentDashboard.helloPrefix') : undefined}
        userName={headerGreetingName}
        trailing={<ParentHomeGreetingBar isVisible />}
      />

      <ParentStudentTempPasswordPrompt marginHorizontal={16} marginBottom={isHomeActive ? 8 : 12} />

      <View style={styles.main}>
        {isHomeActive ? (
          <ParentDashboardHomeSection
            isVisible
            skipEntranceAnimation={skipHomeEntrance}
            studentsLoading={studentsLoading}
            studentsError={studentsError}
            students={students}
            selectedStudentId={selectedStudentId}
            selectedStudent={selectedStudent}
            onSelectStudent={handleSelectStudent}
            onAddStudent={handleAddStudent}
            onRetryStudents={handleStudentLinked}
            onOpenGames={handleOpenGames}
            contentPaddingBottom={scrollBottomPadding}
          />
        ) : null}

        {active === 'classes' ? (
          <ParentDashboardClassesSection
            isVisible
            studentsLoading={studentsLoading}
            selectedStudentId={selectedStudentId}
            selectedStudent={selectedStudent}
            classesRefreshNonce={classesRefreshNonce}
            contentPaddingBottom={scrollBottomPadding}
            refreshControl={
              <RefreshControl
                refreshing={classesRefreshing}
                onRefresh={() => void refreshClassesTab()}
                tintColor={BRAND_BLUE}
                colors={[BRAND_BLUE]}
              />
            }
          />
        ) : null}

        {active === 'games' ? (
          <ParentDashboardGamesSection
            isVisible
            studentsLoading={studentsLoading}
            selectedStudentId={selectedStudentId}
            contentPaddingBottom={scrollBottomPadding}
          />
        ) : null}

        {active === 'chats' ? (
          <ParentDashboardChatsSection
            isVisible
            studentsLoading={studentsLoading}
            selectedStudentId={selectedStudentId}
            contentPaddingBottom={scrollBottomPadding}
          />
        ) : null}

        {active === 'settings' ? (
          <NativeFluidFlatList
            style={styles.scroll}
            data={[]}
            renderItem={() => null}
            keyExtractor={() => 'settings'}
            ListHeaderComponent={() => renderSettings()}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: scrollBottomPadding },
            ]}
          />
        ) : null}
      </View>

      <ParentBottomDock<ParentTab>
        payment={
          showNextPaymentBar
            ? {
                role: PARENT_ROLE,
                expiryDateIso: subscription.expiryDateIso,
                isActive: subscription.isActive,
              }
            : null
        }
        nav={{ items: tabs, activeKey: active, onSelect: setActive }}
      />

      {showExamBlocker ? (
        <View pointerEvents="box-none" style={[styles.examBlocker, { bottom: examBlockerBottom }]}>
          <ActiveGamesScheduleExamOverlay
            visible
            onDismiss={() => setActive('games')}
          />
        </View>
      ) : null}

      {showFreeBanner ? (
        <SubscriptionExpiredOverlay
          role={PARENT_ROLE}
          onDismiss={() => setFreeBannerDismissed(true)}
        />
      ) : null}

      <ChangePasswordModal
        visible={changePwOpen}
        onClose={() => setChangePwOpen(false)}
        onSuccess={onPasswordChangeSuccess}
      />

      <AddStudentModal
        visible={addStudentOpen}
        onClose={() => setAddStudentOpen(false)}
        onLinked={handleStudentLinked}
      />

      <Modal
        visible={logoutModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeLogoutConfirm}>
        <View style={styles.modalOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('parentDashboard.logoutCancel')}
            onPress={closeLogoutConfirm}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('parentDashboard.logoutConfirmTitle')}</Text>
            <Text style={styles.modalSub}>{t('parentDashboard.logoutConfirmBody')}</Text>
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
                <Text style={styles.secondaryBtnText}>{t('parentDashboard.logoutCancel')}</Text>
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
                  {signingOut ? t('parentDashboard.loggingOut') : t('parentDashboard.settingsLogout')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: SURFACE_ALT,
  },
  main: {
    flex: 1,
    position: 'relative',
  },
  examBlocker: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 15,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: PAGE_EDGE_INSET, paddingTop: PAGE_CONTENT_TOP },
  sectionBody: { gap: 14 },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
  },
  sectionSub: { fontSize: 14, color: TEXT_MUTED, marginBottom: 4 },
  placeholderCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    alignItems: 'center',
    gap: 10,
  },
  placeholderIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(46, 84, 148, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    textAlign: 'center',
  },
  placeholderBody: {
    fontSize: 13.5,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 360,
  },
  settingsCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  menuItem: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  menuItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  menuItemPressed: { backgroundColor: 'rgba(46, 84, 148, 0.05)' },
  menuItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(46, 84, 148, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: BRAND_BLUE_DARK },
  menuItemSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
    color: TEXT_MUTED,
  },
  menuItemValue: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_MUTED,
    maxWidth: 100,
    marginRight: 2,
  },
  logoutMenuItem: { borderBottomWidth: 0 },
  logoutIconWrap: { backgroundColor: 'rgba(180, 35, 24, 0.08)' },
  logoutTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#B42318' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 22, 53, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: SURFACE,
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingVertical: 22,
    gap: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: BRAND_BLUE_DARK },
  modalSub: { fontSize: 14, color: TEXT_MUTED, lineHeight: 20 },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  secondaryBtnInline: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: SURFACE,
  },
  secondaryBtnPressed: { opacity: 0.75 },
  secondaryBtnText: { fontSize: 14, fontWeight: '700', color: BRAND_BLUE_DARK },
  destructiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#B42318',
  },
  destructiveBtnPressed: { opacity: 0.9 },
  destructiveBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  btnDisabled: { opacity: 0.55 },
});
