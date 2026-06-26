import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import TeacherLastSessionAttendanceCard from '@/src/components/teacher/TeacherLastSessionAttendanceCard';
import TeacherStudentQrScanner from '@/src/components/teacher/groupDetail/TeacherStudentQrScanner';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import {
  fetchTeacherLastSessionAttendance,
  type LastSessionAttendance,
} from '@/src/services/teacherLastSessionAttendanceApi';
import {
  markAttendanceByScan,
  resolveStudentUserIdForAttendance,
} from '@/src/services/teacherAttendanceScanApi';
import { formatScheduleClockTime } from '@/src/services/instituteAdminDashboardApi';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { FontFamily } from '@/src/theme/fonts';
import { formatXenStudentIdInput, parseXenStudentId, XEN_STUDENT_ID_PREFIX } from '@/src/utils/loginIdentifier';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';
import { parseXenIdFromScan, sanitizeScanInput } from '@/src/utils/xenQrPayload';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const BRAND_BLUE_SOFT = '#EFF6FF';
const BRAND_BLUE_BORDER = '#BFDBFE';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const SURFACE = '#FFFFFF';

export default function TeacherClassAttendanceSessionScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const am = (k: string, o?: Record<string, unknown>) =>
    t(`teacherDashboard.attendanceMenu.${k}`, o);

  const params = useLocalSearchParams<{
    groupId?: string;
    groupSource?: string;
    scheduleId?: string;
    groupName?: string;
    startTime?: string;
    endTime?: string;
  }>();

  const groupId = String(params.groupId ?? '').trim();
  const groupSource = params.groupSource === 'personal' ? 'personal' : 'institute';
  const scheduleId = String(params.scheduleId ?? '').trim();
  const groupName = String(params.groupName ?? '').trim() || am('sessionClassFallback');
  const startTime = String(params.startTime ?? '');
  const endTime = String(params.endTime ?? '');

  const scanInputRef = useRef<{ focus: () => void } | null>(null);
  const [scanSession, setScanSession] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [qrScanInput, setQrScanInput] = useState('');
  const [xenInput, setXenInput] = useState(XEN_STUDENT_ID_PREFIX);
  const [lastSessionLoading, setLastSessionLoading] = useState(true);
  const [lastSessionError, setLastSessionError] = useState<string | null>(null);
  const [lastSession, setLastSession] = useState<LastSessionAttendance | null>(null);

  const xenIdValid = useMemo(() => parseXenStudentId(xenInput) !== null, [xenInput]);

  const timeLabel = useMemo(() => {
    if (!startTime || !endTime) return '';
    return `${formatScheduleClockTime(startTime, i18n.language)} – ${formatScheduleClockTime(endTime, i18n.language)}`;
  }, [startTime, endTime, i18n.language]);

  const loadLastSession = useCallback(async () => {
    if (!groupId || !scheduleId) return;
    setLastSessionLoading(true);
    setLastSessionError(null);
    const { data, error } = await fetchTeacherLastSessionAttendance(
      groupId,
      scheduleId,
      groupSource,
    );
    setLastSession(data);
    setLastSessionError(error ? am('lastSessionLoadError') : null);
    setLastSessionLoading(false);
  }, [am, groupId, groupSource, scheduleId]);

  useEffect(() => {
    void loadLastSession();
  }, [loadLastSession]);

  const lastSessionDateLabel = useMemo(() => {
    if (!lastSession?.sessionDate) return null;
    const [y, m, d] = lastSession.sessionDate.split('-').map(Number);
    if (!y || !m || !d) return lastSession.sessionDate;
    const date = new Date(y, m - 1, d);
    const formatted = new Intl.DateTimeFormat(i18n.language, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
    return am('lastSessionDate', { date: formatted });
  }, [am, i18n.language, lastSession?.sessionDate]);

  const resetInputs = useCallback(() => {
    setQrScanInput('');
    setXenInput(XEN_STUDENT_ID_PREFIX);
    setScanSession((n) => n + 1);
  }, []);

  const finishSuccess = useCallback(
    (studentName: string, markTime: string, alreadyPresent: boolean) => {
      appAlert(
        alreadyPresent ? am('alreadyPresentTitle') : am('markedTitle'),
        alreadyPresent
          ? am('alreadyPresentBody', { name: studentName, group: groupName, classTime: timeLabel })
          : am('markedBody', {
              name: studentName,
              group: groupName,
              classTime: timeLabel,
              markTime: markTime || timeLabel,
            }),
        [{ text: am('scanAgain'), onPress: resetInputs }],
      );
    },
    [am, groupName, resetInputs, timeLabel],
  );

  const showError = useCallback(
    (code: string | null, detail?: string | null) => {
      const key =
        code === 'student_not_found'
          ? 'errorStudentNotFound'
          : code === 'no_class_today'
            ? 'errorNoClassToday'
            : code === 'student_not_in_group'
              ? 'errorNotInGroup'
              : code === 'not_authorized'
                ? 'errorNotAuthorized'
                : code === 'student_not_in_your_classes'
                  ? 'errorNotEnrolled'
                  : code === 'invalid_student_id'
                    ? 'errorInvalidStudentId'
                    : 'errorGeneric';
      appAlert(am('errorTitle'), detail?.trim() || am(key), [
        { text: am('scanAgain'), onPress: resetInputs },
      ]);
    },
    [am, resetInputs],
  );

  const markStudent = useCallback(
    async (raw: string) => {
      if (!groupId || !scheduleId) {
        showError('invalid_session');
        return;
      }

      setSubmitting(true);
      const studentUserId = await resolveStudentUserIdForAttendance(raw);
      if (!studentUserId) {
        setSubmitting(false);
        showError('invalid_student_id');
        return;
      }

      const { result, errorCode, error } = await markAttendanceByScan(studentUserId, {
        groupId,
        groupSource,
        scheduleId,
      });
      setSubmitting(false);

      if (error || !result) {
        showError(errorCode, error);
        return;
      }

      setQrScanInput('');
      setXenInput(XEN_STUDENT_ID_PREFIX);
      finishSuccess(result.student_name, result.marked_at, result.already_present);
    },
    [finishSuccess, groupId, groupSource, scheduleId, showError],
  );

  const handleParsedId = useCallback(
    (studentUserId: string) => {
      void markStudent(studentUserId);
    },
    [markStudent],
  );

  const handleQrScanChange = (text: string) => {
    const cleaned = sanitizeScanInput(text);
    setQrScanInput(cleaned);
    if (!submitting && parseXenIdFromScan(cleaned)) {
      void markStudent(cleaned);
    }
  };

  const handleXenSubmit = () => {
    const xenId = parseXenStudentId(xenInput);
    if (!xenId) {
      showError('invalid_student_id');
      return;
    }
    void markStudent(xenId);
  };

  const handleXenChange = (text: string) => {
    if (text.length < XEN_STUDENT_ID_PREFIX.length) {
      setXenInput(XEN_STUDENT_ID_PREFIX);
      return;
    }
    setXenInput(formatXenStudentIdInput(text));
  };

  if (!groupId || !scheduleId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.missingWrap}>
          <Text style={styles.missingText}>{am('sessionMissingParams')}</Text>
          <Pressable
            onPress={() => routerBackOrReplace(router, appHref(AppRoutes.teacherDashboard))}
            style={styles.backBtn}>
            <Text style={styles.backBtnText}>{am('back')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardExtraPadding={32}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={am('back')}
          onPress={() => routerBackOrReplace(router, appHref(AppRoutes.teacherDashboard))}
          style={({ pressed }) => [styles.backRow, pressed && styles.backRowPressed]}>
          <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
          <Text style={styles.backLabel}>{am('back')}</Text>
        </Pressable>

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>{groupName}</Text>
          {timeLabel ? (
            <View style={styles.timePill}>
              <Ionicons name="time-outline" size={14} color={BRAND_BLUE} />
              <Text style={styles.timePillText}>{timeLabel}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="qr-code-outline" size={18} color={BRAND_BLUE} />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>{am('sessionScanTitle')}</Text>
              {am('sessionScanHint') ? (
                <Text style={styles.sectionHint}>{am('sessionScanHint')}</Text>
              ) : null}
            </View>
          </View>

          <Pressable
            disabled={submitting}
            onPress={() => scanInputRef.current?.focus()}
            style={({ pressed }) => [styles.scanField, pressed && styles.scanFieldPressed]}>
            <Ionicons name="scan-outline" size={20} color={TEXT_MUTED} />
            <TextInput
              ref={scanInputRef}
              value={qrScanInput}
              onChangeText={handleQrScanChange}
              placeholder={am('sessionScanUsbPlaceholder')}
              placeholderTextColor={TEXT_MUTED}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
              style={styles.scanInput}
              onSubmitEditing={() => {
                if (parseXenIdFromScan(qrScanInput)) void markStudent(qrScanInput);
              }}
              returnKeyType="done"
            />
          </Pressable>

          {submitting ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={BRAND_BLUE} />
              <Text style={styles.loadingText}>{am('marking')}</Text>
            </View>
          ) : (
            <TeacherStudentQrScanner compact key={scanSession} onParsedId={handleParsedId} />
          )}
        </View>

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>{am('sessionOrDivider')}</Text>
          <View style={styles.orLine} />
        </View>

        <View style={[styles.sectionCard, styles.fallbackCard]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconWrap, styles.fallbackIconWrap]}>
              <Ionicons name="id-card-outline" size={18} color="#475569" />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>{am('sessionXenTitle')}</Text>
              <Text style={styles.sectionHint}>{am('sessionXenHint')}</Text>
            </View>
          </View>

          <TextInput
            value={xenInput}
            onChangeText={handleXenChange}
            placeholder={am('sessionXenPlaceholder')}
            placeholderTextColor={TEXT_MUTED}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!submitting}
            style={styles.xenInput}
            onSubmitEditing={handleXenSubmit}
            returnKeyType="done"
          />
          <Pressable
            disabled={submitting || !xenIdValid}
            onPress={handleXenSubmit}
            style={({ pressed }) => [
              styles.secondaryBtn,
              pressed && !submitting && xenIdValid && styles.secondaryBtnPressed,
              (submitting || !xenIdValid) && styles.secondaryBtnDisabled,
            ]}>
            <Text style={styles.secondaryBtnText}>{am('sessionMarkById')}</Text>
          </Pressable>
        </View>

        <View style={styles.footerSpace} />

        <TeacherLastSessionAttendanceCard
          loading={lastSessionLoading}
          error={lastSessionError}
          data={lastSession}
          sessionDateLabel={lastSessionDateLabel}
          labels={{
            title: am('lastSessionTitle'),
            present: am('lastSessionPresent'),
            absent: am('lastSessionAbsent'),
            absentListTitle: am('lastSessionAbsentList'),
            empty: am('lastSessionEmpty'),
            noAbsent: am('lastSessionNoAbsent'),
          }}
        />
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F1F5F9' },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    marginBottom: 14,
    alignSelf: 'flex-start',
  },
  backRowPressed: { opacity: 0.75 },
  backLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
  },
  heroCard: {
    backgroundColor: BRAND_BLUE_SOFT,
    borderWidth: 1,
    borderColor: BRAND_BLUE_BORDER,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    gap: 10,
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(18, 59, 122, 0.08)' },
      default: {
        shadowColor: BRAND_BLUE,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
        elevation: 2,
      },
    }),
  },
  heroTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: FontFamily.black,
    color: BRAND_BLUE_DARK,
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BRAND_BLUE_BORDER,
  },
  timePillText: {
    fontSize: 13,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE,
  },
  sectionCard: {
    backgroundColor: SURFACE,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    ...Platform.select({
      web: { boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)' },
      default: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  },
  fallbackCard: {
    backgroundColor: '#FAFBFC',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_BLUE_SOFT,
    borderWidth: 1,
    borderColor: BRAND_BLUE_BORDER,
  },
  fallbackIconWrap: {
    backgroundColor: '#F1F5F9',
    borderColor: BORDER,
  },
  sectionHeaderText: { flex: 1, gap: 2 },
  sectionTitle: {
    fontSize: 15,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
  },
  sectionHint: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
  },
  scanField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderStyle: 'dashed',
  },
  scanFieldPressed: { borderColor: BRAND_BLUE, backgroundColor: BRAND_BLUE_SOFT },
  scanInput: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: BRAND_BLUE_DARK,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  xenInput: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    fontFamily: FontFamily.bold,
    letterSpacing: 0.5,
    backgroundColor: SURFACE,
    color: BRAND_BLUE_DARK,
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BRAND_BLUE,
    backgroundColor: SURFACE,
  },
  secondaryBtnPressed: { backgroundColor: BRAND_BLUE_SOFT },
  secondaryBtnDisabled: { opacity: 0.45 },
  secondaryBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: 15,
    color: BRAND_BLUE,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 14,
    paddingHorizontal: 8,
  },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: BORDER },
  orText: {
    fontSize: 11,
    fontFamily: FontFamily.bold,
    color: TEXT_MUTED,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
  },
  footerSpace: { minHeight: 24 },
  missingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  missingText: { fontSize: 15, color: TEXT_MUTED, textAlign: 'center' },
  backBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: BRAND_BLUE,
  },
  backBtnText: { color: '#FFFFFF', fontWeight: '800' },
});
