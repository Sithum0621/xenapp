import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import GamesScheduleExamScoreResult from '@/src/components/parent/GamesScheduleExamScoreResult';
import GamesScheduleExamTimer from '@/src/components/parent/GamesScheduleExamTimer';
import {
  checkStudentGamesScheduleChoice,
  type StudentGamesScheduleAttempt,
  type StudentGamesScheduleAttemptAnswer,
  type StudentGamesScheduleEventDetail,
} from '@/src/services/studentGamesScheduleApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import {
  parentBrandBlue,
  parentBrandBlueDark,
  parentInk,
  parentInkSoft,
  parentSurface,
} from '@/src/theme/parentDashboardPalette';
import { choiceLetter } from '@/src/utils/gamesScheduleMcq';
import { formatGamesScheduleDurationLabel } from '@/src/utils/gamesScheduleDuration';

type QuestionReveal = {
  selectedIndex: number;
  isCorrect: boolean;
  correctChoiceIndex: number;
  correctChoiceText: string;
};

export type GamesScheduleExamPaperProps = {
  studentUserId: string;
  detail: StudentGamesScheduleEventDetail;
  attempt: StudentGamesScheduleAttempt;
  remainingSeconds: number;
  onAttemptChange: (attempt: StudentGamesScheduleAttempt) => void;
  formatWeekRange: (start: string, end: string) => string;
  t: (key: string, opts?: Record<string, unknown>) => string;
};

function revealsFromAttemptAnswers(
  answers: StudentGamesScheduleAttemptAnswer[],
): Record<string, QuestionReveal> {
  const map: Record<string, QuestionReveal> = {};
  for (const row of answers) {
    map[row.question_id] = {
      selectedIndex: row.choice_index,
      isCorrect: row.is_correct,
      correctChoiceIndex: row.choice_index,
      correctChoiceText: '',
    };
  }
  return map;
}

