import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { createMcqQuestion, fetchMcqQuestions, type McqQuestionRow } from '@/src/services/teacherGroupWorkspaceApi';
import type { TeacherGroupRouteContext } from '@/src/utils/teacherGroupRouteParams';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const BORDER = '#E2E8F0';
const PAGE_SURFACE = '#F8FAFC';
const TEXT_MUTED = '#64748B';
const GREEN_OK = '#15803D';

type Props = { ctx: TeacherGroupRouteContext };

export default function TeacherGroupMcqPanel({ ctx }: Props) {
  const { t } = useTranslation();
  const gd = (k: string, o?: Record<string, unknown>) => t(`teacherDashboard.groupDetail.${k}`, o);

  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [saved, setSaved] = useState<McqQuestionRow[]>([]);

  const [mcqQuestion, setMcqQuestion] = useState('');
  const [mcqAnswers, setMcqAnswers] = useState(['', '', '', '']);
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    const { rows, error } = await fetchMcqQuestions(ctx);
    if (error) setListError(error);
    else setSaved(rows);
    setLoading(false);
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveMcq = async () => {
    const q = mcqQuestion.trim();
    const answers = mcqAnswers.map((a) => a.trim()) as [string, string, string, string];
    if (!q) {
      appAlert(gd('mcqValidationTitle'), gd('mcqQuestionRequired'));
      return;
    }
    if (answers.some((a) => !a)) {
      appAlert(gd('mcqValidationTitle'), gd('mcqAnswersRequired'));
      return;
    }
    if (correctIndex === null) {
      appAlert(gd('mcqValidationTitle'), gd('mcqCorrectRequired'));
      return;
    }

    setSaveBusy(true);
    const { error } = await createMcqQuestion(ctx, q, answers, correctIndex as 0 | 1 | 2 | 3);
    setSaveBusy(false);

    if (error) {
      appAlert(gd('workspaceError'), error === 'insert_failed' ? gd('mcqDbError') : error);
      return;
    }

    appAlert(gd('mcqSavedTitle'), gd('mcqSavedBody'));
    setMcqQuestion('');
    setMcqAnswers(['', '', '', '']);
    setCorrectIndex(null);
    void load();
  };

  const keyLetter = (q: McqQuestionRow) => {
    const c = q.options.find((o) => o.is_correct);
    if (!c) return '—';
    return String.fromCharCode(64 + c.ordinal);
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={BRAND_BLUE} />
        <Text style={styles.loaderText}>{gd('workspaceLoading')}</Text>
      </View>
    );
  }

  return (
    <View>
      {listError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{listError}</Text>
          <Pressable onPress={() => void load()} style={styles.retrySmall}>
            <Text style={styles.retrySmallText}>{gd('workspaceRetry')}</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.formHeading}>{gd('mcqSubtitle')}</Text>
      <Text style={styles.label}>{gd('mcqQuestionLabel')}</Text>
      <TextInput
        value={mcqQuestion}
        onChangeText={setMcqQuestion}
        placeholder={gd('mcqQuestionPlaceholder')}
        placeholderTextColor="#94A3B8"
        multiline
        style={[styles.input, styles.inputMulti]}
      />

      {([0, 1, 2, 3] as const).map((i) => (
        <View key={i}>
          <Text style={styles.label}>{gd('mcqAnswerLabel', { letter: String.fromCharCode(65 + i) })}</Text>
          <TextInput
            value={mcqAnswers[i]}
            onChangeText={(tx) =>
              setMcqAnswers((prev) => {
                const next = [...prev];
                next[i] = tx;
                return next;
              })
            }
            placeholder={gd('mcqAnswerPlaceholder', { letter: String.fromCharCode(65 + i) })}
            placeholderTextColor="#94A3B8"
            style={styles.input}
          />
        </View>
      ))}

      <Text style={styles.label}>{gd('mcqCorrectLabel')}</Text>
      <Text style={styles.helperMuted}>{gd('mcqCorrectHint')}</Text>
      {([0, 1, 2, 3] as const).map((i) => {
        const selected = correctIndex === i;
        return (
          <Pressable
            key={i}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => setCorrectIndex(i)}
            style={({ pressed }) => [
              styles.radioRow,
              selected && styles.radioRowSelected,
              pressed && styles.radioRowPressed,
            ]}>
            <Ionicons
              name={selected ? 'radio-button-on' : 'radio-button-off'}
              size={22}
              color={selected ? BRAND_BLUE : TEXT_MUTED}
            />
            <Text style={styles.radioLabel}>{gd('mcqOptionShort', { letter: String.fromCharCode(65 + i) })}</Text>
          </Pressable>
        );
      })}

      <Pressable
        disabled={saveBusy}
        onPress={() => void saveMcq()}
        style={({ pressed }) => [styles.primaryBtn, pressed && !saveBusy && { opacity: 0.92 }]}>
        <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
        <Text style={styles.primaryBtnText}>{gd('mcqSave')}</Text>
      </Pressable>

      <Text style={[styles.listHeading, styles.listHeadingSp]}>{gd('mcqSavedListHeading')}</Text>
      {saved.length === 0 ? (
        <Text style={styles.empty}>{gd('mcqNoneYet')}</Text>
      ) : (
        saved.map((q) => (
          <View key={q.id} style={styles.savedCard}>
            <Text style={styles.savedPrompt} numberOfLines={4}>
              {q.prompt}
            </Text>
            <Text style={styles.savedKey}>
              {gd('mcqAnswerKey')}: {keyLetter(q)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { paddingVertical: 24, alignItems: 'center', gap: 8 },
  loaderText: { color: TEXT_MUTED, fontWeight: '600' },
  errorBanner: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 12,
  },
  errorText: { fontSize: 12, color: '#991B1B', fontWeight: '600' },
  retrySmall: { marginTop: 8, alignSelf: 'flex-start' },
  retrySmallText: { color: BRAND_BLUE, fontWeight: '800', fontSize: 13 },
  formHeading: { fontSize: 14, fontWeight: '800', color: BRAND_BLUE_DARK, marginBottom: 10 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: BRAND_BLUE_DARK,
    backgroundColor: PAGE_SURFACE,
  },
  inputMulti: { minHeight: 88, textAlignVertical: 'top' },
  helperMuted: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontWeight: '600',
    marginBottom: 8,
    lineHeight: 17,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    marginBottom: 8,
    backgroundColor: PAGE_SURFACE,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {}),
  },
  radioRowSelected: {
    borderColor: BRAND_BLUE,
    backgroundColor: '#EFF6FF',
  },
  radioRowPressed: { opacity: 0.92 },
  radioLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  primaryBtn: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BRAND_BLUE,
    borderRadius: 12,
    paddingVertical: 13,
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  listHeading: { fontSize: 15, fontWeight: '800', color: BRAND_BLUE_DARK },
  listHeadingSp: { marginTop: 22 },
  empty: { marginTop: 8, color: TEXT_MUTED, fontWeight: '600' },
  savedCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: PAGE_SURFACE,
  },
  savedPrompt: { fontSize: 14, fontWeight: '700', color: BRAND_BLUE_DARK, lineHeight: 20 },
  savedKey: { marginTop: 8, fontSize: 12, fontWeight: '800', color: GREEN_OK },
});
