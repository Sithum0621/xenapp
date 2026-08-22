import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { TextInput } from '@/src/theme/TextInput';

import { NativeFluidFlatList } from '@/src/components/layout/NativeFluidFlatList';
import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';
import TeacherCreatePersonalClassModal from '@/src/components/teacher/TeacherCreatePersonalClassModal';
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
import { PAGE_CONTENT_TOP, PAGE_EDGE_INSET } from '@/src/theme/pageLayout';
import { appSurface } from '@/src/theme/appBrandPalette';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const BORDER = '#E2E8F0';
const PAGE_SURFACE = '#F8FAFC';
const TEXT_MUTED = '#64748B';
const STUDENT_ACCENT = '#2563EB';
const STUDENT_TINT = '#EFF6FF';
const CLASS_ACCENT = '#15803D';
const CLASS_TINT = '#F0FDF4';
const PAPER_ACCENT = '#6D28D9';
const PAPER_TINT = '#F5F3FF';
const MAX_VISIBLE_CLASSES = 3;

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
  /** `overview` — home actions and today schedule; `classes` — class list and search */
  variant?: 'overview' | 'classes';
  onOpenClasses?: () => void;
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
  onOpenClasses,
}: TeacherDashboardOverviewSectionProps) {
  const router = useRouter();
  const { t } = useTranslation();
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
  const [createModalVisible, setCreateModalVisible] = useState(false);

  const allClasses = overview?.classes ?? [];
  const showClassSearch = allClasses.length > 0;
  const searchActive = searchQuery.trim().length > 0;
  const hasMoreThanPreview = allClasses.length > MAX_VISIBLE_CLASSES;

  const showHomeOverview = variant === 'overview';
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
    if (showHomeOverview) {
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

          <View style={styles.homeStatsRow}>
            <View style={[styles.homeStatCard, { backgroundColor: STUDENT_TINT, borderColor: '#BFDBFE' }]}>
              <View style={styles.homeStatCardTop}>
                <View style={[styles.homeStatIconWrap, { backgroundColor: '#DBEAFE' }]}>
                  <Ionicons name="people-outline" size={18} color={STUDENT_ACCENT} />
                </View>
                <Text style={styles.homeStatLabel}>{ov('totalStudentsLabel')}</Text>
              </View>
              <Text style={[styles.homeStatValue, { color: STUDENT_ACCENT }]}>{overview.totalStudents}</Text>
            </View>
            <View style={[styles.homeStatCard, { backgroundColor: CLASS_TINT, borderColor: '#BBF7D0' }]}>
              <View style={styles.homeStatCardTop}>
                <View style={[styles.homeStatIconWrap, { backgroundColor: '#DCFCE7' }]}>
                  <Ionicons name="book-outline" size={18} color={CLASS_ACCENT} />
                </View>
                <Text style={styles.homeStatLabel}>{ov('totalClassesLabel')}</Text>
              </View>
              <Text style={[styles.homeStatValue, { color: CLASS_ACCENT }]}>{allClasses.length}</Text>
            </View>
          </View>

          <ScrollFriendlyPressable
            accessibilityRole="button"
            accessibilityLabel={ov('homeActionMyClassesA11y')}
            onPress={() => onOpenClasses?.()}
            style={styles.primaryActionBtnFull}
            innerStyle={styles.primaryActionBtnInner}>
            <Ionicons name="book-outline" size={20} color={BRAND_BLUE} />
            <View style={styles.primaryActionTextCol}>
              <Text style={styles.primaryActionLabel}>{ov('homeActionMyClasses')}</Text>
              <Text style={styles.primaryActionHint}>{ov('homeActionMyClassesHint')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
          </ScrollFriendlyPressable>

          <View style={styles.quickActionsRow}>
            <ScrollFriendlyPressable
              accessibilityRole="button"
              accessibilityLabel={ov('ownClassCardsButtonA11y')}
              onPress={() => router.push(appHref(AppRoutes.teacherClassCards))}
              style={styles.quickActionBtn}
              innerStyle={styles.quickActionBtnInner}>
              <Ionicons name="id-card-outline" size={20} color={BRAND_BLUE} />
              <Text style={styles.quickActionLabel}>{ov('ownClassCardsButton')}</Text>
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

          <ScrollFriendlyPressable
            accessibilityRole="button"
            accessibilityLabel={ov('createDigitalPapersButtonA11y')}
            onPress={() => router.push(appHref(AppRoutes.teacherDigitalPapers))}
            style={styles.digitalPaperBtn}
            innerStyle={styles.digitalPaperBtnInner}>
            <View style={styles.digitalPaperIconWrap}>
              <Ionicons name="document-text-outline" size={20} color={PAPER_ACCENT} />
            </View>
            <View style={styles.primaryActionTextCol}>
              <Text style={styles.digitalPaperLabel}>{ov('createDigitalPapersButton')}</Text>
              <Text style={styles.digitalPaperHint}>{ov('createDigitalPapersHint')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
          </ScrollFriendlyPressable>

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
            <View style={styles.classesHeaderRow}>
              <Text style={[styles.sectionTitle, styles.classesHeaderTitle]}>{ov('classesTitle')}</Text>
              <ScrollFriendlyPressable
                accessibilityRole="button"
                accessibilityLabel={t('teacherDashboard.chatsCreateClass')}
                onPress={() => setCreateModalVisible(true)}
                style={styles.createChip}
                innerStyle={styles.createChipInner}>
                <Ionicons name="add" size={18} color={appSurface} />
                <Text style={styles.createChipText}>{t('teacherDashboard.chatsCreateClass')}</Text>
              </ScrollFriendlyPressable>
            </View>

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
    ov,
    t,
    showClassSearch,
    searchActive,
    searchQuery,
    showHomeOverview,
    showClasses,
    router,
    onOpenClasses,
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
          <ScrollFriendlyPressable
            accessibilityRole="button"
            onPress={() => setCreateModalVisible(true)}
            style={styles.emptyCreateBtn}
            innerStyle={styles.emptyCreateBtnInner}>
            <Ionicons name="add" size={18} color={appSurface} />
            <Text style={styles.emptyCreateBtnText}>{t('teacherDashboard.chatsCreateClass')}</Text>
          </ScrollFriendlyPressable>
        </View>
      );
    }
    return null;
  }, [showClasses, loading, error, overview, ov, t, searchActive, displayedClasses.length, allClasses.length]);

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

      {showClasses ? (
        <TeacherCreatePersonalClassModal
          visible={createModalVisible}
          onClose={() => setCreateModalVisible(false)}
          onCreated={() => refresh(true)}
        />
      ) : null}
    </>
  );
}

