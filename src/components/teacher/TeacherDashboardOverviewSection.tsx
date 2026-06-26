import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { TextInput } from '@/src/theme/TextInput';

import { NativeFluidFlatList } from '@/src/components/layout/NativeFluidFlatList';
import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';
import TeacherDashboardTodaySchedule from '@/src/components/teacher/TeacherDashboardTodaySchedule';
import { SessionCacheKeys } from '@/src/services/sessionDataCache';
import { useSessionCachedQuery } from '@/src/hooks/useSessionCachedQuery';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import {
  fetchTeacherDashboardOverview,
  type TeacherDashboardClassRow,
} from '@/src/services/teacherDashboardApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { formatBillingMonthLabel } from '@/src/utils/classPaymentStatus';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const BORDER = '#E2E8F0';
const PAGE_SURFACE = '#F8FAFC';
const TEXT_MUTED = '#64748B';
const GREEN_OK = '#15803D';
const AMBER = '#D97706';
const VIOLET = '#6D28D9';
const MAX_VISIBLE_CLASSES = 3;

function formatMoney(cents: number, language: string): string {
  const locale = language === 'si' ? 'si-LK' : language === 'ta' ? 'ta-LK' : 'en-LK';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(cents / 100));
}

function classMatchesQuery(row: TeacherDashboardClassRow, q: string): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return false;
  return (
    row.name.toLowerCase().includes(n) ||
    (row.instituteName ?? '').toLowerCase().includes(n)
  );
}

export type TeacherDashboardOverviewSectionProps = {
  contentPaddingBottom?: number;
  /** `overview` — financial summary only; `classes` — class list and search */
  variant?: 'overview' | 'classes';
};

