import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Text } from '@/src/theme/Text';
import type { AdminDashboardStats } from '@/src/services/instituteAdminDashboardApi';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const SUBTLE_BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';

type StatCard = {
  key: string;
  labelKey: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  bg: string;
};

type Props = {
  stats: AdminDashboardStats | null;
  loading: boolean;
  error: string | null;
};

export default function AdminDashboardStatsCards({ stats, loading, error }: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const isCompact = width < 640;
  const cardBasis = isCompact ? '48%' : '23%';

  if (loading && !stats) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={BRAND_BLUE} size="small" />
      </View>
    );
  }

  if (error && !stats) {
    return (
      <View style={styles.errorBox}>
        <Text style={styles.errorText}>{t('adminPortal.dashboardStatsError')}</Text>
      </View>
    );
  }

  const cards: StatCard[] = [
    {
      key: 'active',
      labelKey: 'adminPortal.dashboardStatActiveStudents',
      value: String(stats?.activeStudentsToday ?? 0),
      icon: 'people-outline',
      accent: '#047857',
      bg: '#ECFDF5',
    },
    {
      key: 'classes',
      labelKey: 'adminPortal.dashboardStatTodaysClasses',
      value: String(stats?.todaysClasses ?? 0),
      icon: 'calendar-outline',
      accent: BRAND_BLUE,
      bg: '#E3F2FD',
    },
    {
      key: 'tasks',
      labelKey: 'adminPortal.dashboardStatPendingTasks',
      value: String(stats?.pendingTasks ?? 0),
      icon: 'checkbox-outline',
      accent: '#B45309',
      bg: '#FFFBEB',
    },
    {
      key: 'attendance',
      labelKey: 'adminPortal.dashboardStatAttendanceSummary',
      value: `${stats?.attendancePctToday ?? 0}%`,
      icon: 'stats-chart-outline',
      accent: '#5B21B6',
      bg: '#F5F3FF',
    },
  ];

  return (
    <View style={styles.grid}>
      {cards.map((card) => (
        <View key={card.key} style={[styles.card, { flexBasis: cardBasis, minWidth: isCompact ? '46%' : 140 }]}>
          <View style={[styles.iconWrap, { backgroundColor: card.bg }]}>
            <Ionicons name={card.icon} size={20} color={card.accent} />
          </View>
          <Text style={styles.value}>{card.value}</Text>
          <Text style={styles.label}>{t(card.labelKey)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  card: {
    flexGrow: 1,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 6,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 24,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    lineHeight: 28,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_MUTED,
    lineHeight: 18,
  },
  loadingWrap: {
    paddingVertical: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  errorBox: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 20,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B91C1C',
  },
});
