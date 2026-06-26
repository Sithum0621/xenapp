import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';

import { Text } from '@/src/theme/Text';
import {
  formatScheduleClockTime,
  type AdminDashboardScheduleItem,
} from '@/src/services/instituteAdminDashboardApi';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const SUBTLE_BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';

type Props = {
  items: AdminDashboardScheduleItem[];
  loading: boolean;
  error: string | null;
};

export default function AdminDashboardTodaySchedule({ items, loading, error }: Props) {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('adminPortal.dashboardScheduleTitle')}</Text>
      <Text style={styles.sectionHint}>{t('adminPortal.dashboardScheduleHint')}</Text>

      {loading && items.length === 0 ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={BRAND_BLUE} size="small" />
        </View>
      ) : error && items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{t('adminPortal.dashboardScheduleError')}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{t('adminPortal.dashboardScheduleEmpty')}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item) => {
            const start = formatScheduleClockTime(item.startTime, i18n.language);
            const end = formatScheduleClockTime(item.endTime, i18n.language);
            return (
              <ScrollFriendlyPressable
                key={`${item.lectureGroupId}-${item.scheduleId}`}
                accessibilityRole="button"
                accessibilityLabel={t('adminPortal.dashboardScheduleOpenGroup', { name: item.groupName })}
                onPress={() =>
                  router.push({
                    pathname: '/admin-dashboard/groups/[groupId]',
                    params: { groupId: item.lectureGroupId },
                  })
                }
                style={styles.row}
                innerStyle={styles.rowInner}>
                <View style={styles.timeCol}>
                  <Text style={styles.timeText}>{start}</Text>
                  <Text style={styles.timeEnd}>{end}</Text>
                </View>
                <View style={styles.dotCol}>
                  <View style={styles.dot} />
                  <View style={styles.line} />
                </View>
                <View style={styles.mainCol}>
                  <Text style={styles.groupName} numberOfLines={2}>
                    {item.groupName}
                  </Text>
                  <Text style={styles.meta} numberOfLines={2}>
                    {t('adminPortal.dashboardScheduleTeacherLine', { name: item.teacherName })}
                  </Text>
                  <Text style={styles.attendanceMeta}>
                    {item.attendanceComplete
                      ? t('adminPortal.dashboardScheduleAttendanceDone', {
                          present: item.presentCount,
                          total: item.enrolledCount,
                        })
                      : t('adminPortal.dashboardScheduleAttendancePending', {
                          marked: item.markedCount,
                          total: item.enrolledCount,
                        })}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
              </ScrollFriendlyPressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 20,
    width: '100%',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 13,
    color: TEXT_MUTED,
    marginBottom: 12,
    lineHeight: 18,
  },
  list: {
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SUBTLE_BORDER,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowPressed: { backgroundColor: '#F8FAFC' },
  timeCol: { width: 72, flexShrink: 0 },
  timeText: { fontSize: 13, fontWeight: '800', color: BRAND_BLUE_DARK },
  timeEnd: { fontSize: 11, color: TEXT_MUTED, marginTop: 2 },
  dotCol: { width: 14, alignItems: 'center', paddingTop: 4 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BRAND_BLUE,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: '#E2E8F0',
    marginTop: 4,
    minHeight: 24,
  },
  mainCol: { flex: 1, minWidth: 0, gap: 2 },
  groupName: { fontSize: 15, fontWeight: '700', color: BRAND_BLUE_DARK, lineHeight: 20 },
  meta: { fontSize: 13, color: TEXT_MUTED, lineHeight: 18 },
  attendanceMeta: { fontSize: 12, fontWeight: '600', color: '#047857', marginTop: 2 },
  centerBox: { paddingVertical: 20, alignItems: 'center' },
  emptyBox: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#F8FAFC',
  },
  emptyText: { fontSize: 14, color: TEXT_MUTED, lineHeight: 20 },
});