const ClassOverviewRow = memo(function ClassOverviewRow({
  row,
  studentCountLabel,
  instituteBadge,
  personalBadge,
  openGroupLabel,
  onOpenGroup,
}: {
  row: TeacherDashboardClassRow;
  studentCountLabel: string;
  instituteBadge: string;
  personalBadge: string;
  openGroupLabel: string;
  onOpenGroup: () => void;
}) {
  return (
    <View style={styles.classCard}>
      <ScrollFriendlyPressable
        accessibilityRole="button"
        accessibilityLabel={openGroupLabel}
        onPress={onOpenGroup}
        style={styles.classRowHeader}
        innerStyle={styles.classRowHeaderInner}>
        <View style={styles.classIconWrap}>
          <Ionicons
            name={row.source === 'institute' ? 'business-outline' : 'people-outline'}
            size={18}
            color={BRAND_BLUE}
          />
        </View>
        <View style={styles.classTextCol}>
          <Text style={styles.className} numberOfLines={2}>
            {row.name}
          </Text>
          {row.instituteName ? (
            <Text style={styles.classMeta} numberOfLines={1}>
              {row.instituteName}
            </Text>
          ) : (
            <View style={styles.badgePill}>
              <Text style={styles.badgePillText}>
                {row.source === 'institute' ? instituteBadge : personalBadge}
              </Text>
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
      </ScrollFriendlyPressable>

      <View style={styles.classCardFooter}>
        <Text style={styles.studentCountLabel}>{studentCountLabel}</Text>
        <Text style={styles.studentCountValue}>{row.studentCount}</Text>
      </View>
    </View>
  );
});

function TeacherDashboardOverviewSection({
  contentPaddingBottom = 0,
  variant = 'overview',
}: TeacherDashboardOverviewSectionProps) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const ov = (k: string, o?: Record<string, unknown>) => t(`teacherDashboard.overview.${k}`, o);

  const {
    data: overviewResult,
    loading,
    error: queryError,
    refresh,
  } = useSessionCachedQuery(
    SessionCacheKeys.TEACHER_DASHBOARD_OVERVIEW,
    () => fetchTeacherDashboardOverview(),
    { shouldCache: (res) => !res.error && res.overview != null },
  );

  const overview = overviewResult?.overview ?? null;
  const error = overviewResult?.error ?? queryError;
  const partialWarning = overviewResult?.partialWarning ?? null;
  const [searchQuery, setSearchQuery] = useState('');

  const monthLabel = useMemo(
    () =>
      overview?.billingMonth
        ? formatBillingMonthLabel(overview.billingMonth)
        : formatBillingMonthLabel(new Date().toISOString().slice(0, 10)),
    [overview?.billingMonth],
  );

  const allClasses = overview?.classes ?? [];
  const showClassSearch = allClasses.length > 0;
  const searchActive = searchQuery.trim().length > 0;
  const hasMoreThanPreview = allClasses.length > MAX_VISIBLE_CLASSES;

  const showFinancial = variant === 'overview';
  const showClasses = variant === 'classes';

  const displayedClasses = useMemo(() => {
    if (searchActive) {
      return allClasses.filter((row) => classMatchesQuery(row, searchQuery));
    }
    if (showClasses) {
      return allClasses;
    }
    if (hasMoreThanPreview) {
      return allClasses.slice(0, MAX_VISIBLE_CLASSES);
    }
    return allClasses;
  }, [allClasses, searchQuery, searchActive, hasMoreThanPreview, showClasses]);

  const ListHeaderInner = useMemo(() => {
    if (showFinancial) {
      if (loading) {
        return (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={BRAND_BLUE} />
            <Text style={styles.loaderHint}>{ov('loading')}</Text>
          </View>
        );
      }

      if (error) {
        return (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>{ov('loadError')}</Text>
            <Text style={styles.errorDetail}>{error}</Text>
            <ScrollFriendlyPressable
              accessibilityRole="button"
              onPress={() => refresh(true)}
              style={styles.retryBtn}
              innerStyle={styles.retryBtnInner}>
              <Text style={styles.retryBtnText}>{ov('retry')}</Text>
            </ScrollFriendlyPressable>
          </View>
        );
      }

      if (!overview) return null;

      return (
        <View style={styles.headerBlock}>
          {partialWarning ? (
            <Text style={styles.partialWarn}>{ov('partialWarning', { detail: partialWarning })}</Text>
          ) : null}

          <Text style={styles.monthCaption}>{ov('financialMonth', { month: monthLabel })}</Text>
          <View style={styles.financeBlock}>
            <View style={styles.financeRow}>
              <ScrollFriendlyPressable
                accessibilityRole="button"
                accessibilityLabel={ov('openWalletA11y')}
                onPress={() => router.push(appHref(AppRoutes.teacherWallet))}
                style={styles.financeCardHalf}
                innerStyle={styles.financeCardInner}>
                <View style={[styles.financeCardTop, styles.financeCardTopHalf]}>
                  <Ionicons name="cash-outline" size={18} color={BRAND_BLUE} />
                  <Text style={styles.financeCardLabel} numberOfLines={2}>
                    {ov('walletBalance')}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color="#94A3B8" style={styles.financeCardChevron} />
                </View>
                <Text style={[styles.financeCardValueCompact, { color: BRAND_BLUE }]} numberOfLines={1}>
                  Rs. {formatMoney(overview.teacherWalletBalanceCents ?? 0, i18n.language)}
                </Text>
              </ScrollFriendlyPressable>
              <ScrollFriendlyPressable
                accessibilityRole="button"
                accessibilityLabel={ov('openIncomeBreakdownA11y')}
                onPress={() => router.push(appHref(AppRoutes.teacherIncomeBreakdown))}
                style={styles.financeCardHalf}
                innerStyle={styles.financeCardInner}>
                <View style={[styles.financeCardTop, styles.financeCardTopHalf]}>
                  <Ionicons name="trending-up-outline" size={18} color={GREEN_OK} />
                  <Text style={styles.financeCardLabel} numberOfLines={2}>
                    {ov('totalIncome')}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color="#94A3B8" style={styles.financeCardChevron} />
                </View>
                <Text style={[styles.financeCardValueCompact, { color: GREEN_OK }]} numberOfLines={1}>
                  Rs. {formatMoney(overview.totalIncomeCents, i18n.language)}
                </Text>
              </ScrollFriendlyPressable>
            </View>
            <View style={styles.financeRow}>
              <View style={styles.financeCardHalf}>
                <View style={styles.financeCardInner}>
                  <View style={[styles.financeCardTop, styles.financeCardTopHalf]}>
                    <Ionicons name="time-outline" size={18} color={AMBER} />
                    <Text style={styles.financeCardLabel} numberOfLines={2}>
                      {ov('duePayment')}
                    </Text>
                  </View>
                  <Text style={[styles.financeCardValueCompact, { color: AMBER }]} numberOfLines={1}>
                    Rs. {formatMoney(overview.duePaymentCents, i18n.language)}
                  </Text>
                </View>
              </View>
              <View style={styles.financeCardHalf}>
                <View style={styles.financeCardInner}>
                  <View style={[styles.financeCardTop, styles.financeCardTopHalf]}>
                    <Ionicons name="card-outline" size={18} color={VIOLET} />
                    <Text style={styles.financeCardLabel} numberOfLines={2}>
                      {ov('amountToPay')}
                    </Text>
                  </View>
                  <Text style={[styles.financeCardValueCompact, { color: VIOLET }]} numberOfLines={1}>
                    Rs. {formatMoney(overview.amountToPayCents, i18n.language)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.quickActionsRow}>
            <ScrollFriendlyPressable
              accessibilityRole="button"
              accessibilityLabel={ov('paymentsButtonA11y')}
              onPress={() => router.push(appHref(AppRoutes.teacherPayments))}
              style={styles.quickActionBtn}
              innerStyle={styles.quickActionBtnInner}>
              <Ionicons name="wallet-outline" size={20} color={BRAND_BLUE} />
              <Text style={styles.quickActionLabel}>{ov('paymentsButton')}</Text>
            </ScrollFriendlyPressable>
            <ScrollFriendlyPressable
              accessibilityRole="button"
              accessibilityLabel={ov('myTimetableButtonA11y')}
              onPress={() => router.push(appHref(AppRoutes.teacherMyTimetable))}
              style={styles.quickActionBtn}
              innerStyle={styles.quickActionBtnInner}>
              <Ionicons name="calendar-outline" size={20} color={BRAND_BLUE} />
              <Text style={styles.quickActionLabel}>{ov('myTimetableButton')}</Text>
            </ScrollFriendlyPressable>
          </View>

          <TeacherDashboardTodaySchedule />
        </View>
      );
    }

    if (loading) {
      return (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={BRAND_BLUE} />
          <Text style={styles.loaderHint}>{ov('loading')}</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>{ov('loadError')}</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <ScrollFriendlyPressable
            accessibilityRole="button"
            onPress={() => refresh(true)}
            style={styles.retryBtn}
            innerStyle={styles.retryBtnInner}>
            <Text style={styles.retryBtnText}>{ov('retry')}</Text>
          </ScrollFriendlyPressable>
        </View>
      );
    }

    if (!overview) return null;

    return (
      <View style={styles.headerBlock}>
        {partialWarning ? (
          <Text style={styles.partialWarn}>{ov('partialWarning', { detail: partialWarning })}</Text>
        ) : null}

        {showClasses ? (
          <>
            <Text style={styles.sectionTitle}>{ov('classesTitle')}</Text>

            <View style={styles.statsRow}>
              <View style={styles.statBlock}>
                <Text style={styles.statLabel}>{ov('totalStudentsLabel')}</Text>
                <Text style={styles.statValue}>{overview.totalStudents}</Text>
              </View>
              <View style={styles.statBlock}>
                <Text style={styles.statLabel}>{ov('totalClassesLabel')}</Text>
                <Text style={styles.statValue}>{allClasses.length}</Text>
              </View>
            </View>

            {showClassSearch ? (
              <>
                <View style={styles.searchWrap}>
                  <Ionicons name="search-outline" size={20} color={TEXT_MUTED} style={styles.searchIcon} />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder={ov('classesSearchPlaceholder')}
                    placeholderTextColor={TEXT_MUTED}
                    accessibilityLabel={ov('classesSearchPlaceholder')}
                    style={styles.searchInput}
                  />
                  {searchQuery.length > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={ov('classesSearchClear')}
                      onPress={() => setSearchQuery('')}
                      hitSlop={8}
                      style={styles.searchClear}>
                      <Ionicons name="close-circle" size={20} color={TEXT_MUTED} />
                    </Pressable>
                  ) : null}
                </View>
              </>
            ) : null}
          </>
        ) : null}
      </View>
    );
  }, [
    loading,
    error,
    overview,
    allClasses,
    partialWarning,
    monthLabel,
    i18n.language,
    ov,
    showClassSearch,
    searchActive,
    searchQuery,
    showFinancial,
    showClasses,
    router,
  ]);

  const ListHeader = useMemo(() => ListHeaderInner, [ListHeaderInner]);

  const openGroupDetail = useCallback(
    (row: TeacherDashboardClassRow) => {
      router.push({
        pathname: '/teacher-dashboard/group-detail',
        params: {
          title: row.name,
          source: row.source,
          id: row.id,
        },
      } as never);
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: TeacherDashboardClassRow }) => (
      <ClassOverviewRow
        row={item}
        studentCountLabel={ov('studentCountLabel')}
        instituteBadge={t('teacherDashboard.groupsInstituteBadge')}
        personalBadge={t('teacherDashboard.groupsGroupClassBadge')}
        openGroupLabel={ov('openGroupA11y', { name: item.name })}
        onOpenGroup={() => openGroupDetail(item)}
      />
    ),
    [ov, t, openGroupDetail],
  );

  const keyExtractor = useCallback(
    (item: TeacherDashboardClassRow) => `${item.source}:${item.id}`,
    [],
  );

  const ItemSeparator = useCallback(() => <View style={styles.listSep} />, []);

  const ListEmpty = useMemo(() => {
    if (!showClasses || loading || error || !overview) return null;
    if (searchActive && displayedClasses.length === 0) {
      return (
        <View style={styles.emptyWrap}>
          <Ionicons name="search-outline" size={28} color={TEXT_MUTED} />
          <Text style={styles.emptyTitle}>{ov('classesSearchEmptyTitle')}</Text>
          <Text style={styles.emptyBody}>{ov('classesSearchEmptyBody')}</Text>
        </View>
      );
    }
    if (allClasses.length === 0) {
      return (
        <View style={styles.emptyWrap}>
          <Ionicons name="book-outline" size={28} color={TEXT_MUTED} />
          <Text style={styles.emptyTitle}>{ov('emptyClassesTitle')}</Text>
          <Text style={styles.emptyBody}>{ov('emptyClassesBody')}</Text>
        </View>
      );
    }
    return null;
  }, [showClasses, loading, error, overview, ov, searchActive, displayedClasses.length, allClasses.length]);

  return (
    <>
      <NativeFluidFlatList
        style={styles.flex1}
        data={!loading && !error && overview && showClasses ? displayedClasses : []}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={ItemSeparator}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: contentPaddingBottom },
          overview && showClasses && allClasses.length === 0 && !loading && !error
            ? styles.listContentEmpty
            : null,
        ]}
      />

    </>
  );
}

