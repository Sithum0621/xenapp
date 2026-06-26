import { Pressable, StyleSheet, View } from 'react-native';

import { ScrollView } from '@/src/components/layout/scroll';

import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import type { GamesScheduleQuizConfig } from '@/src/services/superadminGamesScheduleApi';
import {
  choiceLetter,
  clampChoiceCount,
  MCQ_MAX_CHOICES,
  MCQ_MIN_CHOICES,
  type DraftMcqQuestion,
  type QuizSetupDraft,
} from '@/src/utils/gamesScheduleMcq';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const PAGE_BG = '#FFFFFF';
const PANEL_BG = '#F8FAFC';
const SUBTLE_BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';

type Props = {
  setup: QuizSetupDraft;
  setupLocked: boolean;
  quizConfig: GamesScheduleQuizConfig | null;
  drafts: DraftMcqQuestion[];
  saving: boolean;
  onSetupChange: (field: keyof QuizSetupDraft, value: string) => void;
  onChoiceCountChange: (value: string) => void;
  onApplySetup: () => void;
  onEditSetup: () => void;
  onChangeQuestion: (clientId: string, value: string) => void;
  onChangeChoice: (clientId: string, choiceIndex: number, value: string) => void;
  onSelectCorrect: (clientId: string, choiceIndex: number) => void;
  onSave: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
};

