import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { fetchGroupStats } from '@/src/services/teacherGroupWorkspaceApi';
import type { TeacherGroupRouteContext } from '@/src/utils/teacherGroupRouteParams';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const BORDER = '#E2E8F0';
const PAGE_SURFACE = '#F8FAFC';
const TEXT_MUTED = '#64748B';
const GREEN_OK = '#15803D';
const AMBER = '#D97706';

type Props = { ctx: TeacherGroupRouteContext };

export default function TeacherGroupStatsPanel({ ctx }: Props) {
  const { t, i18n } = useTranslation();
  const gd = (k: string, o?: Record<string, unknown>) => t(`teacherDashboard.groupDetail.${k}`, o);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalStudents, setTotalStudents] = useState(0);
  const [todayAttendance, setTodayAttendance] = useState(0);
  const [collectedCents, setCollectedCents] = useState(0);
  const [pendingCents, setPendingCents] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { stats, error: err } = await fetchGroupStats(ctx);
    if (err) {
      setError(err);
      setLoading(false);
      return;
    }
    setTotalStudents(stats.totalStudents);
    setTodayAttendance(stats.todayAttendancePresent);
    setCollectedCents(stats.collectedCents);
    setPendingCents(stats.pendingCents);
    setLoading(false);
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  const formatMoney = (cents: number) =>
    new Intl.NumberFormat(i18n.language === 'si' ? 'si-LK' : i18n.language === 'ta' ? 'ta-LK' : 'en-LK', {
      maximumFractionDigits: 0,
    }).format(Math.round(cents / 100));

  const paymentTotal = collectedCents + pendingCents;
  const collectedRatio =
    paymentTotal > 0 ? Math.round((collectedCents / paymentTotal) * 1000) / 10 : 0;

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={BRAND_BLUE} />
        <Text style={styles.loaderText}>{gd('workspaceLoading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorBox}>
        <Text style={styles.errorTitle}>{gd('workspaceError')}</Text>
        <Text style={styles.errorDetail}>{error}</Text>
        <Pressable onPress={() => void load()} style={({ pressed }) => [styles.retry, pressed && { opacity: 0.9 }]}>
          <Text style={styles.retryText}>{gd('workspaceRetry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.body}>
      <View style={styles.statsGrid}>
        <View style={styles.statMini}>
          <Ionicons name="people" size={20} color={BRAND_BLUE} />
          <Text style={styles.statMiniValue}>{totalStudents}</Text>
          <Text style={styles.statMiniLabel}>{gd('totalStudents')}</Text>
        </View>
        <View style={styles.statMini}>
          <Ionicons name="checkmark-done" size={20} color={GREEN_OK} />
          <Text style={styles.statMiniValue}>{todayAttendance}</Text>
          <Text style={styles.statMiniLabel}>{gd('todayAttendance')}</Text>
        </View>
      </View>

      <Text style={styles.blockLabel}>{gd('monthlyPayments')}</Text>
      <View style={styles.paySummary}>
        <View style={styles.payRow}>
          <Text style={styles.payRowLabel}>{gd('amountCollected')}</Text>
          <Text style={[styles.payRowValue, { color: GREEN_OK }]}>Rs. {formatMoney(collectedCents)}</Text>
        </View>
        <View style={styles.payRow}>
          <Text style={styles.payRowLabel}>{gd('amountPending')}</Text>
          <Text style={[styles.payRowValue, { color: AMBER }]}>Rs. {formatMoney(pendingCents)}</Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${collectedRatio}%` }]} />
      </View>
      <Text style={styles.progressCaption}>{gd('collectedShare', { pct: String(collectedRatio) })}</Text>

      <View style={styles.miniBars}>
        <View style={styles.miniBarCol}>
          <Text style={styles.miniBarLabel}>{gd('chartCollected')}</Text>
          <View style={styles.miniBarTrack}>
            <View
              style={[
                styles.miniBarFillOnly,
                {
                  width: `${paymentTotal ? (collectedCents / paymentTotal) * 100 : 0}%`,
                  backgroundColor: '#22C55E',
                },
              ]}
            />
          </View>
        </View>
        <View style={styles.miniBarCol}>
          <Text style={styles.miniBarLabel}>{gd('chartPending')}</Text>
          <View style={styles.miniBarTrack}>
            <View
              style={[
                styles.miniBarFillOnly,
                {
                  width: `${paymentTotal ? (pendingCents / paymentTotal) * 100 : 0}%`,
                  backgroundColor: '#FBBF24',
                },
              ]}
            />
          </View>
        </View>
      </View>

      <Text style={styles.demoHint}>{gd('statsLiveHint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: 0 },
  loader: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 10,
  },
  loaderText: { fontSize: 14, color: TEXT_MUTED, fontWeight: '600' },
  errorBox: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  errorTitle: { fontSize: 14, fontWeight: '800', color: '#991B1B' },
  errorDetail: { marginTop: 6, fontSize: 12, color: '#7F1D1D' },
  retry: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: BRAND_BLUE,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statMini: {
    flex: 1,
    backgroundColor: PAGE_SURFACE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    gap: 4,
  },
  statMiniValue: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
  },
  statMiniLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_MUTED,
  },
  blockLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    marginBottom: 8,
  },
  paySummary: { gap: 8, marginBottom: 10 },
  payRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  payRowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    flexShrink: 1,
  },
  payRowValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: BRAND_BLUE,
  },
  progressCaption: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_MUTED,
  },
  miniBars: {
    marginTop: 14,
    gap: 10,
  },
  miniBarCol: { gap: 4 },
  miniBarLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  miniBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  miniBarFillOnly: {
    height: '100%',
    borderRadius: 4,
    minWidth: 4,
  },
  demoHint: {
    marginTop: 12,
    fontSize: 12,
    color: TEXT_MUTED,
    fontWeight: '600',
    fontStyle: 'italic',
    lineHeight: 17,
  },
});
