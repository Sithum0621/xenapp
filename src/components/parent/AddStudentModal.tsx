import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { KeyboardAwareModalFrame, KeyboardAwareScrollView } from '@/src/components/layout/scroll';

import { registerParentHouseholdChild } from '@/src/services/parentRegisterChildApi';
import { fetchParentStudents } from '@/src/services/parentStudentsApi';
import { maybeShowAppLockRegistrationPrompt } from '@/src/utils/appLockRegistrationPrompt';

const BRAND_BLUE_DARK = '#00101F';
const BRAND_BLUE = '#041830';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const SURFACE = '#FFFFFF';
const ERROR = '#B42318';

export type AddStudentModalProps = {
  visible: boolean;
  onClose: () => void;
  onLinked: (studentUserId?: string) => void;
};

function registerErrorKey(code: string): string {
  switch (code) {
    case 'validation_failed':
      return 'parentDashboard.registerChildErrors.validation';
    case 'student_limit_reached':
      return 'parentDashboard.addStudentErrors.limitReached';
    case 'parent_mobile_missing':
      return 'parentDashboard.registerChildErrors.parentMobileMissing';
    case 'parent_nic_missing':
      return 'parentDashboard.registerChildErrors.parentNicMissing';
    case 'network_error':
    case 'invoke_failed':
    case 'edge_http_error':
      return 'parentDashboard.registerChildErrors.network';
    default:
      return 'parentDashboard.registerChildErrors.unknown';
  }
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim().replace(/\s+/g, ' ');
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(' ');
  if (parts.length === 1) return { firstName: parts[0]!, lastName: '-' };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') };
}

export default function AddStudentModal({ visible, onClose, onLinked }: AddStudentModalProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [childName, setChildName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successRegistered, setSuccessRegistered] = useState(false);

  useEffect(() => {
    if (!visible) {
      setChildName('');
      setErrorMessage(null);
      setSuccessRegistered(false);
      setSubmitting(false);
    }
  }, [visible]);

  const close = () => {
    if (submitting) return;
    onClose();
  };

  const submitRegister = async () => {
    const { firstName, lastName } = splitFullName(childName);
    if (!firstName) {
      setErrorMessage(t('parentDashboard.registerChildErrors.nameRequired'));
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    const existing = await fetchParentStudents();
    const householdChildCount = existing.ok
      ? existing.students.filter((s) => !s.isSelf).length
      : 0;
    const isFirstHouseholdChild = householdChildCount === 0;

    const result = await registerParentHouseholdChild({
      first_name: firstName,
      last_name: lastName,
    });
    setSubmitting(false);

    if (!result.ok) {
      setErrorMessage(t(registerErrorKey(result.error)));
      return;
    }

    setSuccessRegistered(true);
    onLinked(result.studentUserId);

    if (isFirstHouseholdChild) {
      void maybeShowAppLockRegistrationPrompt(router, t);
    }
  };

  return (
    <KeyboardAwareModalFrame
      visible={visible}
      onRequestClose={close}
      overlayStyle={styles.overlay}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('parentDashboard.addStudentClose')}
        onPress={close}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.iconWrap}>
              <Ionicons name="person-add-outline" size={20} color={BRAND_BLUE} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>{t('parentDashboard.registerChildTitle')}</Text>
              <Text style={styles.subtitle}>{t('parentDashboard.registerChildSubtitle')}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('parentDashboard.addStudentClose')}
              onPress={close}
              hitSlop={8}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}>
              <Ionicons name="close" size={20} color={TEXT_MUTED} />
            </Pressable>
          </View>

          <KeyboardAwareScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.formScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>{t('parentDashboard.registerChildNameLabel')}</Text>
            <TextInput
              value={childName}
              onChangeText={setChildName}
              placeholder={t('parentDashboard.registerChildNamePlaceholder')}
              placeholderTextColor="#94A3B8"
              autoCapitalize="words"
              editable={!submitting && !successRegistered}
              onSubmitEditing={() => void submitRegister()}
              returnKeyType="done"
              style={styles.input}
            />

            <Text style={styles.hint}>{t('parentDashboard.registerChildHint')}</Text>

            {successRegistered ? (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={18} color="#15803D" />
                <Text style={styles.successText}>
                  {t('parentDashboard.registerChildSuccess')}
                </Text>
              </View>
            ) : null}

            {errorMessage ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle-outline" size={16} color={ERROR} />
                <Text style={styles.errorText} numberOfLines={4}>
                  {errorMessage}
                </Text>
              </View>
            ) : null}
          </KeyboardAwareScrollView>

          <View style={styles.actionsRow}>
            <Pressable
              accessibilityRole="button"
              onPress={close}
              disabled={submitting}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.secondaryBtnPressed,
                submitting && styles.btnDisabled,
              ]}>
              <Text style={styles.secondaryBtnText}>
                {successRegistered ? t('parentDashboard.registerChildDone') : t('parentDashboard.addStudentCancel')}
              </Text>
            </Pressable>
            {!successRegistered ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void submitRegister()}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && !submitting && styles.primaryBtnPressed,
                  submitting && styles.btnDisabled,
                ]}>
                {submitting ? (
                  <ActivityIndicator size="small" color={SURFACE} />
                ) : (
                  <Ionicons name="person-add-outline" size={16} color={SURFACE} />
                )}
                <Text style={styles.primaryBtnText}>
                  {submitting
                    ? t('parentDashboard.registerChildSubmitting')
                    : t('parentDashboard.registerChildSubmit')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
    </KeyboardAwareModalFrame>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(7, 22, 53, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '88%',
    backgroundColor: SURFACE,
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(18, 59, 122, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 17, fontWeight: '800', color: BRAND_BLUE_DARK },
  subtitle: { fontSize: 12.5, color: TEXT_MUTED, lineHeight: 18 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnPressed: { backgroundColor: 'rgba(15, 23, 42, 0.06)' },
  formScroll: { flexGrow: 0, flexShrink: 1 },
  formScrollContent: { gap: 10, paddingBottom: 4 },
  label: { fontSize: 12.5, fontWeight: '700', color: BRAND_BLUE_DARK },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: BRAND_BLUE_DARK,
    backgroundColor: '#F8FAFC',
  },
  hint: { fontSize: 11.5, color: TEXT_MUTED, lineHeight: 16 },
  successBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(21, 128, 61, 0.08)',
    borderRadius: 10,
    padding: 10,
  },
  successText: { flex: 1, fontSize: 12.5, color: '#166534', lineHeight: 18, fontWeight: '600' },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(180, 35, 24, 0.06)',
    borderColor: 'rgba(180, 35, 24, 0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  errorText: { flex: 1, fontSize: 12.5, color: ERROR, lineHeight: 18 },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: SURFACE,
  },
  secondaryBtnPressed: { opacity: 0.75 },
  secondaryBtnText: { fontSize: 13.5, fontWeight: '700', color: BRAND_BLUE_DARK },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
  },
  primaryBtnPressed: { opacity: 0.9 },
  primaryBtnText: { fontSize: 13.5, fontWeight: '800', color: SURFACE },
  btnDisabled: { opacity: 0.55 },
});
