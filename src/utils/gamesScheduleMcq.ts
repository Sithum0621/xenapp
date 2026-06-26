import type {
  GamesScheduleEventQuestion,
  GamesScheduleQuizConfig,
} from '@/src/services/superadminGamesScheduleApi';

export const MCQ_MIN_CHOICES = 3;
export const MCQ_MAX_CHOICES = 5;
export const MCQ_MAX_QUESTIONS = 100;

export type DraftMcqQuestion = {
  clientId: string;
  question: string;
  choices: string[];
  correctChoiceIndex: number | null;
};

export type QuizSetupDraft = {
  questionCount: string;
  choiceCount: string;
  timeHours: string;
  timeMinutes: string;
};

export function choiceLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

export function emptyChoices(count: number): string[] {
  return Array.from({ length: count }, () => '');
}

export function newDraftQuestion(choiceCount: number): DraftMcqQuestion {
  return {
    clientId: `q-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    question: '',
    choices: emptyChoices(choiceCount),
    correctChoiceIndex: null,
  };
}

export function buildDraftQuestions(count: number, choiceCount: number): DraftMcqQuestion[] {
  const safeCount = Math.max(1, Math.min(count, MCQ_MAX_QUESTIONS));
  const safeChoices = Math.max(MCQ_MIN_CHOICES, Math.min(choiceCount, MCQ_MAX_CHOICES));
  return Array.from({ length: safeCount }, () => newDraftQuestion(safeChoices));
}

export function parsePositiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export function clampChoiceCount(value: number): number {
  return Math.max(MCQ_MIN_CHOICES, Math.min(value, MCQ_MAX_CHOICES));
}

export function timeLimitMinutesFromSetup(hours: string, minutes: string): number {
  const h = parsePositiveInt(hours, 0);
  const m = parsePositiveInt(minutes, 0);
  return h * 60 + m;
}

export function setupFromTimeLimitMinutes(total: number): Pick<QuizSetupDraft, 'timeHours' | 'timeMinutes'> {
  const safe = Math.max(0, total);
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return {
    timeHours: String(hours),
    timeMinutes: String(minutes),
  };
}

export function quizConfigFromSetup(setup: QuizSetupDraft): GamesScheduleQuizConfig | null {
  const question_count = parsePositiveInt(setup.questionCount, 0);
  const choice_count = clampChoiceCount(parsePositiveInt(setup.choiceCount, MCQ_MIN_CHOICES));
  const time_limit_minutes = timeLimitMinutesFromSetup(setup.timeHours, setup.timeMinutes);

  if (question_count < 1 || question_count > MCQ_MAX_QUESTIONS) return null;
  if (time_limit_minutes < 1) return null;

  return { question_count, choice_count, time_limit_minutes };
}

export function setupFromQuizConfig(config: GamesScheduleQuizConfig): QuizSetupDraft {
  const time = setupFromTimeLimitMinutes(config.time_limit_minutes);
  return {
    questionCount: String(config.question_count),
    choiceCount: String(config.choice_count),
    timeHours: time.timeHours,
    timeMinutes: time.timeMinutes,
  };
}

export function draftsFromSavedQuestions(
  rows: GamesScheduleEventQuestion[],
  choiceCount: number,
): DraftMcqQuestion[] {
  if (rows.length === 0) return buildDraftQuestions(1, choiceCount);

  return rows
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row) => {
      const choices = emptyChoices(choiceCount);
      row.choices.forEach((text, index) => {
        if (index < choices.length) choices[index] = text;
      });
      return {
        clientId: row.id,
        question: row.question,
        choices,
        correctChoiceIndex:
          row.correct_choice_index >= 0 && row.correct_choice_index < choiceCount
            ? row.correct_choice_index
            : null,
      };
    });
}

export function resizeDraftChoices(drafts: DraftMcqQuestion[], choiceCount: number): DraftMcqQuestion[] {
  return drafts.map((row) => {
    const nextChoices = emptyChoices(choiceCount);
    row.choices.forEach((text, index) => {
      if (index < nextChoices.length) nextChoices[index] = text;
    });
    const correctChoiceIndex =
      row.correctChoiceIndex !== null && row.correctChoiceIndex < choiceCount
        ? row.correctChoiceIndex
        : null;
    return { ...row, choices: nextChoices, correctChoiceIndex };
  });
}

export function formatQuizTimeLabel(
  minutes: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) {
    return t('superAdmin.gamesScheduleMcqTimeHoursMinutes', { hours: h, minutes: m });
  }
  if (h > 0) {
    return t('superAdmin.gamesScheduleMcqTimeHoursOnly', { hours: h });
  }
  return t('superAdmin.gamesScheduleMcqTimeMinutesOnly', { minutes: m });
}

export type McqValidationError =
  | 'invalid_setup'
  | 'incomplete_question'
  | 'missing_correct'
  | 'question_count_mismatch';

export function validateMcqDrafts(
  config: GamesScheduleQuizConfig,
  drafts: DraftMcqQuestion[],
): McqValidationError | null {
  if (drafts.length !== config.question_count) return 'question_count_mismatch';

  for (const row of drafts) {
    if (!row.question.trim()) return 'incomplete_question';
    if (row.choices.length !== config.choice_count) return 'incomplete_question';
    if (row.choices.some((c) => !c.trim())) return 'incomplete_question';
    if (row.correctChoiceIndex === null) return 'missing_correct';
    if (row.correctChoiceIndex < 0 || row.correctChoiceIndex >= config.choice_count) {
      return 'missing_correct';
    }
  }

  return null;
}

export function payloadsFromMcqDrafts(config: GamesScheduleQuizConfig, drafts: DraftMcqQuestion[]) {
  return drafts.map((row, sort_order) => ({
    question: row.question.trim(),
    choices: row.choices.map((c) => c.trim()),
    correct_choice_index: row.correctChoiceIndex as number,
    sort_order,
  }));
}

export function previewMcqItems(drafts: DraftMcqQuestion[], choiceCount: number) {
  return drafts
    .map((row, index) => ({
      key: row.clientId,
      index: index + 1,
      question: row.question.trim(),
      choices: row.choices.map((c) => c.trim()).slice(0, choiceCount),
      correctChoiceIndex: row.correctChoiceIndex,
    }))
    .filter((row) => row.question.length > 0 || row.choices.some((c) => c.length > 0));
}
