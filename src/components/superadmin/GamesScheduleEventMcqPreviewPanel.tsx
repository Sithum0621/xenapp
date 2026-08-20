import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ScrollView } from '@/src/components/layout/scroll';

import { Text } from '@/src/theme/Text';
import type { GamesScheduleEvent, GamesScheduleQuizConfig } from '@/src/services/superadminGamesScheduleApi';
import {
  choiceLetter,
  formatQuizTimeLabel,
  previewMcqItems,
  type DraftMcqQuestion,
} from '@/src/utils/gamesScheduleMcq';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const PAGE_BG = '#FFFFFF';
const PANEL_BG = '#F8FAFC';
const SUBTLE_BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const GREEN_OK = '#15803D';

type Props = {
  event: GamesScheduleEvent;
  quizConfig: GamesScheduleQuizConfig | null;
  drafts: DraftMcqQuestion[];
  formatWeekRange: (start: string, end: string) => string;
  t: (key: string, opts?: Record<string, unknown>) => string;
};

export default function GamesScheduleEventMcqPreviewPanel({
  event,
  quizConfig,
  drafts,
  formatWeekRange,
  t,
}: Props) {
  const [selections, setSelections] = useState<Record<string, number>>({});

  const choiceCount = quizConfig?.choice_count ?? 4;
  const items = previewMcqItems(drafts, choiceCount);

  const selectChoice = (questionKey: string, choiceIndex: number) => {
    setSelections((prev) => ({ ...prev, [questionKey]: choiceIndex }));
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{t('superAdmin.gamesScheduleEventPreviewTitle')}</Text>
      <Text style={styles.previewHint}>{t('superAdmin.gamesScheduleMcqPreviewHint')}</Text>

      <ScrollView style={styles.previewScroll} contentContainerStyle={styles.previewScrollContent}>
        <View style={styles.previewCard}>
          <Text style={styles.previewEventTitle}>{event.title}</Text>
          <Text style={styles.previewEventMeta}>
            {event.subject_name} · {formatWeekRange(event.week_starts_on, event.week_ends_on)}
          </Text>
          {event.notes?.trim() ? <Text style={styles.previewEventNotes}>{event.notes}</Text> : null}

          {quizConfig ? (
            <View style={styles.quizMeta}>
              <Text style={styles.quizMetaLine}>
                {t('superAdmin.gamesScheduleMcqPreviewMetaQuestions', {
                  count: quizConfig.question_count,
                })}
              </Text>
              <Text style={styles.quizMetaLine}>
                {t('superAdmin.gamesScheduleMcqPreviewMetaChoices', {
                  count: quizConfig.choice_count,
                })}
              </Text>
              <Text style={styles.quizMetaLine}>
                {t('superAdmin.gamesScheduleMcqPreviewMetaTime', {
                  time: formatQuizTimeLabel(quizConfig.time_limit_minutes, t),
                })}
              </Text>
            </View>
          ) : null}

          {items.length === 0 ? (
            <Text style={styles.previewEmpty}>{t('superAdmin.gamesScheduleEventPreviewEmpty')}</Text>
          ) : (
            <View style={styles.previewList}>
              {items.map((item) => {
                const selectedIndex = selections[item.key];
                const hasSelected = selectedIndex !== undefined;
                const correctIndex = item.correctChoiceIndex;
                const showReveal = hasSelected && correctIndex !== null && correctIndex >= 0;
                const selectedIsCorrect = showReveal && selectedIndex === correctIndex;

                return (
                  <View key={item.key} style={styles.previewQuestionCard}>
                    <Text style={styles.previewQaNumber}>
                      {t('superAdmin.gamesScheduleEventQuestionNumber', { number: item.index })}
                    </Text>
                    <Text style={styles.previewQuestion}>{item.question || '—'}</Text>

                    <View style={styles.choiceList}>
                      {item.choices.map((choice, choiceIndex) => {
                        if (!choice) return null;
                        const isSelected = selectedIndex === choiceIndex;
                        return (
                          <Pressable
                            key={`${item.key}-${choiceIndex}`}
                            accessibilityRole="button"
                            onPress={() => selectChoice(item.key, choiceIndex)}
                            style={({ pressed }) => [
                              styles.choiceBtn,
                              isSelected && styles.choiceBtnSelected,
                              pressed && { opacity: 0.9 },
                            ]}>
                            <Text style={styles.choiceLetter}>{choiceLetter(choiceIndex)}</Text>
                            <Text style={styles.choiceText}>{choice}</Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {showReveal ? (
                      <View
                        style={[
                          styles.revealBox,
                          selectedIsCorrect ? styles.revealBoxCorrect : styles.revealBoxIncorrect,
                        ]}>
                        <Text style={styles.revealTitle}>
                          {selectedIsCorrect
                            ? t('superAdmin.gamesScheduleMcqPreviewCorrect')
                            : t('superAdmin.gamesScheduleMcqPreviewIncorrect')}
                        </Text>
                        <Text style={styles.revealAnswer}>
                          {t('superAdmin.gamesScheduleMcqPreviewCorrectAnswer', {
                            letter: choiceLetter(correctIndex),
                            answer: item.choices[correctIndex] || '—',
                          })}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.revealHidden}>
                        {t('superAdmin.gamesScheduleMcqPreviewAnswerHidden')}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PAGE_BG,
    padding: 14,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    marginBottom: 4,
  },
  previewHint: {
    fontSize: 13,
    color: TEXT_MUTED,
    lineHeight: 18,
    marginBottom: 12,
  },
  previewScroll: {
    flex: 1,
  },
  previewScrollContent: {
    paddingBottom: 8,
  },
  previewCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PANEL_BG,
    padding: 14,
    gap: 8,
  },
  previewEventTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
  },
  previewEventMeta: {
    fontSize: 13,
    color: TEXT_MUTED,
  },
  previewEventNotes: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
  },
  quizMeta: {
    marginTop: 4,
    padding: 10,
    borderRadius: 8,
    backgroundColor: PAGE_BG,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    gap: 4,
  },
  quizMetaLine: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
  previewEmpty: {
    fontSize: 14,
    color: TEXT_MUTED,
    marginTop: 8,
    lineHeight: 20,
  },
  previewList: {
    marginTop: 8,
    gap: 12,
  },
  previewQuestionCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PAGE_BG,
    padding: 12,
    gap: 8,
  },
  previewQaNumber: {
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  previewQuestion: {
    fontSize: 15,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    lineHeight: 22,
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
    borderColor: SUBTLE_BORDER,
    backgroundColor: PANEL_BG,
  },
  choiceBtnSelected: {
    borderColor: BRAND_BLUE,
    backgroundColor: '#E3F2FD',
  },
  choiceLetter: {
    width: 22,
    fontSize: 14,
    fontWeight: '800',
    color: BRAND_BLUE,
  },
  choiceText: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    lineHeight: 20,
  },
  revealHidden: {
    fontSize: 12,
    color: TEXT_MUTED,
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
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  revealAnswer: {
    fontSize: 14,
    color: GREEN_OK,
    fontWeight: '600',
    lineHeight: 20,
  },
});
