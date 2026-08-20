import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScrollView } from '@/src/components/layout/scroll';
import BrandHeader from '@/src/components/parent/BrandHeader';
import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';
import TeacherTimetableCalendarView from '@/src/components/teacher/TeacherTimetableCalendarView';
import { SessionCacheKeys } from '@/src/services/sessionDataCache';
import { useSessionCachedQuery } from '@/src/hooks/useSessionCachedQuery';
import {
  loadTeacherCalendarNotes,
  type TeacherCalendarNotesMap,
} from '@/src/services/teacherCalendarNotesStorage';
import { formatScheduleClockTime } from '@/src/services/instituteAdminDashboardApi';
import { supabase } from '@/src/services/supabaseClient';
import {
  fetchTeacherTimetable,
  type TeacherTimetableItem,
} from '@/src/services/teacherTodayScheduleApi';
import { Text } from '@/src/theme/Text';
import { jsDowToWeekdayKey } from '@/src/utils/teacherGroupRouteParams';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const PAGE_BG = '#F8FAFC';

const TIMETABLE_DOW_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

type ViewMode = 'calendar' | 'list';

function TimetableEntryRow({
  item,
  subtitle,
  timeLabel,
}: {
  item: TeacherTimetableItem;
  subtitle: string;
  timeLabel: string;
}) {
  return (
    <View style={styles.entryRow}>
      <View style={styles.entryTimeCol}>
        <Text style={styles.entryTime}>{timeLabel}</Text>
      </View>
      <View style={styles.entryMainCol}>
        <Text style={styles.entryTitle} numberOfLines={2}>
          {item.groupName}
        </Text>
        <Text style={styles.entryMeta} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

export default function TeacherMyTimetableScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const tt = (k: string, o?: Record<string, unknown>) => t(`teacherDashboard.myTimetable.${k}`, o);
  const gd = (k: string) => t(`teacherDashboard.groupDetail.${k}`);

  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [teacherUserId, setTeacherUserId] = useState('');
  const [notes, setNotes] = useState<TeacherCalendarNotesMap>({});

  const { data, loading, error, refresh } = useSessionCachedQuery(
    SessionCacheKeys.TEACHER_TIMETABLE,
    () => fetchTeacherTimetable(),
    { shouldCache: (res) => !res.error },
  );

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const id = user?.id ?? '';
      setTeacherUserId(id);
      if (id) {
        const loaded = await loadTeacherCalendarNotes(id);
        setNotes(loaded);
      }
    })();
  }, []);

  const weeklyByDow = useMemo(() => {
    const map = new Map<number, TeacherTimetableItem[]>();
    for (const item of data?.weekly ?? []) {
      if (item.dayOfWeek === null) continue;
      const list = map.get(item.dayOfWeek) ?? [];
      list.push(item);
      map.set(item.dayOfWeek, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [data?.weekly]);

  const formatRange = (item: TeacherTimetableItem) => {
    const start = formatScheduleClockTime(item.startTime, i18n.language);
    const end = formatScheduleClockTime(item.endTime, i18n.language);
    return `${start} – ${end}`;
  };

  const instituteOrPersonal = (item: TeacherTimetableItem) =>
    item.instituteName ?? t('teacherDashboard.groupsGroupClassBadge');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <BrandHeader trailing={null} />
      <View style={styles.toolbar}>
        <ScrollFriendlyPressable
          accessibilityRole="button"
          accessibilityLabel={tt('backA11y')}
          onPress={() => routerBackOrReplace(router, appHref(AppRoutes.teacherDashboard))}
          style={styles.backBtn}
          innerStyle={styles.backBtnInner}>
          <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
          <Text style={styles.backText}>{tt('back')}</Text>
        </ScrollFriendlyPressable>
        <Text style={styles.pageTitle} accessibilityRole="header">
          {tt('title')}
        </Text>
        <Text style={styles.pageSub}>{tt('subtitle')}</Text>

        <View style={styles.viewTabs}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: viewMode === 'calendar' }}
            onPress={() => setViewMode('calendar')}
            style={[styles.viewTab, viewMode === 'calendar' && styles.viewTabActive]}>
            <Ionicons
              name="calendar-outline"
              size={16}
              color={viewMode === 'calendar' ? BRAND_BLUE_DARK : TEXT_MUTED}
            />
            <Text style={[styles.viewTabText, viewMode === 'calendar' && styles.viewTabTextActive]}>
              {tt('tabCalendar')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: viewMode === 'list' }}
            onPress={() => setViewMode('list')}
            style={[styles.viewTab, viewMode === 'list' && styles.viewTabActive]}>
            <Ionicons
              name="list-outline"
              size={16}
              color={viewMode === 'list' ? BRAND_BLUE_DARK : TEXT_MUTED}
            />
            <Text style={[styles.viewTabText, viewMode === 'list' && styles.viewTabTextActive]}>
              {tt('tabList')}
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        {loading && !data ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={BRAND_BLUE} />
            <Text style={styles.muted}>{tt('loading')}</Text>
          </View>
        ) : data?.error || error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>{tt('loadError')}</Text>
            <ScrollFriendlyPressable
              accessibilityRole="button"
              onPress={() => refresh(true)}
              style={styles.retryBtn}
              innerStyle={styles.retryBtnInner}>
              <Text style={styles.retryBtnText}>{tt('retry')}</Text>
            </ScrollFriendlyPressable>
          </View>
        ) : viewMode === 'calendar' ? (
          <TeacherTimetableCalendarView
            weekly={data?.weekly ?? []}
            oneTime={data?.oneTime ?? []}
            notes={notes}
            teacherUserId={teacherUserId}
            onNotesChange={setNotes}
          />
        ) : (
          <>
            {TIMETABLE_DOW_ORDER.map((dow) => {
              const entries = weeklyByDow.get(dow) ?? [];
              const key = jsDowToWeekdayKey(dow);
              const dayLabel = key ? gd(`weekdayShort.${key}`) : '';
              return (
                <View key={dow} style={styles.daySection}>
                  <Text style={styles.dayHeading}>{dayLabel}</Text>
                  {entries.length === 0 ? (
                    <Text style={styles.dayEmpty}>{tt('dayEmpty')}</Text>
                  ) : (
                    <View style={styles.dayCard}>
                      {entries.map((item, index) => (
                        <View
                          key={`${item.scheduleId}:${item.groupId}`}
                          style={index < entries.length - 1 ? styles.entryDivider : undefined}>
                          <TimetableEntryRow
                            item={item}
                            timeLabel={formatRange(item)}
                            subtitle={instituteOrPersonal(item)}
                          />
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}

            {(data?.oneTime?.length ?? 0) > 0 ? (
              <View style={styles.daySection}>
                <Text style={styles.dayHeading}>{tt('extraClassesTitle')}</Text>
                <View style={styles.dayCard}>
                  {(data?.oneTime ?? []).map((item, index, arr) => (
                    <View
                      key={`${item.scheduleId}:${item.classDate}`}
                      style={index < arr.length - 1 ? styles.entryDivider : undefined}>
                      <TimetableEntryRow
                        item={item}
                        timeLabel={formatRange(item)}
                        subtitle={`${item.classDate ?? ''} · ${instituteOrPersonal(item)}`}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAGE_BG },
  toolbar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: PAGE_BG,
  },
  backBtn: { alignSelf: 'flex-start', marginBottom: 8 },
  backBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4 },
  backText: { fontSize: 15, fontWeight: '700', color: BRAND_BLUE_DARK },
  pageTitle: { fontSize: 24, fontWeight: '800', color: BRAND_BLUE_DARK },
  pageSub: { marginTop: 4, fontSize: 14, color: TEXT_MUTED, lineHeight: 20 },
  viewTabs: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  viewTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  viewTabActive: {
    borderColor: BRAND_BLUE,
    backgroundColor: 'rgba(18, 59, 122, 0.08)',
  },
  viewTabText: { fontSize: 14, fontWeight: '700', color: TEXT_MUTED },
  viewTabTextActive: { color: BRAND_BLUE_DARK },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28, gap: 16 },
  centerBox: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  muted: { fontSize: 14, color: TEXT_MUTED, fontWeight: '600' },
  errorBox: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  errorTitle: { fontSize: 14, fontWeight: '800', color: '#991B1B' },
  retryBtn: { marginTop: 12, alignSelf: 'flex-start' },
  retryBtnInner: {
    backgroundColor: BRAND_BLUE,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  retryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  daySection: { gap: 8 },
  dayHeading: { fontSize: 15, fontWeight: '800', color: BRAND_BLUE_DARK },
  dayEmpty: { fontSize: 13, color: TEXT_MUTED, fontStyle: 'italic' },
  dayCard: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  entryDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  entryTimeCol: { width: 108, flexShrink: 0 },
  entryTime: { fontSize: 12, fontWeight: '700', color: BRAND_BLUE_DARK, lineHeight: 16 },
  entryMainCol: { flex: 1, minWidth: 0, gap: 2 },
  entryTitle: { fontSize: 15, fontWeight: '700', color: BRAND_BLUE_DARK, lineHeight: 20 },
  entryMeta: { fontSize: 12, color: TEXT_MUTED, lineHeight: 16 },
});