export default memo(TeacherDashboardOverviewSection);

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  listContent: {
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: PAGE_CONTENT_TOP,
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
  homeStatsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  homeStatCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },
  homeStatCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  homeStatIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeStatLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    lineHeight: 14,
  },
  homeStatValue: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    fontFamily: FontFamily.bold,
  },
  primaryActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryActionBtnFull: {
    alignSelf: 'stretch',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  primaryActionBtn: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  primaryActionBtnInner: {
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  primaryActionTextCol: { flex: 1, minWidth: 0, gap: 4 },
  primaryActionLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    lineHeight: 18,
  },
  primaryActionHint: {
    fontSize: 11,
    fontWeight: '600',
    color: TEXT_MUTED,
    lineHeight: 15,
  },
  digitalPaperBtn: {
    alignSelf: 'stretch',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    backgroundColor: PAPER_TINT,
    overflow: 'hidden',
  },
  digitalPaperBtnInner: {
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  digitalPaperIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitalPaperLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: PAPER_ACCENT,
    lineHeight: 20,
  },
  digitalPaperHint: {
    fontSize: 11,
    fontWeight: '600',
    color: TEXT_MUTED,
    lineHeight: 15,
  },
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
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    marginTop: 6,
  },
  classesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 6,
  },
  classesHeaderTitle: {
    marginTop: 0,
    flex: 1,
    minWidth: 0,
  },
  createChip: { borderRadius: 999 },
  createChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BRAND_BLUE,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  createChipText: { color: appSurface, fontWeight: '800', fontSize: 13 },
  emptyCreateBtn: { marginTop: 10, borderRadius: 999 },
  emptyCreateBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND_BLUE,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
  },
  emptyCreateBtnText: { color: appSurface, fontWeight: '800', fontSize: 14 },
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
    backgroundColor: '#E3F2FD',
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
