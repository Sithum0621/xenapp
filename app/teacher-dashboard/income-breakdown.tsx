import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BrandHeader from '@/src/components/parent/BrandHeader';
import TeacherIncomeBreakdownView from '@/src/components/teacher/TeacherIncomeBreakdownView';
import { SessionCacheKeys } from '@/src/services/sessionDataCache';
import { useSessionCachedQuery } from '@/src/hooks/useSessionCachedQuery';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import {
  fetchTeacherDashboardOverview,
} from '@/src/services/teacherDashboardApi';
import { supabase } from '@/src/services/supabaseClient';
import { Text } from '@/src/theme/Text';
import { formatBillingMonthLabel } from '@/src/utils/classPaymentStatus';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const PAGE_BG = '#F8FAFC';

function firstNameFromFullName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export default function TeacherIncomeBreakdownScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const ov = (k: string, o?: Record<string, unknown>) => t(`teacherDashboard.overview.${k}`, o);

  const [headerUserName, setHeaderUserName] = useState<string | null>(null);

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
      setHeaderUserName(
        full ? firstNameFromFullName(full) : t('teacherDashboard.overview.teacherFallback'),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

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
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <BrandHeader
        helloPrefix={t('teacherDashboard.overview.helloPrefix')}
        userName={headerUserName}
      />

      <View style={styles.pageHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('auth.back')}
          onPress={goBack}
          style={({ pressed }) => [styles.backRow, pressed && styles.backRowPressed]}>
          <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
          <Text style={styles.backLabel}>{t('auth.back')}</Text>
        </Pressable>
        <Text style={styles.pageTitle}>{ov('incomeBreakdownTitle')}</Text>
      </View>

      <View style={styles.main}>{body}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  pageHeader: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 6,
    backgroundColor: PAGE_BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingRight: 8,
  },
  backRowPressed: { opacity: 0.7 },
  backLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
  },
  main: {
    flex: 1,
    paddingTop: 12,
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
    marginHorizontal: 18,
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
    fontWeight: '800',
    fontSize: 14,
  },
});