function SetupField({
  label,
  value,
  onChangeText,
  placeholder,
  editable = true,
  keyboardType = 'number-pad',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  editable?: boolean;
  keyboardType?: 'number-pad' | 'default';
}) {
  return (
    <View style={styles.setupField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        keyboardType={keyboardType}
        editable={editable}
        style={styles.input}
      />
    </View>
  );
}

export default function GamesScheduleEventMcqEditorPanel({
  setup,
  setupLocked,
  quizConfig,
  drafts,
  saving,
  onSetupChange,
  onChoiceCountChange,
  onApplySetup,
  onEditSetup,
  onChangeQuestion,
  onChangeChoice,
  onSelectCorrect,
  onSave,
  t,
}: Props) {
  const choiceCount = quizConfig?.choice_count ?? clampChoiceCount(Number.parseInt(setup.choiceCount, 10) || MCQ_MIN_CHOICES);

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{t('superAdmin.gamesScheduleEventEditorTitle')}</Text>
      <Text style={styles.editorHint}>{t('superAdmin.gamesScheduleMcqEditorHint')}</Text>

      <View style={styles.setupCard}>
        <View style={styles.setupHeader}>
          <Text style={styles.setupTitle}>{t('superAdmin.gamesScheduleMcqSetupTitle')}</Text>
          {setupLocked ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('superAdmin.gamesScheduleMcqEditSetup')}
              onPress={onEditSetup}
              style={({ pressed }) => [styles.editSetupBtn, pressed && { opacity: 0.7 }]}>
              <Text style={styles.editSetupLabel}>{t('superAdmin.gamesScheduleMcqEditSetup')}</Text>
            </Pressable>
          ) : null}
        </View>

        <SetupField
          label={t('superAdmin.gamesScheduleMcqQuestionCountLabel')}
          value={setup.questionCount}
          editable={!setupLocked}
          onChangeText={(value) => onSetupChange('questionCount', value.replace(/[^\d]/g, ''))}
          placeholder={t('superAdmin.gamesScheduleMcqQuestionCountPlaceholder')}
        />

        <Text style={styles.fieldLabel}>{t('superAdmin.gamesScheduleMcqChoiceCountLabel')}</Text>
        <View style={styles.choiceCountRow}>
          {Array.from({ length: MCQ_MAX_CHOICES - MCQ_MIN_CHOICES + 1 }, (_, i) => {
            const count = MCQ_MIN_CHOICES + i;
            const selected = Number.parseInt(setup.choiceCount, 10) === count;
            return (
              <Pressable
                key={count}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                disabled={setupLocked}
                onPress={() => onChoiceCountChange(String(count))}
                style={({ pressed }) => [
                  styles.choiceCountChip,
                  selected && styles.choiceCountChipSelected,
                  setupLocked && styles.choiceCountChipDisabled,
                  pressed && !setupLocked && { opacity: 0.88 },
                ]}>
                <Text
                  style={[
                    styles.choiceCountChipLabel,
                    selected && styles.choiceCountChipLabelSelected,
                  ]}>
                  {count}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>{t('superAdmin.gamesScheduleMcqTimeLimitLabel')}</Text>
        <View style={styles.timeRow}>
          <View style={styles.timeField}>
            <Text style={styles.timeSubLabel}>{t('superAdmin.gamesScheduleMcqTimeHours')}</Text>
            <TextInput
              value={setup.timeHours}
              onChangeText={(value) => onSetupChange('timeHours', value.replace(/[^\d]/g, ''))}
              placeholder="0"
              placeholderTextColor="#94A3B8"
              keyboardType="number-pad"
              editable={!setupLocked}
              style={styles.input}
            />
          </View>
          <View style={styles.timeField}>
            <Text style={styles.timeSubLabel}>{t('superAdmin.gamesScheduleMcqTimeMinutes')}</Text>
            <TextInput
              value={setup.timeMinutes}
              onChangeText={(value) => onSetupChange('timeMinutes', value.replace(/[^\d]/g, ''))}
              placeholder="0"
              placeholderTextColor="#94A3B8"
              keyboardType="number-pad"
              editable={!setupLocked}
              style={styles.input}
            />
          </View>
        </View>

        {!setupLocked ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('superAdmin.gamesScheduleMcqApplySetup')}
            onPress={onApplySetup}
            style={({ pressed }) => [styles.applySetupBtn, pressed && { opacity: 0.88 }]}>
            <Text style={styles.applySetupLabel}>{t('superAdmin.gamesScheduleMcqApplySetup')}</Text>
          </Pressable>
        ) : null}
      </View>

      {setupLocked && quizConfig ? (
        <>
          <ScrollView
            style={styles.editorScroll}
            contentContainerStyle={styles.editorScrollContent}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled>
            {drafts.map((row, index) => (
              <View key={row.clientId} style={styles.questionBlock}>
                <Text style={styles.questionTitle}>
                  {t('superAdmin.gamesScheduleEventQuestionNumber', { number: index + 1 })}
                </Text>

                <Text style={styles.fieldLabel}>{t('superAdmin.gamesScheduleEventQuestionLabel')}</Text>
                <TextInput
                  value={row.question}
                  onChangeText={(value) => onChangeQuestion(row.clientId, value)}
                  placeholder={t('superAdmin.gamesScheduleEventQuestionPlaceholder')}
                  placeholderTextColor="#94A3B8"
                  style={[styles.input, styles.inputMultiline]}
                  multiline
                />

                <Text style={styles.fieldLabel}>{t('superAdmin.gamesScheduleMcqChoicesLabel')}</Text>
                {row.choices.map((choice, choiceIndex) => (
                  <View key={`${row.clientId}-${choiceIndex}`}>
                    <Text style={styles.choiceFieldLabel}>
                      {t('superAdmin.gamesScheduleMcqChoiceLabel', {
                        letter: choiceLetter(choiceIndex),
                      })}
                    </Text>
                    <TextInput
                      value={choice}
                      onChangeText={(value) => onChangeChoice(row.clientId, choiceIndex, value)}
                      placeholder={t('superAdmin.gamesScheduleMcqChoicePlaceholder', {
                        letter: choiceLetter(choiceIndex),
                      })}
                      placeholderTextColor="#94A3B8"
                      style={styles.input}
                    />
                  </View>
                ))}

                <Text style={styles.fieldLabel}>{t('superAdmin.gamesScheduleMcqCorrectLabel')}</Text>
                <Text style={styles.correctHint}>{t('superAdmin.gamesScheduleMcqCorrectHint')}</Text>
                <View style={styles.correctRow}>
                  {row.choices.map((_choice, choiceIndex) => {
                    const selected = row.correctChoiceIndex === choiceIndex;
                    const letter = choiceLetter(choiceIndex);
                    return (
                      <Pressable
                        key={`correct-${row.clientId}-${choiceIndex}`}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        accessibilityLabel={t('superAdmin.gamesScheduleMcqCorrectOptionShort', {
                          letter,
                        })}
                        onPress={() => onSelectCorrect(row.clientId, choiceIndex)}
                        style={({ pressed }) => [
                          styles.correctChip,
                          selected && styles.correctChipSelected,
                          pressed && styles.correctChipPressed,
                        ]}>
                        <Text
                          style={[
                            styles.correctChipLabel,
                            selected && styles.correctChipLabelSelected,
                          ]}>
                          {letter}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('superAdmin.gamesScheduleEventSaveQuestions')}
            disabled={saving}
            onPress={onSave}
            style={({ pressed }) => [
              styles.saveBtn,
              pressed && styles.saveBtnPressed,
              saving && styles.btnDisabled,
            ]}>
            <Text style={styles.saveBtnLabel}>{t('superAdmin.gamesScheduleEventSaveQuestions')}</Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.setupPrompt}>{t('superAdmin.gamesScheduleMcqSetupPrompt')}</Text>
      )}
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
  editorHint: {
    fontSize: 13,
    color: TEXT_MUTED,
    lineHeight: 18,
    marginBottom: 10,
  },
  setupCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PANEL_BG,
    padding: 12,
    gap: 4,
    marginBottom: 12,
  },
  setupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  setupTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  editSetupBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  editSetupLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND_BLUE,
  },
  setupField: {
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
    marginTop: 6,
    marginBottom: 4,
  },
  choiceFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_MUTED,
    marginTop: 4,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: PAGE_BG,
    minHeight: 40,
  },
  inputMultiline: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  choiceCountRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  choiceCountChip: {
    minWidth: 44,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PAGE_BG,
    alignItems: 'center',
  },
  choiceCountChipSelected: {
    borderColor: BRAND_BLUE,
    backgroundColor: BRAND_BLUE,
  },
  choiceCountChipDisabled: {
    opacity: 0.7,
  },
  choiceCountChipLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  choiceCountChipLabelSelected: {
    color: '#FFFFFF',
  },
  timeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  timeField: {
    flex: 1,
  },
  timeSubLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: TEXT_MUTED,
    marginBottom: 4,
  },
  applySetupBtn: {
    marginTop: 10,
    backgroundColor: BRAND_BLUE,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  applySetupLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  setupPrompt: {
    fontSize: 14,
    color: TEXT_MUTED,
    lineHeight: 20,
    marginTop: 4,
  },
  editorScroll: {
    flex: 1,
  },
  editorScrollContent: {
    gap: 12,
    paddingBottom: 8,
  },
  questionBlock: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PANEL_BG,
    padding: 12,
    gap: 2,
  },
  questionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    marginBottom: 4,
  },
  correctHint: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginBottom: 8,
  },
  correctRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  correctChip: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PAGE_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  correctChipSelected: {
    borderColor: BRAND_BLUE,
    backgroundColor: BRAND_BLUE,
  },
  correctChipPressed: {
    opacity: 0.88,
  },
  correctChipLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  correctChipLabelSelected: {
    color: '#FFFFFF',
  },
  saveBtn: {
    marginTop: 10,
    backgroundColor: BRAND_BLUE,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  saveBtnPressed: {
    backgroundColor: BRAND_BLUE_DARK,
  },
  saveBtnLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  btnDisabled: {
    opacity: 0.55,
  },
});