export default function GamesScheduleExamPaper({
  studentUserId,
  detail,
  attempt,
  remainingSeconds,
  onAttemptChange,
  formatWeekRange,
  t,
}: GamesScheduleExamPaperProps) {
  const { event, questions, quiz } = detail;
  const examLocked = attempt.status === 'completed';
  const [reveals, setReveals] = useState<Record<string, QuestionReveal>>(() =>
    revealsFromAttemptAnswers(attempt.answers),
  );
  const [checkingId, setCheckingId] = useState<string | null>(null);

  useEffect(() => {
    setReveals(revealsFromAttemptAnswers(attempt.answers));
  }, [attempt.answers, attempt.status]);

  const totalQuestions = attempt.total_questions || quiz?.question_count || questions.length;
  const score = attempt.score;

  const scoreTitle = t('parentDashboard.gamesScheduleExamScoreResult', {
    score,
    total: totalQuestions,
  });

  const scoreSubtitle = useMemo(() => {
    if (attempt.completion_reason === 'time_up') {
      return t('parentDashboard.gamesScheduleExamScoreTimeUp');
    }
    if (attempt.completion_reason === 'all_answered') {
      return t('parentDashboard.gamesScheduleExamScoreAllAnswered');
    }
    return t('parentDashboard.gamesScheduleExamScoreFinal');
  }, [attempt.completion_reason, t]);

  const selectChoice = useCallback(
    async (questionId: string, choiceIndex: number) => {
      if (examLocked || reveals[questionId] || checkingId === questionId) return;

      setCheckingId(questionId);
      const res = await checkStudentGamesScheduleChoice(studentUserId, questionId, choiceIndex);
      setCheckingId(null);

      if (!res.ok) return;

      setReveals((prev) => ({
        ...prev,
        [questionId]: {
          selectedIndex: choiceIndex,
          isCorrect: res.result.is_correct,
          correctChoiceIndex: res.result.correct_choice_index,
          correctChoiceText: res.result.correct_choice_text,
        },
      }));

      if (res.result.attempt) {
        onAttemptChange(res.result.attempt);
      }
    },
    [checkingId, examLocked, onAttemptChange, reveals, studentUserId],
  );

  const choiceCount = quiz?.choice_count ?? 4;

  return (
    <View style={styles.paper}>
      <Text style={styles.eventTitle}>{event.title}</Text>
      <Text style={styles.eventMeta}>
        {event.subject_name} · {formatWeekRange(event.week_starts_on, event.week_ends_on)}
      </Text>
      {event.notes?.trim() ? <Text style={styles.eventNotes}>{event.notes}</Text> : null}

      {examLocked ? (
        <>
          <GamesScheduleExamScoreResult
            score={score}
            total={totalQuestions}
            title={scoreTitle}
            subtitle={scoreSubtitle}
          />
          <Text style={styles.lockedNote}>{t('parentDashboard.gamesScheduleExamRetakeLocked')}</Text>
        </>
      ) : (
        <>
          <GamesScheduleExamTimer
            remainingSeconds={remainingSeconds}
            label={t('parentDashboard.gamesScheduleExamTimerLabel')}
          />

          {quiz ? (
            <View style={styles.quizMeta}>
              <Text style={styles.quizMetaLine}>
                {t('parentDashboard.gamesScheduleExamMetaQuestions', { count: quiz.question_count })}
              </Text>
              <Text style={styles.quizMetaLine}>
                {t('parentDashboard.gamesScheduleExamMetaTime', {
                  time: formatGamesScheduleDurationLabel(quiz.time_limit_minutes, t),
                })}
              </Text>
            </View>
          ) : null}

          <Text style={styles.hint}>{t('parentDashboard.gamesScheduleExamHint')}</Text>

          {questions.length === 0 ? (
            <Text style={styles.empty}>{t('parentDashboard.gamesScheduleExamEmpty')}</Text>
          ) : (
            <View style={styles.questionList}>
              {questions.map((item, index) => {
                const reveal = reveals[item.id];
                const busy = checkingId === item.id;
                const choices = item.choices.slice(0, choiceCount);

                return (
                  <View key={item.id} style={styles.questionCard}>
                    <Text style={styles.questionNumber}>
                      {t('parentDashboard.gamesScheduleExamQuestionNumber', { number: index + 1 })}
                    </Text>
                    <Text style={styles.questionText}>{item.question || '—'}</Text>

                    <View style={styles.choiceList}>
                      {choices.map((choice, choiceIndex) => {
                        if (!choice.trim()) return null;
                        const isSelected = reveal?.selectedIndex === choiceIndex;
                        return (
                          <Pressable
                            key={`${item.id}-${choiceIndex}`}
                            accessibilityRole="button"
                            disabled={Boolean(reveal) || busy || examLocked}
                            onPress={() => void selectChoice(item.id, choiceIndex)}
                            style={({ pressed }) => [
                              styles.choiceBtn,
                              isSelected && styles.choiceBtnSelected,
                              pressed && !reveal && !busy && styles.choiceBtnPressed,
                              (reveal || busy) && !isSelected && styles.choiceBtnDisabled,
                            ]}>
                            <Text style={styles.choiceLetter}>{choiceLetter(choiceIndex)}</Text>
                            <Text style={styles.choiceText}>{choice}</Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {reveal ? (
                      <View
                        style={[
                          styles.revealBox,
                          reveal.isCorrect ? styles.revealBoxCorrect : styles.revealBoxIncorrect,
                        ]}>
                        <Text style={styles.revealTitle}>
                          {reveal.isCorrect
                            ? t('parentDashboard.gamesScheduleExamCorrect')
                            : t('parentDashboard.gamesScheduleExamIncorrect')}
                        </Text>
                        {reveal.correctChoiceText ? (
                          <Text style={styles.revealAnswer}>
                            {t('parentDashboard.gamesScheduleExamCorrectAnswer', {
                              letter: choiceLetter(reveal.correctChoiceIndex),
                              answer: reveal.correctChoiceText,
                            })}
                          </Text>
                        ) : null}
                      </View>
                    ) : (
                      <Text style={styles.revealHidden}>
                        {t('parentDashboard.gamesScheduleExamAnswerHidden')}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  paper: {
    backgroundColor: parentSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 12,
  },
  eventTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: FontFamily.bold,
    color: parentBrandBlueDark,
  },
  eventMeta: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
  },
  eventNotes: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
  },
  lockedNote: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  quizMeta: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  quizMetaLine: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FontFamily.bold,
    color: parentBrandBlueDark,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
  },
  empty: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
    marginTop: 8,
  },
  questionList: {
    gap: 12,
  },
  questionCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 12,
    gap: 8,
  },
  questionNumber: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: FontFamily.bold,
    color: parentInkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  questionText: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: FontFamily.bold,
    color: parentInk,
  },
  choiceList: {
    gap: 8,
  },
  choiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: parentSurface,
  },
  choiceBtnSelected: {
    borderColor: parentBrandBlue,
    backgroundColor: '#EFF6FF',
  },
  choiceBtnPressed: {
    opacity: 0.9,
  },
  choiceBtnDisabled: {
    opacity: 0.72,
  },
  choiceLetter: {
    width: 22,
    fontSize: 14,
    fontFamily: FontFamily.bold,
    color: parentBrandBlue,
  },
  choiceText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FontFamily.regular,
    color: parentInk,
  },
  revealHidden: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
    fontStyle: 'italic',
  },
  revealBox: {
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  revealBoxCorrect: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  revealBoxIncorrect: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  revealTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FontFamily.bold,
    color: parentBrandBlueDark,
  },
  revealAnswer: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FontFamily.bold,
    color: '#15803D',
  },
});
