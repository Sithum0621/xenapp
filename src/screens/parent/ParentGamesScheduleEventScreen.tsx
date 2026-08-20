import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import GamesScheduleExamPaper from '@/src/components/parent/GamesScheduleExamPaper';
import GamesScheduleExamStartModal from '@/src/components/parent/GamesScheduleExamStartModal';
import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import BrandHeader from '@/src/components/parent/BrandHeader';
import { useActiveGamesScheduleExam } from '@/src/contexts/ActiveGamesScheduleExamContext';
import { useExamCountdown } from '@/src/hooks/useExamCountdown';
import {
  fetchStudentGamesScheduleEvent,
  startStudentGamesScheduleAttempt,
  syncStudentGamesScheduleAttempt,
  type StudentGamesScheduleAttempt,
  type StudentGamesScheduleEventDetail,
} from '@/src/services/studentGamesScheduleApi';
import { formatGamesScheduleDurationLabel } from '@/src/utils/gamesScheduleDuration';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import {
  parentBrandBlue,
  parentBrandBlueDark,
  parentInkSoft,
  parentSurface,
  parentSurfaceAlt,
} from '@/src/theme/parentDashboardPalette';

export default function ParentGamesScheduleEventScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ studentId?: string | string[]; eventId?: string | string[] }>();

  const studentId = Array.isArray(params.studentId) ? params.studentId[0] : params.studentId;
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;

  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [detail, setDetail] = useState<StudentGamesScheduleEventDetail | null>(null);
  const [attempt, setAttempt] = useState<StudentGamesScheduleAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [examStarted, setExamStarted] = useState(false);
  const expireSyncRef = useRef(false);
  const { refresh: refreshActiveExam, registerActiveExam } = useActiveGamesScheduleExam();

  const publishActiveExam = useCallback(
    (
      detailSnapshot: StudentGamesScheduleEventDetail,
      attemptSnapshot: StudentGamesScheduleAttempt,
    ) => {
      if (
        !studentId ||
        !eventId ||
        attemptSnapshot.status !== 'in_progress' ||
        !attemptSnapshot.deadline_at
      ) {
        return;
      }

      registerActiveExam({
        student_user_id: studentId,
        event_id: eventId,
        event_title: detailSnapshot.event.title,
        deadline_at: attemptSnapshot.deadline_at,
        remaining_seconds: attemptSnapshot.remaining_seconds,
      });
    },
    [eventId, registerActiveExam, studentId],
  );

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

  const handleAttemptSync = useCallback(async () => {
    if (!studentId || !eventId) return;
    const res = await syncStudentGamesScheduleAttempt(studentId, eventId);
    if (res.ok) {
      setAttempt(res.attempt);
      if (res.attempt.status !== 'none') setExamStarted(true);
      if (detail) publishActiveExam(detail, res.attempt);
    }
  }, [detail, eventId, publishActiveExam, studentId]);

  const handleTimeExpired = useCallback(() => {
    if (expireSyncRef.current) return;
    expireSyncRef.current = true;
    void handleAttemptSync().finally(() => {
      expireSyncRef.current = false;
    });
  }, [handleAttemptSync]);

  const timerActive = examStarted && attempt?.status === 'in_progress';
  const remainingSeconds = useExamCountdown(
    attempt?.deadline_at,
    Boolean(timerActive),
    handleTimeExpired,
  );

  const load = useCallback(async () => {
    if (!studentId || !eventId) {
      setLoading(false);
      setDetail(null);
      setAttempt(null);
      setError(t('parentDashboard.gamesScheduleExamErrorMissing'));
      return;
    }

    setLoading(true);
    setError(null);

    const res = await fetchStudentGamesScheduleEvent(studentId, eventId);
    setLoading(false);

    if (res.ok) {
      setDetail(res.detail);
      setAttempt(res.detail.attempt);
      if (res.detail.attempt.status !== 'none') {
        setExamStarted(true);
      } else {
        setExamStarted(false);
      }
      publishActiveExam(res.detail, res.detail.attempt);
      return;
    }

    setDetail(null);
    setAttempt(null);
    if (res.code === 'not_authorized') {
      setError(t('parentDashboard.gamesScheduleExamErrorNotAuthorized'));
    } else if (res.code === 'event_not_available') {
      setError(t('parentDashboard.gamesScheduleExamErrorUnavailable'));
    } else {
      setError(t('parentDashboard.gamesScheduleExamErrorGeneric'));
    }
  }, [eventId, publishActiveExam, studentId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      void refreshActiveExam();
    };
  }, [refreshActiveExam]);

  useEffect(() => {
    void refreshActiveExam();
  }, [attempt?.status, refreshActiveExam]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && examStarted && attempt?.status === 'in_progress') {
        void handleAttemptSync();
      }
    });
    return () => sub.remove();
  }, [attempt?.status, examStarted, handleAttemptSync]);

  const handleStartExam = useCallback(async () => {
    if (!studentId || !eventId || starting) return;
    setStarting(true);
    const res = await startStudentGamesScheduleAttempt(studentId, eventId);
    setStarting(false);
    if (res.ok) {
      setAttempt(res.attempt);
      setExamStarted(true);
      if (detail) publishActiveExam(detail, res.attempt);
      void refreshActiveExam();
      return;
    }
    setError(t('parentDashboard.gamesScheduleExamErrorGeneric'));
  }, [detail, eventId, publishActiveExam, refreshActiveExam, starting, studentId, t]);

  const durationLabel = detail
    ? formatGamesScheduleDurationLabel(
        detail.quiz?.time_limit_minutes ?? detail.event.quiz_time_limit_minutes,
        t,
      )
    : '';

  const showStartModal = Boolean(
    !loading && detail && !error && !examStarted && attempt?.status === 'none',
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <BrandHeader />
      <GamesScheduleExamStartModal
        visible={showStartModal}
        durationLabel={durationLabel}
        onStart={() => void handleStartExam()}
        onLater={() => router.back()}
      />
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('appLock.back')}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}>
          <Ionicons name="chevron-back" size={22} color={parentBrandBlueDark} />
          <Text style={styles.backLabel}>{t('appLock.back')}</Text>
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardExtraPadding={32}>
        <Text style={styles.screenTitle}>{t('parentDashboard.gamesScheduleExamTitle')}</Text>

        {loading || starting ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={parentBrandBlue} />
            <Text style={styles.statusText}>
              {starting
                ? t('parentDashboard.gamesScheduleExamStarting')
                : t('parentDashboard.gamesScheduleExamLoading')}
            </Text>
          </View>
        ) : null}

        {!loading && !starting && error ? (
          <View style={styles.messageCard}>
            <Ionicons name="alert-circle-outline" size={28} color={parentBrandBlue} />
            <Text style={styles.messageTitle}>{t('parentDashboard.gamesScheduleExamErrorTitle')}</Text>
            <Text style={styles.messageBody}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void load()}
              style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}>
              <Text style={styles.retryLabel}>{t('parentDashboard.gamesScheduleEventsRetry')}</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !starting && detail && studentId && attempt && examStarted ? (
          <GamesScheduleExamPaper
            studentUserId={studentId}
            detail={detail}
            attempt={attempt}
            remainingSeconds={remainingSeconds}
            onAttemptChange={setAttempt}
            formatWeekRange={formatWeekRange}
            t={t}
          />
        ) : null}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: parentSurfaceAlt },
  topBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: parentSurface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  backBtnPressed: { opacity: 0.7 },
  backLabel: {
    fontSize: 15,
    fontFamily: FontFamily.bold,
    color: parentBrandBlueDark,
  },
  scroll: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  screenTitle: {
    fontSize: 18,
    fontFamily: FontFamily.bold,
    color: parentBrandBlueDark,
    textAlign: 'center',
  },
  centered: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 40,
  },
  statusText: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
  },
  messageCard: {
    backgroundColor: parentSurface,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 10,
  },
  messageTitle: {
    fontSize: 17,
    fontFamily: FontFamily.bold,
    color: parentBrandBlueDark,
    textAlign: 'center',
  },
  messageBody: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: parentBrandBlue,
  },
  retryBtnPressed: { opacity: 0.88 },
  retryLabel: {
    fontSize: 14,
    fontFamily: FontFamily.bold,
    color: '#FFFFFF',
  },
});
