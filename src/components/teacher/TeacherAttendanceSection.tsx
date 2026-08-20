import { useRouter } from 'expo-router';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';
import { SessionCacheKeys } from '@/src/services/sessionDataCache';
import { useSessionCachedQuery } from '@/src/hooks/useSessionCachedQuery';
import {
  fetchTeacherTodaySchedule,
  isTeacherScheduleItemStillActive,
  type TeacherTodayScheduleItem,
} from '@/src/services/teacherTodayScheduleApi';
import { formatScheduleClockTime } from '@/src/services/instituteAdminDashboardApi';
import { Text } from '@/src/theme/Text';
import { PAGE_CONTENT_TOP, PAGE_EDGE_INSET } from '@/src/theme/pageLayout';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';

export type TeacherAttendanceSectionProps = {
  contentPaddingBottom?: number;
};

function TeacherAttendanceSection({ contentPaddingBottom = 0 }: TeacherAttendanceSectionProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const am = (k: string, o?: Record<string, unknown>) =>
    t(`teacherDashboard.attendanceMenu.${k}`, o);

  const { data, loading, error } = useSessionCachedQuery(
    SessionCacheKeys.TEACHER_TODAY_SCHEDULE,
    () => fetchTeacherTodaySchedule(),
    { shouldCache: (res) => !res.error },
  );

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const allItems = data?.items ?? [];
  const items = useMemo(
    () => allItems.filter((item) => isTeacherScheduleItemStillActive(item, now)),
    [allItems, now],
  );
  const loadError = data?.error ?? error;

  const openSession = (item: TeacherTodayScheduleItem) => {
    router.push({
      pathname: '/teacher-dashboard/class-attendance',
      params: {
        groupId: item.groupId,
        groupSource: item.groupSource,
        scheduleId: item.scheduleId,
        groupName: item.groupName,
        startTime: item.startTime,
        endTime: item.endTime,
      },
    } as never);
  };

  return (
    <View style={[styles.wrap, { paddingBottom: contentPaddingBottom }]}>
      <Text style={styles.sectionTitle}>{am('todayTitle')}</Text>
      <Text style={styles.sectionHint}>{am('todayHint')}</Text>

      {loading && allItems.length === 0 ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={BRAND_BLUE} size="small" />
          <Text style={styles.loadingText}>{am('todayLoading')}</Text>
        </View>
      ) : loadError && allItems.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{am('todayError')}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{am('todayEmpty')}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item) => {
            const start = formatScheduleClockTime(item.startTime, i18n.language);
            const end = formatScheduleClockTime(item.endTime, i18n.language);
            return (
              <ScrollFriendlyPressable
                key={`${item.groupSource}:${item.groupId}:${item.scheduleId}`}
                accessibilityRole="button"
                accessibilityLabel={am('openSessionA11y', { name: item.groupName })}
                onPress={() => openSession(item)}
                style={styles.row}
                innerStyle={styles.rowInner}>
                <View style={styles.timeCol}>
                  <Text style={styles.timeText}>{start}</Text>
                  <Text style={styles.timeEnd}>{end}</Text>
                </View>
                <View style={styles.dotCol}>
                  <View style={styles.dot} />
                </View>
                <View style={styles.mainCol}>
                  <Text style={styles.groupName} numberOfLines={2}>
                    {item.groupName}
                  </Text>
                  {item.instituteName ? (
                    <Text style={styles.meta} numberOfLines={1}>
                      {item.instituteName}
                    </Text>
                  ) : (
                    <Text style={styles.meta} numberOfLines={1}>
                      {t('teacherDashboard.groupsGroupClassBadge')}
                    </Text>
                  )}
                </View>
              </ScrollFriendlyPressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default memo(TeacherAttendanceSection);

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: PAGE_CONTENT_TOP,
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
    borderColor: BORDER,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {}),
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  timeCol: { width: 72, flexShrink: 0 },
  timeText: { fontSize: 13, fontWeight: '800', color: BRAND_BLUE_DARK },
  timeEnd: { fontSize: 11, color: TEXT_MUTED, marginTop: 2 },
  dotCol: { width: 14, alignItems: 'center' },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BRAND_BLUE,
  },
  mainCol: { flex: 1, minWidth: 0, gap: 2 },
  groupName: { fontSize: 15, fontWeight: '700', color: BRAND_BLUE_DARK, lineHeight: 20 },
  meta: { fontSize: 13, color: TEXT_MUTED, lineHeight: 18 },
  centerBox: { paddingVertical: 24, alignItems: 'center', gap: 8 },
  loadingText: { fontSize: 13, color: TEXT_MUTED, fontWeight: '600' },
  emptyBox: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: '#F8FAFC',
  },
  emptyText: { fontSize: 14, color: TEXT_MUTED, lineHeight: 20 },
});
