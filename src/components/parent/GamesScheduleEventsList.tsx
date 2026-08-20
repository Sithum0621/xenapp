import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { NativeFluidFlatList } from '@/src/components/layout/NativeFluidFlatList';
import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';
import { appHref, hrefParentGamesScheduleEvent } from '@/src/navigation/AppNavigator';

import {
  fetchStudentGamesScheduleEvents,
  type StudentGamesScheduleEvent,
} from '@/src/services/studentGamesScheduleApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { PAGE_CONTENT_TOP, PAGE_EDGE_INSET } from '@/src/theme/pageLayout';
import {
  parentBrandBlue,
  parentBrandBlueDark,
  parentGamesPurple,
  parentInk,
  parentInkSoft,
  parentSurface,
} from '@/src/theme/parentDashboardPalette';

export type GamesScheduleEventsListProps = {
  studentUserId: string | null;
  listHeader?: ReactNode;
  contentPaddingBottom?: number;
};

function formatQuizTimeLimit(minutes: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) {
    return t('parentDashboard.gamesScheduleTimeLimitHoursMinutes', { hours, minutes: mins });
  }
  if (hours > 0) return t('parentDashboard.gamesScheduleTimeLimitHours', { hours });
  return t('parentDashboard.gamesScheduleTimeLimitMinutes', { minutes });
}

const GamesScheduleEventCard = memo(function GamesScheduleEventCard({
  event,
  studentUserId,
  formatWeekRange,
  t,
}: {
  event: StudentGamesScheduleEvent;
  studentUserId: string;
  formatWeekRange: (start: string, end: string) => string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const hasQuiz =
    event.quiz_question_count != null &&
    event.quiz_question_count > 0 &&
    event.quiz_time_limit_minutes != null &&
    event.quiz_time_limit_minutes > 0;

  const openExam = () => {
    router.push(appHref(hrefParentGamesScheduleEvent(studentUserId, event.id)));
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.iconCircle}>
          <Ionicons name="game-controller-outline" size={18} color={parentGamesPurple} />
        </View>
        <View style={styles.cardTitleCol}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {event.title}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {event.subject_name} · {formatWeekRange(event.week_starts_on, event.week_ends_on)}
          </Text>
        </View>
      </View>

      {event.notes?.trim() ? (
        <Text style={styles.cardNotes} numberOfLines={3}>
          {event.notes}
        </Text>
      ) : null}

      {hasQuiz ? (
        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Ionicons name="help-circle-outline" size={14} color={parentBrandBlueDark} />
            <Text style={styles.chipText}>
              {t('parentDashboard.gamesScheduleQuestionCount', {
                count: event.quiz_question_count,
              })}
            </Text>
          </View>
          <View style={styles.chip}>
            <Ionicons name="timer-outline" size={14} color={parentBrandBlueDark} />
            <Text style={styles.chipText}>
              {formatQuizTimeLimit(event.quiz_time_limit_minutes ?? 0, t)}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={styles.comingSoon}>{t('parentDashboard.gamesScheduleQuizComingSoon')}</Text>
      )}

      <ScrollFriendlyPressable
        accessibilityRole="button"
        accessibilityLabel={t('parentDashboard.gamesScheduleEventOpen', { title: event.title })}
        onPress={openExam}
        style={styles.openExamBtn}
        innerStyle={styles.openExamBtnInner}>
        <Text style={styles.openExamBtnText} numberOfLines={1}>
          {t('parentDashboard.gamesScheduleEventOpen', { title: event.title })}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={parentBrandBlue} />
      </ScrollFriendlyPressable>
    </View>
  );
});

