import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import GamesScheduleEventMcqEditorPanel from '@/src/components/superadmin/GamesScheduleEventMcqEditorPanel';
import GamesScheduleEventMcqPreviewPanel from '@/src/components/superadmin/GamesScheduleEventMcqPreviewPanel';
import { Text } from '@/src/theme/Text';
import { AppRoutes, PROFILE_ROLE_SUPERADMIN, appHref } from '@/src/navigation/AppNavigator';
import {
  fetchGamesScheduleEventDetail,
  saveGamesScheduleEventQuiz,
  type GamesScheduleEvent,
  type GamesScheduleQuizConfig,
} from '@/src/services/superadminGamesScheduleApi';
import { supabase } from '@/src/services/supabaseClient';
import {
  buildDraftQuestions,
  clampChoiceCount,
  draftsFromSavedQuestions,
  MCQ_MIN_CHOICES,
  payloadsFromMcqDrafts,
  quizConfigFromSetup,
  resizeDraftChoices,
  setupFromQuizConfig,
  validateMcqDrafts,
  type DraftMcqQuestion,
  type QuizSetupDraft,
} from '@/src/utils/gamesScheduleMcq';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const PAGE_BG = '#FFFFFF';
const PANEL_BG = '#F8FAFC';
const SUBTLE_BORDER = '#E2E8F0';
const SPLIT_BREAKPOINT = 960;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_SETUP: QuizSetupDraft = {
  questionCount: '5',
  choiceCount: String(MCQ_MIN_CHOICES),
  timeHours: '0',
  timeMinutes: '30',
};

