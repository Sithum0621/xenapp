import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';

import AttendanceDualRing from '@/src/components/parent/AttendanceDualRing';
import type { GroupAttendanceSummary } from '@/src/services/studentAttendanceApi';
import { countsFromParts } from '@/src/services/studentAttendanceApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const TEXT_MUTED = '#64748B';
const PRESENT_COLOR = '#0F9D58';
const ABSENT_COLOR = '#B42318';
const SURFACE = '#FFFFFF';
const BORDER = '#E2E8F0';

export type AttendanceGroupCardProps = {
  group: GroupAttendanceSummary;
  onPress: () => void;
};

export default function AttendanceGroupCard({ group, onPress }: AttendanceGroupCardProps) {
  const { t } = useTranslation();
  const counts = countsFromParts(group.present, group.absent);
  const presentPct =
    counts.total > 0 ? Math.round((counts.present / counts.total) * 100) : null;
  const absentPct =
    counts.total > 0 ? Math.round((counts.absent / counts.total) * 100) : null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.groupName} numberOfLines={2}>
            {group.groupName}
          </Text>
          {group.instituteName ? (
            <Text style={styles.institute} numberOfLines={1}>
              {group.instituteName}
            </Text>
          ) : null}
        </View>
        <ScrollFriendlyPressable
          accessibilityRole="button"
          accessibilityLabel={group.groupName}
          onPress={onPress}
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 8 }}
          style={styles.openBtn}>
          <Ionicons name="chevron-forward" size={20} color={TEXT_MUTED} />
        </ScrollFriendlyPressable>
      </View>

      {counts.total > 0 ? (
        <Text style={styles.classesHeld}>
          {t('parentDashboard.attendanceClassesHeld', { count: counts.total })}
        </Text>
      ) : null}

      <View style={styles.body}>
        <AttendanceDualRing counts={counts} size={112} strokeWidth={11} />

        <View style={styles.legend}>
          <View style={styles.legendRow}>
            <View style={styles.legendLabelRow}>
              <View style={[styles.dot, { backgroundColor: PRESENT_COLOR }]} />
              <Text style={styles.legendLabel}>{t('parentDashboard.attendancePresentLabel')}</Text>
            </View>
            <Text style={styles.legendValue}>
              {counts.total > 0
                ? t('parentDashboard.attendanceCountAndPct', {
                    count: counts.present,
                    pct: presentPct,
                  })
                : t('parentDashboard.attendanceNoData')}
            </Text>
          </View>
          <View style={styles.legendRow}>
            <View style={styles.legendLabelRow}>
              <View style={[styles.dot, { backgroundColor: ABSENT_COLOR }]} />
              <Text style={styles.legendLabel}>{t('parentDashboard.attendanceAbsentLabel')}</Text>
            </View>
            <Text style={styles.legendValue}>
              {counts.total > 0
                ? t('parentDashboard.attendanceCountAndPct', {
                    count: counts.absent,
                    pct: absentPct,
                  })
                : t('parentDashboard.attendanceNoData')}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 16,
    ...Platform.select({
      android: { elevation: 2 },
      web: {
        // @ts-expect-error -- web-only CSS
        boxShadow: '0 6px 14px rgba(14, 47, 99, 0.06)',
      },
      default: {
        shadowColor: '#0E2F63',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 14,
      },
    }),
  },
  openBtn: { padding: 4, flexShrink: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerText: { flex: 1, gap: 4 },
  groupName: {
    fontSize: 17,
    lineHeight: 22,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
  },
  institute: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
  },
  classesHeld: {
    fontSize: 13,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  legend: { flex: 1, gap: 12 },
  legendRow: { gap: 4 },
  legendLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: {
    fontSize: 13,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE,
  },
  legendValue: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
    marginLeft: 18,
  },
});
