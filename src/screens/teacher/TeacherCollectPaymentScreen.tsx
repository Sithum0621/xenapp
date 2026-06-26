import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import TeacherPaymentSlipModal from '@/src/components/teacher/TeacherPaymentSlipModal';
import TeacherStudentQrScanner from '@/src/components/teacher/groupDetail/TeacherStudentQrScanner';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import { resolveStudentUserIdForAttendance } from '@/src/services/teacherAttendanceScanApi';
import {
  collectClassFee,
  previewClassFeeCollection,
  type ClassFeePreview,
  type CollectionMethod,
} from '@/src/services/teacherPaymentCollectApi';
import {
  invalidateSessionCache,
  SessionCacheKeys,
} from '@/src/services/sessionDataCache';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { formatLkrFromCents } from '@/src/utils/classesPlaceholderBilling';
import { formatXenStudentIdInput, parseXenStudentId, XEN_STUDENT_ID_PREFIX } from '@/src/utils/loginIdentifier';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';
import { parseXenIdFromScan, sanitizeScanInput } from '@/src/utils/xenQrPayload';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';

export default function TeacherCollectPaymentScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const p = (k: string, o?: Record<string, unknown>) => t(`teacherDashboard.paymentsCollect.${k}`, o);

  const params = useLocalSearchParams<{
    groupId?: string;
    groupSource?: string;
    groupName?: string;
  }>();

  const groupId = String(params.groupId ?? '').trim();
  const groupSource = params.groupSource === 'personal' ? 'personal' : 'institute';
  const groupName = String(params.groupName ?? '').trim() || p('classFallback');

  const scanInputRef = useRef<{ focus: () => void } | null>(null);
  const [scanSession, setScanSession] = useState(0);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [qrScanInput, setQrScanInput] = useState('');
  const [xenInput, setXenInput] = useState(XEN_STUDENT_ID_PREFIX);
  const [preview, setPreview] = useState<ClassFeePreview | null>(null);
  const [slipOpen, setSlipOpen] = useState(false);

  const xenIdValid = useMemo(() => parseXenStudentId(xenInput) !== null, [xenInput]);

  const resetInputs = useCallback(() => {
    setQrScanInput('');
    setXenInput(XEN_STUDENT_ID_PREFIX);
    setScanSession((n) => n + 1);
    setPreview(null);
    setSlipOpen(false);
  }, []);

  const showError = useCallback(
    (code: string | null, detail?: string | null) => {
      const key =
        code === 'student_not_found'
          ? 'errorStudentNotFound'
          : code === 'student_not_in_group'
            ? 'errorNotInGroup'
            : code === 'already_collected'
              ? 'errorAlreadyCollected'
              : code === 'insufficient_student_balance'
                ? 'errorInsufficientWallet'
                : code === 'not_authorized'
                  ? 'errorNotAuthorized'
                  : 'errorGeneric';
      appAlert(p('errorTitle'), detail?.trim() || p(key), [
        { text: p('scanAgain'), onPress: resetInputs },
      ]);
    },
    [p, resetInputs],
  );

  const openPreview = useCallback(
    async (studentUserId: string) => {
      if (!groupId) return;
      setLoadingPreview(true);
      const { preview: next, error, errorCode } = await previewClassFeeCollection(
        studentUserId,
        groupId,
        groupSource,
      );
      setLoadingPreview(false);

      if (error || !next) {
        showError(errorCode, error);
        return;
      }
      if (next.alreadyCollected) {
        showError('already_collected');
        return;
      }

      setPreview(next);
      setSlipOpen(true);
    },
    [groupId, groupSource, showError],
  );

  const resolveAndPreview = useCallback(
    async (raw: string) => {
      setLoadingPreview(true);
      const studentUserId = await resolveStudentUserIdForAttendance(raw);
      if (!studentUserId) {
        setLoadingPreview(false);
        showError('student_not_found');
        return;
      }
      setLoadingPreview(false);
      await openPreview(studentUserId);
    },
    [openPreview, showError],
  );

  const handleApprove = useCallback(
    async (method: CollectionMethod, includePlatformFee: boolean) => {
      if (!preview || !groupId) return;
      setSubmitting(true);
      const { result, error, errorCode } = await collectClassFee(
        preview.studentUserId,
        groupId,
        groupSource,
        method,
        includePlatformFee,
      );
      setSubmitting(false);

      if (error || !result) {
        showError(errorCode, error);
        return;
      }

      invalidateSessionCache([
        SessionCacheKeys.TEACHER_DASHBOARD_OVERVIEW,
        SessionCacheKeys.TEACHER_WALLET,
      ]);

      setSlipOpen(false);
      appAlert(
        p('successTitle'),
        p('successBody', {
          name: result.studentName,
          amount: formatLkrFromCents(result.classFeeCents),
          group: result.groupName,
        }),
        [{ text: p('scanAgain'), onPress: resetInputs }],
      );
    },
    [preview, groupId, groupSource, p, resetInputs, showError],
  );

  const handleQrScanChange = (text: string) => {
    const cleaned = sanitizeScanInput(text);
    setQrScanInput(cleaned);
    if (!loadingPreview && parseXenIdFromScan(cleaned)) {
      void resolveAndPreview(cleaned);
    }
  };

  const handleXenSubmit = () => {
    const xenId = parseXenStudentId(xenInput);
    if (!xenId) {
      showError('student_not_found');
      return;
    }
    void resolveAndPreview(xenId);
  };

  if (!groupId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.missingWrap}>
          <Text style={styles.missingText}>{p('missingParams')}</Text>
          <Pressable
            onPress={() => routerBackOrReplace(router, appHref(AppRoutes.teacherPayments))}
            style={styles.backBtn}>
            <Text style={styles.backBtnText}>{p('back')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const busy = loadingPreview || submitting;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <TeacherPaymentSlipModal
        visible={slipOpen}
        preview={preview}
        submitting={submitting}
        onClose={() => {
          if (submitting) return;
          setSlipOpen(false);
        }}
        onApprove={(method, includePlatformFee) => void handleApprove(method, includePlatformFee)}
      />

      <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent} keyboardExtraPadding={32}>
        <Pressable
          accessibilityRole="button"
          onPress={() => routerBackOrReplace(router, appHref(AppRoutes.teacherPayments))}
          style={({ pressed }) => [styles.backRow, pressed && styles.backRowPressed]}>
          <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
          <Text style={styles.backLabel}>{p('back')}</Text>
        </Pressable>

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>{groupName}</Text>
          <Text style={styles.heroHint}>{p('scanHint')}</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{p('scanTitle')}</Text>
          <Pressable
            disabled={busy}
            onPress={() => scanInputRef.current?.focus()}
            style={styles.scanField}>
            <Ionicons name="scan-outline" size={20} color={TEXT_MUTED} />
            <TextInput
              ref={scanInputRef}
              value={qrScanInput}
              onChangeText={handleQrScanChange}
              placeholder={p('scanUsbPlaceholder')}
              placeholderTextColor={TEXT_MUTED}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              style={styles.scanInput}
            />
          </Pressable>

          {busy ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={BRAND_BLUE} />
              <Text style={styles.loadingText}>{p('loading')}</Text>
            </View>
          ) : (
            <TeacherStudentQrScanner
              compact
              key={scanSession}
              onParsedId={(id) => void resolveAndPreview(id)}
            />
          )}
        </View>

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>{p('orDivider')}</Text>
          <View style={styles.orLine} />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{p('xenTitle')}</Text>
          <TextInput
            value={xenInput}
            onChangeText={(text) => {
              if (text.length < XEN_STUDENT_ID_PREFIX.length) {
                setXenInput(XEN_STUDENT_ID_PREFIX);
                return;
              }
              setXenInput(formatXenStudentIdInput(text));
            }}
            placeholder={p('xenPlaceholder')}
            placeholderTextColor={TEXT_MUTED}
            autoCapitalize="characters"
            editable={!busy}
            style={styles.xenInput}
            onSubmitEditing={handleXenSubmit}
          />
          <Pressable
            disabled={busy || !xenIdValid}
            onPress={handleXenSubmit}
            style={[styles.secondaryBtn, (busy || !xenIdValid) && styles.secondaryBtnDisabled]}>
            <Text style={styles.secondaryBtnText}>{p('xenSubmit')}</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F1F5F9' },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginVertical: 8, alignSelf: 'flex-start' },
  backRowPressed: { opacity: 0.75 },
  backLabel: { fontSize: 16, fontWeight: '700', color: BRAND_BLUE_DARK },
  heroCard: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    gap: 6,
  },
  heroTitle: { fontSize: 18, fontWeight: '800', color: BRAND_BLUE_DARK },
  heroHint: { fontSize: 13, color: TEXT_MUTED, lineHeight: 18 },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: BRAND_BLUE_DARK },
  scanField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  scanInput: { flex: 1, fontSize: 16 },
  loadingWrap: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  loadingText: { color: TEXT_MUTED, fontWeight: '600' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: BORDER },
  orText: { fontSize: 12, color: TEXT_MUTED, fontWeight: '700' },
  xenInput: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  secondaryBtn: {
    backgroundColor: BRAND_BLUE,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnDisabled: { opacity: 0.6 },
  secondaryBtnText: { color: '#FFFFFF', fontWeight: '800' },
  missingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  missingText: { color: TEXT_MUTED, textAlign: 'center' },
  backBtn: { backgroundColor: BRAND_BLUE, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  backBtnText: { color: '#FFFFFF', fontWeight: '700' },
});
