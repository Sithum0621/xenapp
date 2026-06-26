import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';

import { NativeFluidFlatList } from '@/src/components/layout/NativeFluidFlatList';

import AdminDashboardActivityFeed from '@/src/components/admin/AdminDashboardActivityFeed';
import AdminDashboardGrowthChart from '@/src/components/admin/AdminDashboardGrowthChart';
import AdminDashboardStatsCards from '@/src/components/admin/AdminDashboardStatsCards';
import AdminDashboardTodaySchedule from '@/src/components/admin/AdminDashboardTodaySchedule';
import { useAdminLayout } from '@/src/hooks/useAdminLayout';
import {
  fetchAdminDashboardActivity,
  fetchAdminDashboardGrowth,
  fetchAdminDashboardStats,
  fetchAdminDashboardTodaySchedule,
  type AdminDashboardActivityItem,
  type AdminDashboardGrowth,
  type AdminDashboardGrowthPeriod,
  type AdminDashboardScheduleItem,
  type AdminDashboardStats,
} from '@/src/services/instituteAdminDashboardApi';
import { Text } from '@/src/theme/Text';
import { appBrandBlue, appBrandBlueDark, appInfoBanner, appTextMuted } from '@/src/theme/appBrandPalette';

const BRAND_BLUE = appBrandBlue;
const BRAND_BLUE_DARK = appBrandBlueDark;
const TEXT_MUTED = appTextMuted;
const WIDE_BREAKPOINT = 960;

export default function AdminDashboardHomeScreen() {
  const { t } = useTranslation();
  const { isCompact, contentPadding } = useAdminLayout();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [schedule, setSchedule] = useState<AdminDashboardScheduleItem[]>([]);
  const [activity, setActivity] = useState<AdminDashboardActivityItem[]>([]);
  const [growth, setGrowth] = useState<AdminDashboardGrowth | null>(null);
  const [growthPeriod, setGrowthPeriod] = useState<AdminDashboardGrowthPeriod>('week');
  const [statsError, setStatsError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [growthError, setGrowthError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (period: AdminDashboardGrowthPeriod) => {
    const [statsRes, scheduleRes, activityRes, growthRes] = await Promise.all([
      fetchAdminDashboardStats(),
      fetchAdminDashboardTodaySchedule(),
      fetchAdminDashboardActivity(),
      fetchAdminDashboardGrowth(period),
    ]);

    setStats(statsRes.stats);
    setStatsError(statsRes.error);
    setSchedule(scheduleRes.items);
    setScheduleError(scheduleRes.error);
    setActivity(activityRes.items);
    setActivityError(activityRes.error);
    setGrowth(growthRes.growth);
    setGrowthError(growthRes.error);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await loadDashboard(growthPeriod);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [growthPeriod, loadDashboard]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDashboard(growthPeriod);
    setRefreshing(false);
  }, [growthPeriod, loadDashboard]);

  const onGrowthPeriodChange = (period: AdminDashboardGrowthPeriod) => {
    setGrowthPeriod(period);
  };

  const rpcMissing =
    statsError === 'rpc_missing' ||
    scheduleError === 'rpc_missing' ||
    activityError === 'rpc_missing' ||
    growthError === 'rpc_missing';

  return (
    <NativeFluidFlatList
      style={styles.scroll}
      data={[]}
      renderItem={() => null}
      keyExtractor={() => 'admin-dashboard-home'}
      contentContainerStyle={[styles.content, contentPadding]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={BRAND_BLUE} />
      }
      ListHeaderComponent={
        <>
          {!isCompact ? (
            <>
              <Text style={styles.title}>{t('adminPortal.dashboardTitle')}</Text>
              <Text style={styles.subtitle}>{t('adminPortal.dashboardSubtitle')}</Text>
            </>
          ) : (
            <Text style={styles.subtitleCompact}>{t('adminPortal.dashboardSubtitle')}</Text>
          )}

          {rpcMissing ? (
            <View style={styles.migrationBanner}>
              <Text style={styles.migrationText}>{t('adminPortal.dashboardMigrationHint')}</Text>
            </View>
          ) : null}

          <AdminDashboardStatsCards stats={stats} loading={loading} error={statsError} />

          <View style={[styles.columns, isWide && styles.columnsWide]}>
            <View style={styles.primaryCol}>
              <AdminDashboardTodaySchedule items={schedule} loading={loading} error={scheduleError} />
              <AdminDashboardGrowthChart
                growth={growth}
                loading={loading}
                error={growthError}
                period={growthPeriod}
                onPeriodChange={onGrowthPeriodChange}
                onRetry={() => void loadDashboard(growthPeriod)}
              />
            </View>
            <View style={styles.secondaryCol}>
              <AdminDashboardActivityFeed items={activity} loading={loading} error={activityError} />
            </View>
          </View>
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: '100%',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: TEXT_MUTED,
    lineHeight: 24,
    marginBottom: 20,
  },
  subtitleCompact: {
    fontSize: 15,
    color: TEXT_MUTED,
    lineHeight: 22,
    marginBottom: 16,
  },
  migrationBanner: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: appInfoBanner.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: appInfoBanner.border,
    marginBottom: 16,
  },
  migrationText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: appInfoBanner.text,
    lineHeight: 19,
  },
  columns: { gap: 0, width: '100%' },
  columnsWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
  },
  primaryCol: { flex: 1.4, minWidth: 0 },
  secondaryCol: { flex: 1, minWidth: 0 },
});