export default function SuperAdminGamesScheduleEventScreen() {
  const { t, i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const { eventId: eventIdParam } = useLocalSearchParams<{ eventId?: string }>();
  const eventId = typeof eventIdParam === 'string' ? eventIdParam.trim() : '';

  const [checkingGate, setCheckingGate] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [event, setEvent] = useState<GamesScheduleEvent | null>(null);
  const [quizConfig, setQuizConfig] = useState<GamesScheduleQuizConfig | null>(null);
  const [setup, setSetup] = useState<QuizSetupDraft>(DEFAULT_SETUP);
  const [setupLocked, setSetupLocked] = useState(false);
  const [drafts, setDrafts] = useState<DraftMcqQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const splitRow = width >= SPLIT_BREAKPOINT;

  const formatWeekRange = useCallback(
    (start: string, end: string) => {
      try {
        const startLabel = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
          new Date(`${start}T12:00:00`),
        );
        const endLabel = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
          new Date(`${end}T12:00:00`),
        );
        return t('superAdmin.gamesScheduleWeekRange', { start: startLabel, end: endLabel });
      } catch {
        return `${start} – ${end}`;
      }
    },
    [i18n.language, t],
  );

  useEffect(() => {
    let cancelled = false;

    const gate = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        router.replace(AppRoutes.login);
        return;
      }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();

      if (cancelled) return;

      if (profile?.role !== PROFILE_ROLE_SUPERADMIN) {
        router.replace(AppRoutes.login);
        return;
      }

      setAuthorized(true);
      setCheckingGate(false);
    };

    void gate();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadDetail = useCallback(async () => {
    if (!UUID_RE.test(eventId)) {
      setLoading(false);
      setLoadError(t('superAdmin.gamesScheduleEventNotFound'));
      return;
    }

    setLoading(true);
    setLoadError(null);
    setErrorMessage(null);

    const { detail, error } = await fetchGamesScheduleEventDetail(eventId);

    setLoading(false);

    if (error) {
      const m = error.toLowerCase();
      setLoadError(
        m.includes('event_not_found')
          ? t('superAdmin.gamesScheduleEventNotFound')
          : error,
      );
      return;
    }

    if (!detail) {
      setLoadError(t('superAdmin.gamesScheduleEventNotFound'));
      return;
    }

    setEvent(detail.event);

    if (detail.quiz) {
      setQuizConfig(detail.quiz);
      setSetup(setupFromQuizConfig(detail.quiz));
      setSetupLocked(true);
      setDrafts(draftsFromSavedQuestions(detail.questions, detail.quiz.choice_count));
    } else {
      setQuizConfig(null);
      setSetup(DEFAULT_SETUP);
      setSetupLocked(false);
      setDrafts([]);
    }
  }, [eventId, t]);

  useEffect(() => {
    if (!authorized) return;
    void loadDetail();
  }, [authorized, loadDetail]);

  const applySetup = () => {
    const config = quizConfigFromSetup(setup);
    if (!config) {
      setErrorMessage(t('superAdmin.gamesScheduleMcqInvalidSetup'));
      return;
    }

    setErrorMessage(null);
    setSaveSuccess(false);
    setQuizConfig(config);
    setSetupLocked(true);
    setDrafts(buildDraftQuestions(config.question_count, config.choice_count));
  };

  const editSetup = () => {
    setSetupLocked(false);
    setSaveSuccess(false);
  };

  const onSetupChange = (field: keyof QuizSetupDraft, value: string) => {
    setSaveSuccess(false);
    setSetup((prev) => ({ ...prev, [field]: value }));
  };

  const onChoiceCountChange = (value: string) => {
    setSaveSuccess(false);
    const count = clampChoiceCount(Number.parseInt(value, 10) || MCQ_MIN_CHOICES);
    setSetup((prev) => ({ ...prev, choiceCount: String(count) }));
    if (setupLocked && drafts.length > 0) {
      setDrafts((prev) => resizeDraftChoices(prev, count));
      setQuizConfig((prev) => (prev ? { ...prev, choice_count: count } : prev));
    }
  };

  const updateQuestion = (clientId: string, value: string) => {
    setSaveSuccess(false);
    setDrafts((prev) =>
      prev.map((row) => (row.clientId === clientId ? { ...row, question: value } : row)),
    );
  };

  const updateChoice = (clientId: string, choiceIndex: number, value: string) => {
    setSaveSuccess(false);
    setDrafts((prev) =>
      prev.map((row) => {
        if (row.clientId !== clientId) return row;
        const choices = [...row.choices];
        choices[choiceIndex] = value;
        return { ...row, choices };
      }),
    );
  };

  const selectCorrect = (clientId: string, choiceIndex: number) => {
    setSaveSuccess(false);
    setDrafts((prev) =>
      prev.map((row) =>
        row.clientId === clientId ? { ...row, correctChoiceIndex: choiceIndex } : row,
      ),
    );
  };

  const mapSaveError = (message: string) => {
    const m = message.toLowerCase();
    if (m.includes('incomplete_question')) {
      return t('superAdmin.gamesScheduleMcqIncompleteQuestion');
    }
    if (m.includes('invalid_correct_choice') || m.includes('missing_correct')) {
      return t('superAdmin.gamesScheduleMcqMissingCorrect');
    }
    if (m.includes('question_count_mismatch')) {
      return t('superAdmin.gamesScheduleMcqQuestionCountMismatch');
    }
    if (m.includes('invalid_question_count')) {
      return t('superAdmin.gamesScheduleMcqInvalidSetup');
    }
    if (m.includes('invalid_choice_count')) {
      return t('superAdmin.gamesScheduleMcqInvalidSetup');
    }
    if (m.includes('invalid_time_limit')) {
      return t('superAdmin.gamesScheduleMcqInvalidSetup');
    }
    if (m.includes('event_not_found')) {
      return t('superAdmin.gamesScheduleEventNotFound');
    }
    return message;
  };

  const saveQuiz = async () => {
    if (!UUID_RE.test(eventId)) return;

    const config = quizConfig ?? quizConfigFromSetup(setup);
    if (!config) {
      setErrorMessage(t('superAdmin.gamesScheduleMcqInvalidSetup'));
      return;
    }

    const validation = validateMcqDrafts(config, drafts);
    if (validation === 'incomplete_question') {
      setErrorMessage(t('superAdmin.gamesScheduleMcqIncompleteQuestion'));
      return;
    }
    if (validation === 'missing_correct') {
      setErrorMessage(t('superAdmin.gamesScheduleMcqMissingCorrect'));
      return;
    }
    if (validation === 'question_count_mismatch') {
      setErrorMessage(t('superAdmin.gamesScheduleMcqQuestionCountMismatch'));
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    const { questions, quiz, error } = await saveGamesScheduleEventQuiz(
      eventId,
      config,
      payloadsFromMcqDrafts(config, drafts),
    );

    setSaving(false);

    if (error) {
      setErrorMessage(mapSaveError(error));
      return;
    }

    const savedConfig = quiz ?? config;
    setQuizConfig(savedConfig);
    setSetup(setupFromQuizConfig(savedConfig));
    setSetupLocked(true);
    setDrafts(draftsFromSavedQuestions(questions, savedConfig.choice_count));
    setSaveSuccess(true);
  };

  const headerSubtitle = useMemo(() => {
    if (!event) return '';
    return `${event.subject_name} · ${formatWeekRange(event.week_starts_on, event.week_ends_on)}`;
  }, [event, formatWeekRange]);

  if (checkingGate) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.centeredBusy}>
          <ActivityIndicator color={BRAND_BLUE} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!UUID_RE.test(eventId)) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.pagePad}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('auth.back')}
            onPress={() => routerBackOrReplace(router, appHref(AppRoutes.superAdminDashboard))}
            style={({ pressed }) => [styles.backRow, pressed && styles.backRowPressed]}>
            <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
            <Text style={styles.backText}>{t('auth.back')}</Text>
          </Pressable>
          <Text style={styles.errorBanner}>{t('superAdmin.gamesScheduleEventNotFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('auth.back')}
          onPress={() => routerBackOrReplace(router, appHref(AppRoutes.superAdminDashboard))}
          style={({ pressed }) => [styles.backRow, pressed && styles.backRowPressed]}>
          <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
          <Text style={styles.backText}>{t('auth.back')}</Text>
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle} numberOfLines={2}>
            {event?.title ?? t('superAdmin.gamesScheduleEventEditorPageTitle')}
          </Text>
          {headerSubtitle ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {headerSubtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centeredBusy}>
          <ActivityIndicator color={BRAND_BLUE} size="large" />
        </View>
      ) : loadError ? (
        <View style={styles.pagePad}>
          <Text style={styles.errorBanner}>{loadError}</Text>
        </View>
      ) : event ? (
        <View style={styles.body}>
          {errorMessage ? <Text style={[styles.errorBanner, styles.bannerInset]}>{errorMessage}</Text> : null}
          {saveSuccess ? (
            <Text style={[styles.successBanner, styles.bannerInset]}>
              {t('superAdmin.gamesScheduleEventSaveSuccess')}
            </Text>
          ) : null}

          <View style={[styles.split, splitRow && styles.splitRow]}>
            <View style={[styles.splitPane, splitRow && styles.splitPaneLeft]}>
              <GamesScheduleEventMcqEditorPanel
                setup={setup}
                setupLocked={setupLocked}
                quizConfig={quizConfig}
                drafts={drafts}
                saving={saving}
                onSetupChange={onSetupChange}
                onChoiceCountChange={onChoiceCountChange}
                onApplySetup={applySetup}
                onEditSetup={editSetup}
                onChangeQuestion={updateQuestion}
                onChangeChoice={updateChoice}
                onSelectCorrect={selectCorrect}
                onSave={() => void saveQuiz()}
                t={t}
              />
            </View>

            <View style={[styles.splitPane, splitRow && styles.splitPaneRight]}>
              <GamesScheduleEventMcqPreviewPanel
                event={event}
                quizConfig={quizConfig}
                drafts={drafts}
                formatWeekRange={formatWeekRange}
                t={t}
              />
            </View>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PANEL_BG,
  },
  centeredBusy: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagePad: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SUBTLE_BORDER,
    backgroundColor: PAGE_BG,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingRight: 8,
    gap: 2,
  },
  backRowPressed: {
    opacity: 0.7,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  headerSpacer: {
    width: 40,
  },
  body: {
    flex: 1,
  },
  errorBanner: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    color: '#991B1B',
    fontSize: 14,
    lineHeight: 20,
  },
  successBanner: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    color: '#047857',
    fontSize: 14,
    lineHeight: 20,
  },
  bannerInset: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  split: {
    flex: 1,
    padding: 16,
    gap: 16,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  splitPane: {
    flex: 1,
    minHeight: 280,
  },
  splitPaneLeft: {
    flex: 1,
    minWidth: 0,
  },
  splitPaneRight: {
    flex: 1,
    minWidth: 0,
  },
});
