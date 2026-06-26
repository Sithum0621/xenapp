import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { Text } from '@/src/theme/Text';
import type {
  GrowthPeriod,
  SuperadminDashboardGrowth,
  SuperadminDashboardStatKey,
} from '@/src/services/superadminDashboardApi';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const PAGE_BG = '#FFFFFF';
const SUBTLE_BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';

/** Match Super Admin desktop shell (`Dashboard.tsx`). */
const DESKTOP_ROW_BREAKPOINT = 960;
const GRID_GAP = 10;
const CHART_HEIGHT = 140;
const PADDING_LEFT = 6;
const PADDING_RIGHT = 8;
const PADDING_TOP = 10;
const PADDING_BOTTOM = 6;

export const GROWTH_SERIES_META: {
  key: SuperadminDashboardStatKey;
  color: string;
  bg: string;
  labelKey:
    | 'superAdmin.dashboardStatTeachers'
    | 'superAdmin.dashboardStatInstitutes'
    | 'superAdmin.dashboardStatAdmins'
    | 'superAdmin.dashboardStatStudents';
}[] = [
  {
    key: 'teachers',
    color: '#123B7A',
    bg: '#EFF6FF',
    labelKey: 'superAdmin.dashboardStatTeachers',
  },
  {
    key: 'institutes',
    color: '#5B21B6',
    bg: '#F5F3FF',
    labelKey: 'superAdmin.dashboardStatInstitutes',
  },
  {
    key: 'admins',
    color: '#B45309',
    bg: '#FFFBEB',
    labelKey: 'superAdmin.dashboardStatAdmins',
  },
  {
    key: 'students',
    color: '#047857',
    bg: '#ECFDF5',
    labelKey: 'superAdmin.dashboardStatStudents',
  },
];

type Props = {
  period: GrowthPeriod;
  onPeriodChange: (period: GrowthPeriod) => void;
  growth: SuperadminDashboardGrowth | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  formatCount: (n: number) => string;
};

type SeriesPanelProps = {
  color: string;
  bg: string;
  label: string;
  values: number[];
  labels: string[];
  emptyLabel: string;
  countText: string;
  pctText: string;
  pctPositive: boolean;
  pctNegative: boolean;
  layout: 'stack' | 'row';
};

