import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { Text } from '@/src/theme/Text';
import type { AdminDashboardGrowth, AdminDashboardGrowthPeriod } from '@/src/services/instituteAdminDashboardApi';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const SUBTLE_BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const CHART_HEIGHT = 120;
const PADDING = 8;

type Props = {
  growth: AdminDashboardGrowth | null;
  loading: boolean;
  error: string | null;
  period: AdminDashboardGrowthPeriod;
  onPeriodChange: (period: AdminDashboardGrowthPeriod) => void;
  onRetry: () => void;
};

function buildPolyline(values: number[], plotWidth: number, plotHeight: number, maxY: number): string {
  if (values.length === 0) return '';
  const step = values.length > 1 ? plotWidth / (values.length - 1) : 0;
  const xCenter = plotWidth / 2;
  return values
    .map((value, index) => {
      const x = values.length > 1 ? index * step : xCenter;
      const ratio = maxY > 0 ? value / maxY : 0;
      const y = plotHeight - ratio * plotHeight;
      return `${x},${y}`;
    })
    .join(' ');
}

function MiniChart({
  color,
  values,
  labels,
  emptyLabel,
}: {
  color: string;
  values: number[];
  labels: string[];
  emptyLabel: string;
}) {
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(220, Math.min(width - 64, 520));
  const plotWidth = chartWidth - PADDING * 2;
  const plotHeight = CHART_HEIGHT - PADDING * 2;
  const maxY = Math.max(...values, 1);
  const points = buildPolyline(values, plotWidth, plotHeight, maxY);
  const hasData = values.some((v) => v > 0);

  return (
    <View style={styles.chartWrap}>
      {!hasData ? (
        <Text style={styles.chartEmpty}>{emptyLabel}</Text>
      ) : (
        <Svg width={chartWidth} height={CHART_HEIGHT}>
          <Polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            translateX={PADDING}
            translateY={PADDING}
          />
          {values.map((value, index) => {
            const step = values.length > 1 ? plotWidth / (values.length - 1) : 0;
            const x = (values.length > 1 ? index * step : plotWidth / 2) + PADDING;
            const ratio = maxY > 0 ? value / maxY : 0;
            const y = plotHeight - ratio * plotHeight + PADDING;
            return <Circle key={`${labels[index] ?? index}-${value}`} cx={x} cy={y} r={3.5} fill={color} />;
          })}
        </Svg>
      )}
      {labels.length > 0 ? (
        <View style={styles.labelRow}>
          {labels.map((label, i) => (
            <Text key={`${label}-${i}`} style={styles.labelChip} numberOfLines={1}>
              {label}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function AdminDashboardGrowthChart({
  growth,
  loading,
  error,
  period,
  onPeriodChange,
  onRetry,
}: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const [series, setSeries] = useState<'enrollments' | 'attendance'>('enrollments');

  const enrollmentTotal = useMemo(
    () => (growth?.enrollments ?? []).reduce((a, b) => a + b, 0),
    [growth?.enrollments],
  );

  const avgAttendance = useMemo(() => {
    const vals = growth?.attendancePct ?? [];
    if (vals.length === 0) return 0;
    const sum = vals.reduce((a, b) => a + b, 0);
    return Math.round((sum / vals.length) * 10) / 10;
  }, [growth?.attendancePct]);

  const periodLabel =
    period === 'week' ? t('adminPortal.dashboardGrowthWeek') : t('adminPortal.dashboardGrowthMonth');

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.sectionTitle}>{t('adminPortal.dashboardGrowthTitle')}</Text>
          <Text style={styles.sectionHint}>{t('adminPortal.dashboardGrowthHint')}</Text>
        </View>
        <View style={styles.periodRow}>
          {(['week', 'month'] as AdminDashboardGrowthPeriod[]).map((p) => (
            <Pressable
              key={p}
              accessibilityRole="button"
              accessibilityState={{ selected: period === p }}
              onPress={() => onPeriodChange(p)}
              style={[styles.periodBtn, period === p && styles.periodBtnActive]}>
              <Text style={[styles.periodBtnText, period === p && styles.periodBtnTextActive]}>
                {p === 'week' ? t('adminPortal.dashboardGrowthWeek') : t('adminPortal.dashboardGrowthMonth')}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.seriesToggleRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: series === 'enrollments' }}
          onPress={() => setSeries('enrollments')}
          style={[styles.seriesChip, series === 'enrollments' && styles.seriesChipActive]}>
          <Text style={[styles.seriesChipText, series === 'enrollments' && styles.seriesChipTextActive]}>
            {t('adminPortal.dashboardGrowthEnrollments')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: series === 'attendance' }}
          onPress={() => setSeries('attendance')}
          style={[styles.seriesChip, series === 'attendance' && styles.seriesChipActive]}>
          <Text style={[styles.seriesChipText, series === 'attendance' && styles.seriesChipTextActive]}>
            {t('adminPortal.dashboardGrowthAttendance')}
          </Text>
        </Pressable>
      </View>

      {loading && !growth ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={BRAND_BLUE} size="small" />
        </View>
      ) : error && !growth ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{t('adminPortal.dashboardGrowthError')}</Text>
          <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t('adminPortal.dashboardRetry')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.panelRow, isWide && styles.panelRowWide]}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>
              {series === 'enrollments'
                ? t('adminPortal.dashboardGrowthEnrollmentsTotal', { period: periodLabel })
                : t('adminPortal.dashboardGrowthAttendanceAvg', { period: periodLabel })}
            </Text>
            <Text style={styles.summaryValue}>
              {series === 'enrollments' ? enrollmentTotal : `${avgAttendance}%`}
            </Text>
          </View>
          <View style={styles.chartCard}>
            <MiniChart
              color={series === 'enrollments' ? '#047857' : BRAND_BLUE}
              values={series === 'enrollments' ? (growth?.enrollments ?? []) : (growth?.attendancePct ?? [])}
              labels={growth?.labels ?? []}
              emptyLabel={t('adminPortal.dashboardGrowthEmpty')}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 8, width: '100%' },
  headerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  headerText: { flex: 1, minWidth: 180 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    marginBottom: 4,
  },
  sectionHint: { fontSize: 13, color: TEXT_MUTED, lineHeight: 18 },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  periodBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#FFFFFF',
  },
  periodBtnActive: {
    borderColor: BRAND_BLUE,
    backgroundColor: '#EFF6FF',
  },
  periodBtnText: { fontSize: 13, fontWeight: '700', color: TEXT_MUTED },
  periodBtnTextActive: { color: BRAND_BLUE_DARK },
  seriesToggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  seriesChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#F8FAFC',
  },
  seriesChipActive: {
    borderColor: BRAND_BLUE,
    backgroundColor: '#EFF6FF',
  },
  seriesChipText: { fontSize: 13, fontWeight: '700', color: TEXT_MUTED },
  seriesChipTextActive: { color: BRAND_BLUE_DARK },
  panelRow: { gap: 12 },
  panelRowWide: { flexDirection: 'row', alignItems: 'stretch' },
  summaryCard: {
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 16,
    minWidth: 140,
  },
  summaryLabel: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED, marginBottom: 8 },
  summaryValue: { fontSize: 28, fontWeight: '800', color: BRAND_BLUE_DARK },
  chartCard: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 12,
    minWidth: 0,
  },
  chartWrap: { alignItems: 'center' },
  chartEmpty: { fontSize: 13, color: TEXT_MUTED, paddingVertical: 24, textAlign: 'center' },
  labelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 4,
    marginTop: 8,
    width: '100%',
  },
  labelChip: { fontSize: 10, color: TEXT_MUTED, flexShrink: 1 },
  centerBox: { paddingVertical: 24, alignItems: 'center' },
  errorBox: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    gap: 10,
  },
  errorText: { fontSize: 13, fontWeight: '600', color: '#B91C1C' },
  retryBtn: { alignSelf: 'flex-start' },
  retryText: { fontSize: 13, fontWeight: '700', color: BRAND_BLUE },
});
