import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';

import {
  fetchParentStudents,
  type ParentLinkedStudent,
} from '@/src/services/parentStudentsApi';
import {
  removeParentStudent,
  updateParentStudentName,
} from '@/src/services/parentStudentManageApi';

const BRAND_BLUE_DARK = '#0E2F63';
const BRAND_BLUE = '#123B7A';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const SURFACE = '#FFFFFF';
const ERROR = '#B42318';

type StudentDraft = {
  name: string;
  saving: boolean;
  removing: boolean;
};

function removeErrorKey(code: string): string {
  switch (code) {
    case 'cannot_remove_self':
      return 'parentDashboard.profileStudentsErrors.cannotRemoveSelf';
    case 'not_linked':
      return 'parentDashboard.profileStudentsErrors.notLinked';
    case 'network_error':
    case 'invoke_failed':
    case 'edge_http_error':
      return 'parentDashboard.profileStudentsErrors.network';
    default:
      return 'parentDashboard.profileStudentsErrors.removeFailed';
  }
}

function saveErrorKey(code: string): string {
  switch (code) {
    case 'name_required':
      return 'parentDashboard.profileStudentsErrors.nameRequired';
    case 'not_linked':
      return 'parentDashboard.profileStudentsErrors.notLinked';
    default:
      return 'parentDashboard.profileStudentsErrors.saveFailed';
  }
}