function formatGrowthPct(pct: number): string {
  if (!Number.isFinite(pct) || pct === 0) return '0%';
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}%`;
}

function buildPolylinePoints(
  values: number[],
  plotWidth: number,
  plotHeight: number,
  maxY: number,
): string {
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

function GrowthSeriesPanel({
  color,
  bg,
  label,
  values,
  labels,
  emptyLabel,
  countText,
  pctText,
  pctPositive,
  pctNegative,
  layout,
}: SeriesPanelProps) {
  const [chartInnerWidth, setChartInnerWidth] = useState(220);
  const maxY = useMemo(() => Math.max(...values, 1), [values]);
  const plotWidth = Math.max(chartInnerWidth - PADDING_LEFT - PADDING_RIGHT, 32);
  const plotHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const svgWidth = chartInnerWidth;
  const hasData = values.some((v) => v > 0);
  const points = buildPolylinePoints(values, plotWidth, plotHeight, maxY);
  const step = values.length > 1 ? plotWidth / (values.length - 1) : 0;
  const xCenter = plotWidth / 2;

  return (
    <View
      style={[
        styles.seriesPanel,
        layout === 'row' && styles.seriesPanelRow,
        { backgroundColor: bg, borderColor: SUBTLE_BORDER },
      ]}>
      <View style={styles.seriesHeaderLine}>
        <View style={[styles.seriesDot, { backgroundColor: color }]} />
        <Text
          style={[styles.seriesLabel, layout === 'row' && styles.seriesLabelCompact]}
          numberOfLines={1}>
          {label}
        </Text>
        <Text
          style={[styles.seriesCount, { color }, layout === 'row' && styles.seriesCountCompact]}
          numberOfLines={1}>
          {countText}
        </Text>
        <Text
          style={[
            styles.seriesPct,
            layout === 'row' && styles.seriesPctCompact,
            pctPositive && styles.seriesPctUp,
            pctNegative && styles.seriesPctDown,
            !pctPositive && !pctNegative && styles.seriesPctFlat,
          ]}
          numberOfLines={1}>
          {pctText}
        </Text>
      </View>

      <View
        style={styles.chartMeasureWrap}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0 && Math.abs(w - chartInnerWidth) > 2) setChartInnerWidth(w);
        }}>
      {hasData ? (
        <Svg width={svgWidth} height={CHART_HEIGHT} style={styles.seriesSvg}>
          {[0.5, 1].map((frac) => {
            const y = PADDING_TOP + plotHeight * (1 - frac);
            return (
              <Line
                key={frac}
                x1={PADDING_LEFT}
                y1={y}
                x2={PADDING_LEFT + plotWidth}
                y2={y}
                stroke={SUBTLE_BORDER}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            );
          })}
          {points ? (
            <Polyline
              points={points}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              translateX={PADDING_LEFT}
              translateY={PADDING_TOP}
            />
          ) : null}
          {values.map((value, index) => {
            if (value <= 0) return null;
            const x = PADDING_LEFT + (values.length > 1 ? index * step : xCenter);
            const ratio = maxY > 0 ? value / maxY : 0;
            const y = PADDING_TOP + plotHeight - ratio * plotHeight;
            return <Circle key={index} cx={x} cy={y} r={3} fill={color} />;
          })}
        </Svg>
      ) : (
        <View style={styles.seriesEmpty}>
          <Text style={styles.seriesEmptyText}>{emptyLabel}</Text>
        </View>
      )}
      </View>

      {labels.length > 0 && hasData ? (
        <View style={styles.seriesXLabels}>
          {labels.map((lbl, index) => {
            const show =
              labels.length <= 6 ||
              index === 0 ||
              index === labels.length - 1 ||
              index % Math.ceil(labels.length / 4) === 0;
            if (!show) return <View key={`${lbl}-${index}`} style={styles.xLabelSpacer} />;
            return (
              <Text key={`${lbl}-${index}`} style={styles.seriesXLabel} numberOfLines={1}>
                {lbl}
              </Text>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export default function SuperAdminDashboardGrowthChart({
  period,
  onPeriodChange,
  growth,
  loading,
  error,
  onRetry,
  formatCount,
}: Props) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const gridDesktop = windowWidth >= DESKTOP_ROW_BREAKPOINT;
  const panelLayout = gridDesktop ? 'row' : 'stack';

  const periodLabel =
    period === 'month' ? t('superAdmin.dashboardGrowthThisMonth') : t('superAdmin.dashboardGrowthThisYear');

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('superAdmin.dashboardGrowthTitle')}</Text>
        <View style={styles.periodToggle}>
          {(['month', 'year'] as const).map((p) => {
            const selected = period === p;
            return (
              <Pressable
                key={p}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onPeriodChange(p)}
                style={({ pressed }) => [
                  styles.periodChip,
                  selected && styles.periodChipSelected,
                  pressed && !selected && styles.periodChipPressed,
                ]}>
                <Text style={[styles.periodChipLabel, selected && styles.periodChipLabelSelected]}>
                  {p === 'month' ? t('superAdmin.dashboardGrowthMonth') : t('superAdmin.dashboardGrowthYear')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={styles.subtitle}>{periodLabel}</Text>

      {loading && !growth ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={BRAND_BLUE} />
          <Text style={styles.loadingText}>{t('superAdmin.dashboardGrowthLoading')}</Text>
        </View>
      ) : error && !growth ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{t('superAdmin.dashboardGrowthError')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('superAdmin.dashboardStatsRetry')}
            onPress={onRetry}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}>
            <Text style={styles.retryLabel}>{t('superAdmin.dashboardStatsRetry')}</Text>
          </Pressable>
        </View>
      ) : growth ? (
        <View style={[styles.chartsGrid, gridDesktop && styles.chartsGridDesktop]}>
          {GROWTH_SERIES_META.map((meta) => (
            <GrowthSeriesPanel
              key={meta.key}
              color={meta.color}
              bg={meta.bg}
              label={t(meta.labelKey)}
              values={growth.series[meta.key]}
              labels={growth.labels}
              emptyLabel={t('superAdmin.dashboardGrowthEmpty')}
              countText={t('superAdmin.dashboardGrowthDeltaShort', {
                count: formatCount(growth.totals[meta.key]),
              })}
              pctText={formatGrowthPct(growth.growthPct[meta.key])}
              pctPositive={growth.growthPct[meta.key] > 0}
              pctNegative={growth.growthPct[meta.key] < 0}
              layout={panelLayout}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PAGE_BG,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  periodToggle: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
  },
  periodChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  periodChipSelected: {
    backgroundColor: BRAND_BLUE,
  },
  periodChipPressed: {
    opacity: 0.85,
  },
  periodChipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
  periodChipLabelSelected: {
    color: '#FFFFFF',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: TEXT_MUTED,
    marginBottom: 4,
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: TEXT_MUTED,
  },
  errorWrap: {
    paddingVertical: 28,
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: TEXT_MUTED,
    textAlign: 'center',
  },
  retryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: BRAND_BLUE,
  },
  retryBtnPressed: {
    opacity: 0.88,
  },
  retryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  chartsGrid: {
    marginTop: 12,
    gap: 12,
  },
  chartsGridDesktop: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: GRID_GAP,
    alignItems: 'stretch',
  },
  seriesPanel: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    width: '100%',
  },
  seriesPanelRow: {
    flex: 1,
    minWidth: 0,
    width: undefined,
    padding: 10,
  },
  chartMeasureWrap: {
    width: '100%',
  },
  seriesHeaderLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    flexWrap: 'nowrap',
  },
  seriesDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  seriesLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    flexShrink: 1,
    minWidth: 0,
  },
  seriesLabelCompact: {
    fontSize: 12,
  },
  seriesCount: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 0,
  },
  seriesCountCompact: {
    fontSize: 12,
  },
  seriesPct: {
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 0,
  },
  seriesPctCompact: {
    fontSize: 11,
  },
  seriesPctUp: {
    color: '#047857',
  },
  seriesPctDown: {
    color: '#B91C1C',
  },
  seriesPctFlat: {
    color: TEXT_MUTED,
  },
  seriesSvg: {
    alignSelf: 'flex-start',
  },
  seriesEmpty: {
    height: CHART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  seriesEmptyText: {
    fontSize: 12,
    color: TEXT_MUTED,
    textAlign: 'center',
  },
  seriesXLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
    paddingHorizontal: 2,
  },
  seriesXLabel: {
    fontSize: 9,
    color: TEXT_MUTED,
    fontWeight: '600',
    minWidth: 16,
    textAlign: 'center',
  },
  xLabelSpacer: {
    flex: 1,
  },
});
