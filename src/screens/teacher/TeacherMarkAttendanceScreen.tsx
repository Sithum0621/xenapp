import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import TeacherStudentQrScanner from '@/src/components/teacher/groupDetail/TeacherStudentQrScanner';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import {
  listScanAttendanceOptions,
  markAttendanceByScan,
  type ScanAttendanceOption,
} from '@/src/services/teacherAttendanceScanApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';

function optionLabel(opt: ScanAttendanceOption): string {
  return `${opt.group_name} · ${opt.start_time}–${opt.end_time}`;
}

export default function TeacherMarkAttendanceScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const am = (k: string, o?: Record<string, unknown>) =>
    t(`teacherDashboard.attendanceMenu.${k}`, o);
  const [scanSession, setScanSession] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const finishSuccess = useCallback(
    (
      studentName: string,
      groupName: string,
      classLabel: string,
      markTime: string,
      alreadyPresent: boolean,
    ) => {
      appAlert(
        alreadyPresent ? am('alreadyPresentTitle') : am('markedTitle'),
        alreadyPresent
          ? am('alreadyPresentBody', { name: studentName, group: groupName, classTime: classLabel })
          : am('markedBody', {
              name: studentName,
              group: groupName,
              classTime: classLabel,
              markTime: markTime || classLabel,
            }),
        [
          {
            text: am('scanAgain'),
            onPress: () => setScanSession((n) => n + 1),
          },
        ],
      );
    },
    [am],
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
                  : 'errorGeneric';
      appAlert(am('errorTitle'), detail?.trim() || am(key), [
        { text: am('scanAgain'), onPress: () => setScanSession((n) => n + 1) },
      ]);
    },
    [am],
  );

  const pickClassAndMark = useCallback(
    (studentUserId: string, options: ScanAttendanceOption[]) => {
      if (options.length === 1) {
        void (async () => {
          setSubmitting(true);
          const { result, errorCode, error } = await markAttendanceByScan(studentUserId, {
            groupId: options[0].group_id,
            groupSource: options[0].group_source,
            scheduleId: options[0].schedule_id,
          });
          setSubmitting(false);
          if (error || !result) {
            showError(errorCode, error);
            return;
          }
          finishSuccess(
            result.student_name,
            result.group_name,
            result.class_label,
            result.marked_at,
            result.already_present,
          );
        })();
        return;
      }

      appAlert(
        am('pickClassTitle'),
        am('pickClassBody'),
        [
          ...options.map((opt) => ({
            text: optionLabel(opt),
            onPress: () => {
              void (async () => {
                setSubmitting(true);
                const { result, errorCode, error } = await markAttendanceByScan(studentUserId, {
                  groupId: opt.group_id,
                  groupSource: opt.group_source,
                  scheduleId: opt.schedule_id,
                });
                setSubmitting(false);
                if (error || !result) {
                  showError(errorCode, error);
                  return;
                }
                finishSuccess(
                  result.student_name,
                  result.group_name,
                  result.class_label,
                  result.marked_at,
                  result.already_present,
                );
              })();
            },
          })),
          { text: t('teacherDashboard.groupsCancel'), style: 'cancel' as const },
        ],
      );
    },
    [am, finishSuccess, showError, t],
  );

  const handleParsedId = useCallback(
    (studentUserId: string) => {
      void (async () => {
        setSubmitting(true);

        const { options, error: listErr } = await listScanAttendanceOptions(studentUserId);
        if (listErr) {
          setSubmitting(false);
          showError('unknown', listErr);
          return;
        }

        if (options.length === 0) {
          setSubmitting(false);
          showError('student_not_in_your_classes');
          return;
        }

        if (options.length > 1) {
          setSubmitting(false);
          pickClassAndMark(studentUserId, options);
          return;
        }

        const { result, errorCode, error } = await markAttendanceByScan(studentUserId, {
          groupId: options[0].group_id,
          groupSource: options[0].group_source,
          scheduleId: options[0].schedule_id,
        });
        setSubmitting(false);
        if (error || !result) {
          showError(errorCode, error);
          return;
        }
        finishSuccess(result.student_name, result.group_name, result.class_label, result.already_present);
      })();
    },
    [finishSuccess, pickClassAndMark, showError],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardExtraPadding={32}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={am('back')}
            onPress={() => routerBackOrReplace(router, appHref(AppRoutes.teacherDashboard))}
            style={({ pressed }) => [styles.backRow, pressed && styles.backRowPressed]}>
            <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
            <Text style={styles.backLabel}>{am('back')}</Text>
          </Pressable>
          <Text style={styles.title}>{am('pageTitle')}</Text>
          <Text style={styles.subtitle}>{am('pageIntro')}</Text>
        </View>

        <View style={styles.card}>
          {submitting ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={BRAND_BLUE} />
              <Text style={styles.loadingText}>{am('marking')}</Text>
            </View>
          ) : (
            <TeacherStudentQrScanner
              key={scanSession}
              onClose={() => routerBackOrReplace(router, appHref(AppRoutes.teacherDashboard))}
              onParsedId={handleParsedId}
            />
          )}
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingBottom: 32,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  backRowPressed: {
    opacity: 0.75,
  },
  backLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: FontFamily.black,
    color: BRAND_BLUE_DARK,
    paddingHorizontal: 4,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
    paddingHorizontal: 4,
  },
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
  },
});