export default function ParentProfileStudentsSection() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<ParentLinkedStudent[]>([]);
  const [drafts, setDrafts] = useState<Record<string, StudentDraft>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await fetchParentStudents();
    if (!res.ok) {
      setStudents([]);
      setDrafts({});
      setLoadError(res.error);
      setLoading(false);
      return;
    }
    setStudents(res.students);
    const nextDrafts: Record<string, StudentDraft> = {};
    for (const student of res.students) {
      nextDrafts[student.studentUserId] = {
        name: student.fullName,
        saving: false,
        removing: false,
      };
    }
    setDrafts(nextDrafts);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  const setDraftName = (studentUserId: string, name: string) => {
    setDrafts((prev) => ({
      ...prev,
      [studentUserId]: {
        name,
        saving: prev[studentUserId]?.saving ?? false,
        removing: prev[studentUserId]?.removing ?? false,
      },
    }));
  };

  const setDraftFlag = (
    studentUserId: string,
    patch: Partial<Pick<StudentDraft, 'saving' | 'removing'>>,
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [studentUserId]: {
        name: prev[studentUserId]?.name ?? '',
        saving: patch.saving ?? prev[studentUserId]?.saving ?? false,
        removing: patch.removing ?? prev[studentUserId]?.removing ?? false,
      },
    }));
  };

  const saveName = async (student: ParentLinkedStudent) => {
    const draft = drafts[student.studentUserId];
    const trimmed = draft?.name.trim() ?? '';
    if (!trimmed) {
      appAlert(
        t('parentDashboard.profileStudentsSaveErrorTitle'),
        t('parentDashboard.profileStudentsErrors.nameRequired'),
      );
      return;
    }
    if (trimmed === student.fullName.trim()) return;

    setDraftFlag(student.studentUserId, { saving: true });
    const res = await updateParentStudentName(student.studentUserId, trimmed);
    setDraftFlag(student.studentUserId, { saving: false });

    if (!res.ok) {
      appAlert(
        t('parentDashboard.profileStudentsSaveErrorTitle'),
        t(saveErrorKey(res.error)),
      );
      return;
    }

    setStudents((prev) =>
      prev.map((s) =>
        s.studentUserId === student.studentUserId ? { ...s, fullName: trimmed } : s,
      ),
    );
    appAlert(
      t('parentDashboard.profileStudentsSaveSuccessTitle'),
      t('parentDashboard.profileStudentsSaveSuccessBody'),
    );
  };

  const confirmRemove = (student: ParentLinkedStudent) => {
    if (student.isSelf) return;

    appAlert(
      t('parentDashboard.profileStudentsDeleteTitle'),
      t('parentDashboard.profileStudentsDeleteMessage', { name: student.fullName }),
      [
        { text: t('parentDashboard.addStudentCancel'), style: 'cancel' },
        {
          text: t('parentDashboard.profileStudentsDeleteConfirm'),
          style: 'destructive',
          onPress: () => void removeStudent(student),
        },
      ],
    );
  };

  const removeStudent = async (student: ParentLinkedStudent) => {
    setDraftFlag(student.studentUserId, { removing: true });
    const res = await removeParentStudent(student.studentUserId);
    setDraftFlag(student.studentUserId, { removing: false });

    if (!res.ok) {
      appAlert(
        t('parentDashboard.profileStudentsDeleteErrorTitle'),
        t(removeErrorKey(res.error)),
      );
      return;
    }

    setStudents((prev) => prev.filter((s) => s.studentUserId !== student.studentUserId));
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[student.studentUserId];
      return next;
    });
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('parentDashboard.profileStudentsTitle')}</Text>
      <Text style={styles.sectionSub}>{t('parentDashboard.profileStudentsSubtitle')}</Text>

      {loading ? (
        <Text style={styles.muted}>{t('parentDashboard.studentsLoading')}</Text>
      ) : loadError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Pressable accessibilityRole="button" onPress={() => void loadStudents()}>
            <Text style={styles.retry}>{t('parentDashboard.classesRetry')}</Text>
          </Pressable>
        </View>
      ) : students.length === 0 ? (
        <Text style={styles.muted}>{t('parentDashboard.profileStudentsEmpty')}</Text>
      ) : (
        <View style={styles.list}>
          {students.map((student) => {
            const draft = drafts[student.studentUserId];
            const dirty = (draft?.name.trim() ?? '') !== student.fullName.trim();
            const busy = draft?.saving || draft?.removing;

            return (
              <View key={student.studentUserId} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardTitle}>
                      {student.isSelf
                        ? t('parentDashboard.studentSwitcherSelfTag')
                        : t('parentDashboard.profileStudentsChildLabel')}
                    </Text>
                    {student.xenStudentId ? (
                      <View style={styles.xenBadge}>
                        <Text style={styles.xenBadgeText}>{student.xenStudentId}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <Text style={styles.label}>{t('parentDashboard.profileStudentsNameLabel')}</Text>
                <TextInput
                  value={draft?.name ?? student.fullName}
                  onChangeText={(text) => setDraftName(student.studentUserId, text)}
                  editable={!busy}
                  autoCapitalize="words"
                  placeholder={t('parentDashboard.registerChildNamePlaceholder')}
                  placeholderTextColor={TEXT_MUTED}
                  style={styles.input}
                />

                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy || !dirty}
                    onPress={() => void saveName(student)}
                    style={({ pressed }) => [
                      styles.saveBtn,
                      (!dirty || busy) && styles.btnDisabled,
                      pressed && dirty && !busy && styles.saveBtnPressed,
                    ]}>
                    <Ionicons name="checkmark-outline" size={15} color={SURFACE} />
                    <Text style={styles.saveBtnText}>
                      {draft?.saving
                        ? t('parentDashboard.profileStudentsSaving')
                        : t('parentDashboard.profileStudentsSave')}
                    </Text>
                  </Pressable>

                  {!student.isSelf ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => confirmRemove(student)}
                      style={({ pressed }) => [
                        styles.deleteBtn,
                        busy && styles.btnDisabled,
                        pressed && !busy && styles.deleteBtnPressed,
                      ]}>
                      <Ionicons name="trash-outline" size={15} color={ERROR} />
                      <Text style={styles.deleteBtnText}>
                        {draft?.removing
                          ? t('parentDashboard.profileStudentsDeleting')
                          : t('parentDashboard.profileStudentsDelete')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, marginTop: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: BRAND_BLUE_DARK },
  sectionSub: { fontSize: 12.5, color: TEXT_MUTED, lineHeight: 18 },
  muted: { fontSize: 13, color: TEXT_MUTED },
  list: { gap: 10, marginTop: 4 },
  card: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    padding: 12,
    gap: 8,
  },
  cardTop: { gap: 4 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  cardTitle: { fontSize: 12.5, fontWeight: '800', color: BRAND_BLUE },
  xenBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(18, 59, 122, 0.08)',
  },
  xenBadgeText: { fontSize: 11, fontWeight: '700', color: BRAND_BLUE_DARK },
  label: { fontSize: 12.5, fontWeight: '700', color: BRAND_BLUE_DARK },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: BRAND_BLUE_DARK,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND_BLUE,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  saveBtnPressed: { opacity: 0.9 },
  saveBtnText: { fontSize: 12.5, fontWeight: '800', color: SURFACE },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(180, 35, 24, 0.25)',
    backgroundColor: 'rgba(180, 35, 24, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  deleteBtnPressed: { opacity: 0.85 },
  deleteBtnText: { fontSize: 12.5, fontWeight: '800', color: ERROR },
  btnDisabled: { opacity: 0.5 },
  errorBox: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    padding: 12,
    gap: 6,
  },
  errorText: { fontSize: 12.5, color: ERROR },
  retry: { fontSize: 12.5, fontWeight: '800', color: BRAND_BLUE },
});
