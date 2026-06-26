import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';

import TodayScheduleSessionCard from '@/src/components/parent/TodayScheduleSessionCard';
import {
  fetchStudentTodaySchedule,
  filterActiveTodayScheduleItems,
  type TodayScheduleItem,
} from '@/src/services/parentStudentsApi';
import {
  buildTodayScheduleFromClasses,
  fetchStudentClasses,
} from '@/src/services/studentClassesApi';
import { FontFamily } from '@/src/theme/fonts';

const BRAND_BLUE_DARK = '#0E2F63';
const BRAND_BLUE = '#123B7A';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const SURFACE = '#FFFFFF';
const ERROR = '#B42318';
const SCHEDULE_REFRESH_MS = 60_000;

export type TodayScheduleCardProps = {
  studentUserId: string | null;
  /** When false, pauses the live clock tick (saves re-renders off the home tab). */
  isActive?: boolean;
};

function formatTimeRange(start: string, end: string): string {
  const fmt = (hhmm: string): string => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!m) return hhmm;
    const hours = Number.parseInt(m[1]!, 10);
    const minutes = Number.parseInt(m[2]!, 10);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return hhmm;
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }).format(date);
    } catch {
      return hhmm;
    }
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

function TodayScheduleCard({ studentUserId, isActive = true }: TodayScheduleCardProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<TodayScheduleItem[]>([]);
  const [now, setNow] = useState(() => new Date());
  const loadSeqRef = useRef(0);

  const visibleItems = useMemo(
    () => filterActiveTodayScheduleItems(items, now),
    [items, now],
  );

  const load = useCallback(async () => {
    const studentId = studentUserId?.trim() ?? '';
    if (!studentId) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }

    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError(null);
    const asOf = new Date();
    setNow(asOf);

    const res = await fetchStudentTodaySchedule(studentId, asOf);
    if (seq !== loadSeqRef.current) return;

    if (res.ok) {
      let nextItems = res.items;
      if (nextItems.length === 0) {
        const classesRes = await fetchStudentClasses(studentId);
        if (seq !== loadSeqRef.current) return;
        if (classesRes.ok) {
          nextItems = buildTodayScheduleFromClasses(classesRes.classes, asOf);
        }
      }
      setItems(nextItems);
      setError(null);
    } else {
      const classesRes = await fetchStudentClasses(studentId);
      if (seq !== loadSeqRef.current) return;
      if (classesRes.ok) {
        setItems(buildTodayScheduleFromClasses(classesRes.classes, asOf));
        setError(null);
      } else {
        setItems([]);
        setError(res.error);
      }
    }
    setLoading(false);
  }, [studentUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (!isActive) return;
      void load();
    }, [isActive, load]),
  );

  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => setNow(new Date()), SCHEDULE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [isActive]);

  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.headerRow}>
        <View style={styles.scheduleIconWrap}>
          <Ionicons name="calendar-outline" size={36} color={BRAND_BLUE} />
          <View style={styles.clockBadge}>
            <Ionicons name="time-outline" size={15} color={BRAND_BLUE} />
          </View>
        </View>
        <Text style={styles.titleLarge}>{t('parentDashboard.todayScheduleTitle')}</Text>
      </View>

      <View style={styles.thickDivider} />

      {loading ? (
        <View style={styles.stateRow}>
          <ActivityIndicator size="small" color={BRAND_BLUE} />
          <Text style={styles.stateText}>{t('parentDashboard.todayScheduleLoading')}</Text>
        </View>
      ) : error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle-outline" size={16} color={ERROR} />
          <Text style={styles.errorText} numberOfLines={2}>
            {error}
          </Text>
          <ScrollFriendlyPressable
            accessibilityRole="button"
            onPress={() => void load()}
            style={styles.retryBtn}>
            <Ionicons name="refresh" size={14} color={SURFACE} />
            <Text style={styles.retryText}>{t('parentDashboard.classesRetry')}</Text>
          </ScrollFriendlyPressable>
        </View>
      ) : visibleItems.length === 0 ? (
        <View style={styles.emptyRow}>
          <Ionicons name="sunny-outline" size={18} color={TEXT_MUTED} />
          <Text style={styles.emptyText}>{t('parentDashboard.todayScheduleEmpty')}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {visibleItems.map((item, index) => (
            <View key={item.scheduleId}>
              {index > 0 ? <View style={styles.sessionDivider} /> : null}
              <TodayScheduleSessionCard
                item={item}
                timeLabel={formatTimeRange(item.startTime, item.endTime)}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default memo(TodayScheduleCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 18,
    gap: 12,
    ...Platform.select({
      android: { elevation: 3 },
      default: {
        shadowColor: '#0E2F63',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
      },
    }),
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  scheduleIconWrap: {
    width: 52,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  clockBadge: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleLarge: {
    flex: 1,
    fontSize: 24,
    lineHeight: 30,
    fontFamily: FontFamily.black,
    color: BRAND_BLUE_DARK,
    letterSpacing: -0.4,
  },
  thickDivider: { height: 1, backgroundColor: BORDER },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  stateText: { fontSize: 13, color: TEXT_MUTED },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  errorText: { flex: 1, fontSize: 12.5, color: ERROR },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BRAND_BLUE,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  retryBtnPressed: { opacity: 0.85 },
  retryText: { fontSize: 11.5, fontWeight: '800', color: SURFACE },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 32,
  },
  emptyText: { fontSize: 14, color: TEXT_MUTED, fontWeight: '600' },
  list: { gap: 0 },
  sessionDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 14,
  },
});