function GamesScheduleEventsList({
  studentUserId,
  listHeader,
  contentPaddingBottom = 0,
}: GamesScheduleEventsListProps) {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<StudentGamesScheduleEvent[]>([]);

  const formatWeekRange = useCallback(
    (start: string, end: string) => {
      try {
        const startLabel = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
          new Date(`${start}T12:00:00`),
        );
        const endLabel = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
          new Date(`${end}T12:00:00`),
        );
        return t('parentDashboard.gamesScheduleWeekRange', { start: startLabel, end: endLabel });
      } catch {
        return `${start} – ${end}`;
      }
    },
    [i18n.language, t],
  );

  const load = useCallback(async () => {
    if (!studentUserId) {
      setEvents([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const res = await fetchStudentGamesScheduleEvents(studentUserId);
    if (res.ok) {
      setEvents(res.events);
    } else {
      setEvents([]);
      setError(res.error);
    }
    setLoading(false);
  }, [studentUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const keyExtractor = useCallback((event: StudentGamesScheduleEvent) => event.id, []);

  const renderItem = useCallback(
    ({ item }: { item: StudentGamesScheduleEvent }) =>
      studentUserId ? (
        <GamesScheduleEventCard
          event={item}
          studentUserId={studentUserId}
          formatWeekRange={formatWeekRange}
          t={t}
        />
      ) : null,
    [studentUserId, formatWeekRange, t],
  );

  const ItemSeparator = useCallback(() => <View style={styles.listSeparator} />, []);

  const ListHeader = useMemo(
    () => (
      <View style={styles.header}>
        {listHeader}
        <Text style={styles.sectionTitle}>{t('parentDashboard.gamesScheduleEventsTitle')}</Text>
      </View>
    ),
    [listHeader, t],
  );

  const ListEmpty = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={parentBrandBlue} />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{t('parentDashboard.gamesScheduleEventsError')}</Text>
          <ScrollFriendlyPressable
            accessibilityRole="button"
            accessibilityLabel={t('parentDashboard.gamesScheduleEventsRetry')}
            onPress={() => void load()}
            style={styles.retryBtn}
            innerStyle={styles.retryBtnInner}>
            <Text style={styles.retryText}>{t('parentDashboard.gamesScheduleEventsRetry')}</Text>
          </ScrollFriendlyPressable>
        </View>
      );
    }
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="calendar-outline" size={28} color={parentInkSoft} />
        <Text style={styles.emptyTitle}>{t('parentDashboard.gamesScheduleEventsEmptyTitle')}</Text>
        <Text style={styles.emptyBody}>{t('parentDashboard.gamesScheduleEventsEmptyBody')}</Text>
      </View>
    );
  }, [loading, error, t, load]);

  if (!studentUserId) return null;

  return (
    <NativeFluidFlatList
      style={styles.flex1}
      data={!loading && !error ? events : []}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ItemSeparatorComponent={ItemSeparator}
      ListHeaderComponent={ListHeader}
      ListEmptyComponent={ListEmpty}
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: contentPaddingBottom },
        events.length === 0 ? styles.listContentEmpty : null,
      ]}
    />
  );
}

export default memo(GamesScheduleEventsList);

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  listContent: {
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: PAGE_CONTENT_TOP,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  header: { gap: 10, marginBottom: 8 },
  listSeparator: { height: 10 },
  sectionTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: FontFamily.bold,
    color: parentInk,
  },
  card: {
    backgroundColor: parentSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3EEF9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleCol: { flex: 1, gap: 2 },
  cardTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: FontFamily.bold,
    color: parentInk,
  },
  cardMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
  },
  cardNotes: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#E3F2FD',
  },
  chipText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FontFamily.regular,
    color: parentBrandBlueDark,
  },
  comingSoon: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
    fontStyle: 'italic',
  },
  openExamBtn: { borderRadius: 8 },
  openExamBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
    paddingVertical: 8,
  },
  openExamBtnText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: FontFamily.bold,
    color: parentBrandBlue,
    textAlign: 'right',
  },
  centered: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: FontFamily.bold,
    color: parentInk,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
    textAlign: 'center',
  },
  errorWrap: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
    textAlign: 'center',
  },
  retryBtn: { borderRadius: 10 },
  retryBtnInner: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: parentBrandBlue,
  },
  retryText: {
    fontSize: 13,
    fontFamily: FontFamily.bold,
    color: '#FFFFFF',
  },
});
