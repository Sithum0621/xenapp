import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import DashboardScreenShell from '@/src/components/layout/DashboardScreenShell';
import TeacherIncomeBreakdownView from '@/src/components/teacher/TeacherIncomeBreakdownView';
import { useSessionCachedQuery } from '@/src/hooks/useSessionCachedQuery';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import { SessionCacheKeys } from '@/src/services/sessionDataCache';
import { fetchTeacherDashboardOverview } from '@/src/services/teacherDashboardApi';
import { Text } from '@/src/theme/Text';
import { PAGE_EDGE_INSET } from '@/src/theme/pageLayout';
import { formatBillingMonthLabel } from '@/src/utils/classPaymentStatus';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

const BRAND_BLUE = '#041830';
const TEXT_MUTED = '#64748B';

export default function TeacherIncomeBreakdownScreen() {
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
  const error = overviewResult?.error ?? queryError ?? null;

  const monthLabel = useMemo(() => {
    const billingMonth = overview?.billingMonth ?? new Date().toISOString().slice(0, 10);
    return formatBillingMonthLabel(billingMonth);
  }, [overview?.billingMonth]);

  const classes = overview?.classes ?? [];
  const totalCollectedCents = overview?.totalIncomeCents ?? 0;
  const totalDuePaymentCents = overview?.duePaymentCents ?? 0;
  const totalAmountToPayCents = overview?.amountToPayCents ?? 0;

  const goBack = useCallback(() => {
    routerBackOrReplace(router, appHref(AppRoutes.teacherDashboard));
  }, [router]);

  const body = useMemo(() => {
    if (loading && !overview) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={BRAND_BLUE} />
          <Text style={styles.muted}>{ov('loading')}</Text>
        </View>
      );
    }

    if (error || !overview) {
      return (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>{ov('loadError')}</Text>
          <Text style={styles.errorDetail}>{error ?? ov('loadError')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => refresh(true)}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}>
            <Text style={styles.retryBtnText}>{ov('retry')}</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <TeacherIncomeBreakdownView
        monthLabel={monthLabel}
        classes={classes}
        totalCollectedCents={totalCollectedCents}
        totalDuePaymentCents={totalDuePaymentCents}
        totalAmountToPayCents={totalAmountToPayCents}
      />
    );
  }, [
    loading,
    overview,
    error,
    monthLabel,
    classes,
    totalCollectedCents,
    totalDuePaymentCents,
    totalAmountToPayCents,
    ov,
    refresh,
  ]);

  return (
    <DashboardScreenShell
      showBack
      title={ov('incomeBreakdownTitle')}
      onBack={goBack}
      edges={['top', 'left', 'right', 'bottom']}
      padContent={false}>
      <View style={styles.main}>{body}</View>
    </DashboardScreenShell>
  );
}

const styles = StyleSheet.create({
  main: {
    flex: 1,
    paddingTop: 4,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
  },
  muted: {
    fontSize: 14,
    color: TEXT_MUTED,
    fontWeight: '600',
  },
  errorBox: {
    marginHorizontal: PAGE_EDGE_INSET,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    gap: 8,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#991B1B',
  },
  errorDetail: {
    fontSize: 13,
    color: '#7F1D1D',
  },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: BRAND_BLUE,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryBtnPressed: { opacity: 0.9 },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
