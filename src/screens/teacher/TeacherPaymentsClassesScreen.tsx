import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppScrollView } from '@/src/components/layout/AppScrollView';
import BrandHeader from '@/src/components/parent/BrandHeader';
import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';
import { useSessionCachedQuery } from '@/src/hooks/useSessionCachedQuery';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import { SessionCacheKeys } from '@/src/services/sessionDataCache';
import {
  fetchTeacherDashboardOverview,
  type TeacherDashboardClassRow,
} from '@/src/services/teacherDashboardApi';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const PAGE_BG = '#F8FAFC';

function classMatchesQuery(row: TeacherDashboardClassRow, q: string): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return (
    row.name.toLowerCase().includes(n) ||
    (row.instituteName ?? '').toLowerCase().includes(n)
  );
}

export default function TeacherPaymentsClassesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const p = (k: string, o?: Record<string, unknown>) => t(`teacherDashboard.paymentsClasses.${k}`, o);

  const [searchQuery, setSearchQuery] = useState('');

  const { data, loading, error, refresh } = useSessionCachedQuery(
    SessionCacheKeys.TEACHER_DASHBOARD_OVERVIEW,
    () => fetchTeacherDashboardOverview(),
    { shouldCache: (res) => res.overview != null && !res.error },
  );

  const overview = data?.overview ?? null;
  const loadError = data?.error ?? error;

  const filteredClasses = useMemo(() => {
    if (!overview) return [];
    return overview.classes.filter((c) => classMatchesQuery(c, searchQuery));
  }, [overview, searchQuery]);

  const openCollect = (row: TeacherDashboardClassRow) => {
    router.push({
      pathname: appHref(AppRoutes.teacherCollectPayment) as '/teacher-dashboard/collect-payment',
      params: {
        groupId: row.id,
        groupSource: row.source,
        groupName: row.name,
      },
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <BrandHeader helloPrefix={t('teacherDashboard.overview.helloPrefix')} userName={null} />

      <View style={styles.pageHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('auth.back')}
          onPress={() => routerBackOrReplace(router, appHref(AppRoutes.teacherDashboard))}
          style={({ pressed }) => [styles.backRow, pressed && styles.backRowPressed]}>
          <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
          <Text style={styles.backLabel}>{t('auth.back')}</Text>
        </Pressable>
        <Text style={styles.pageTitle}>{p('title')}</Text>
        <Text style={styles.pageSubtitle}>{p('subtitle')}</Text>
      </View>

      <AppScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={20} color={TEXT_MUTED} style={styles.searchIcon} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={p('searchPlaceholder')}
            placeholderTextColor={TEXT_MUTED}
            style={styles.searchInput}
          />
        </View>

        {loading && !overview ? (
          <View style={styles.centered}>
            <ActivityIndicator color={BRAND_BLUE} />
            <Text style={styles.muted}>{p('loading')}</Text>
          </View>
        ) : loadError || !overview ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{loadError ?? p('loadError')}</Text>
            <Pressable onPress={() => refresh(true)} style={styles.retryBtn}>
              <Text style={styles.retryText}>{p('retry')}</Text>
            </Pressable>
          </View>
        ) : filteredClasses.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="school-outline" size={28} color={TEXT_MUTED} />
            <Text style={styles.emptyText}>
              {searchQuery.trim() ? p('emptySearch') : p('empty')}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filteredClasses.map((row) => (
              <ScrollFriendlyPressable
                key={`${row.source}:${row.id}`}
                accessibilityRole="button"
                accessibilityLabel={p('openClassA11y', { name: row.name })}
                onPress={() => openCollect(row)}
                style={styles.classCard}
                innerStyle={styles.classCardInner}>
                <View style={styles.classIconWrap}>
                  <Ionicons
                    name={row.source === 'institute' ? 'business-outline' : 'people-outline'}
                    size={20}
                    color={BRAND_BLUE}
                  />
                </View>
                <View style={styles.classMain}>
                  <Text style={styles.className} numberOfLines={2}>
                    {row.name}
                  </Text>
                  {row.instituteName ? (
                    <Text style={styles.classMeta} numberOfLines={1}>
                      {row.instituteName}
                    </Text>
                  ) : null}
                  <Text style={styles.classStats}>
                    {p('studentsCount', { count: row.studentCount })}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
              </ScrollFriendlyPressable>
            ))}
          </View>
        )}
      </AppScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAGE_BG },
  pageHeader: { paddingHorizontal: 18, paddingBottom: 12, gap: 4 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  backRowPressed: { opacity: 0.7 },
  backLabel: { fontSize: 16, fontWeight: '600', color: BRAND_BLUE_DARK },
  pageTitle: { fontSize: 22, fontWeight: '800', color: BRAND_BLUE_DARK },
  pageSubtitle: { fontSize: 14, color: TEXT_MUTED, lineHeight: 20 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 32, gap: 12 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16 },
  centered: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  muted: { color: TEXT_MUTED, fontWeight: '600' },
  errorBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    gap: 10,
  },
  errorText: { color: '#991B1B', fontWeight: '600' },
  retryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: BRAND_BLUE,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
  emptyBox: { alignItems: 'center', padding: 32, gap: 10 },
  emptyText: { color: TEXT_MUTED, textAlign: 'center', lineHeight: 20 },
  list: { gap: 10 },
  classCard: { borderRadius: 14 },
  classCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
  },
  classIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(18, 59, 122, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  classMain: { flex: 1, gap: 2 },
  className: { fontSize: 15, fontWeight: '800', color: BRAND_BLUE_DARK },
  classMeta: { fontSize: 13, color: TEXT_MUTED },
  classStats: { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },
});