export default memo(TeacherDashboardOverviewSection);

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  listContentEmpty: { flexGrow: 1 },
  listSep: { height: 10 },
  loaderWrap: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  loaderHint: { fontSize: 14, color: TEXT_MUTED, fontWeight: '600' },
  errorBox: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    marginBottom: 8,
  },
  errorTitle: { fontSize: 14, fontWeight: '800', color: '#991B1B' },
  errorDetail: { marginTop: 6, fontSize: 12, color: '#7F1D1D' },
  retryBtn: { marginTop: 12, borderRadius: 12, alignSelf: 'flex-start' },
  retryBtnInner: {
    backgroundColor: BRAND_BLUE,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  retryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  headerBlock: { gap: 12, marginBottom: 14 },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickActionBtn: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  quickActionBtnInner: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  quickActionLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    flexShrink: 1,
  },
  partialWarn: {
    fontSize: 13,
    color: '#92400E',
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 10,
    fontWeight: '600',
    lineHeight: 18,
  },
  monthCaption: {
    fontSize: 13,
    fontWeight: '700',
    color: TEXT_MUTED,
    marginTop: 2,
  },
  financeBlock: {
    gap: 10,
    alignSelf: 'stretch',
  },
  financeRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: 10,
  },
  financeCard: {
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  financeCardHalf: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  financeCardInner: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
    width: '100%',
    minHeight: 88,
    justifyContent: 'space-between',
  },
  financeCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  financeCardTopHalf: {
    alignItems: 'flex-start',
  },
  financeCardLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '700',
    color: TEXT_MUTED,
    lineHeight: 16,
  },
  financeCardChevron: {
    marginLeft: 'auto',
    flexShrink: 0,
    marginTop: 1,
  },
  financeCardValue: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    fontFamily: FontFamily.bold,
    alignSelf: 'flex-start',
  },
  financeCardValueCompact: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
    fontFamily: FontFamily.bold,
    alignSelf: 'flex-start',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    marginTop: 6,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    paddingVertical: 4,
  },
  statBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    fontFamily: FontFamily.bold,
    lineHeight: 34,
  },
  classCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  classRowHeader: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  classRowHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    width: '100%',
  },
  classCardFooter: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: PAGE_SURFACE,
  },
  studentCountLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  studentCountValue: {
    fontSize: 20,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    fontFamily: FontFamily.bold,
    lineHeight: 26,
  },
  classIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PAGE_SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  classTextCol: { flex: 1, minWidth: 0, gap: 4 },
  className: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    lineHeight: 20,
  },
  classMeta: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontWeight: '600',
  },
  badgePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: BRAND_BLUE,
    textTransform: 'uppercase',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 18,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    backgroundColor: PAGE_SURFACE,
    paddingLeft: 40,
    paddingRight: 40,
    minHeight: 48,
    marginTop: -2,
  },
  searchIcon: { position: 'absolute', left: 12, zIndex: 1 },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: BRAND_BLUE_DARK,
    minHeight: 44,
    paddingVertical: 8,
  },
  searchClear: { position: 'absolute', right: 10, zIndex: 1 },
  searchHint: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontWeight: '600',
    lineHeight: 17,
  },
});
