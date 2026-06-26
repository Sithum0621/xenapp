import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AttendanceCalendarGrid from '@/src/components/parent/AttendanceCalendarGrid';
import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import {
  ATTENDANCE_WINDOW_DAYS,
  fetchGroupAttendanceOccurrences,
  type AttendanceOccurrence,
} from '@/src/services/studentAttendanceApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const TEXT_MUTED = '#64748B';
const SURFACE = '#FFFFFF';
const SURFACE_ALT = '#F4F6FA';
const BORDER = '#E2E8F0';

export default function ParentAttendanceGroupCalendarScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    studentId?: string | string[];
    groupId?: string | string[];
    groupSource?: string | string[];
    groupName?: string | string[];
    instituteName?: string | string[];
  }>();

  const studentId = Array.isArray(params.studentId)
    ? params.studentId[0]
    : params.studentId;
  const groupId = Array.isArray(params.groupId) ? params.groupId[0] : params.groupId;
  const groupSourceRaw = Array.isArray(params.groupSource)
    ? params.groupSource[0]
    : params.groupSource;
  const groupSource = groupSourceRaw === 'personal' ? 'personal' : 'institute';
  const groupName = Array.isArray(params.groupName)
    ? params.groupName[0]
    : params.groupName;
  const instituteName = Array.isArray(params.instituteName)
    ? params.instituteName[0]
    : params.instituteName;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [occurrences, setOccurrences] = useState<AttendanceOccurrence[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!studentId || !groupId) {
      setOccurrences([]);
      setError(t('parentDashboard.attendanceErrorNoStudent'));
      setLoading(false);
      return;
    }
    const res = await fetchGroupAttendanceOccurrences(
      studentId,
      groupId,
      groupSource,
      ATTENDANCE_WINDOW_DAYS,
    );
    if (res.ok) {
      setOccurrences(res.occurrences);
      setError(null);
    } else {
      setOccurrences([]);
      setError(res.error);
    }
  }, [studentId, groupId, groupSource, t]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('appLock.back')}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}>
          <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
          <Text style={styles.backLabel}>{t('appLock.back')}</Text>
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardExtraPadding={32}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
        }>
        <Text style={styles.screenTitle}>
          {groupName ?? t('parentDashboard.attendanceCalendarTitle')}
        </Text>
        {instituteName ? (
          <Text style={styles.institute} numberOfLines={2}>
            {instituteName}
          </Text>
        ) : null}

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={BRAND_BLUE} />
            <Text style={styles.statusText}>{t('parentDashboard.attendanceLoading')}</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={styles.messageCard}>
            <Ionicons name="alert-circle-outline" size={28} color={BRAND_BLUE} />
            <Text style={styles.messageTitle}>
              {t('parentDashboard.attendanceErrorTitle')}
            </Text>
            <Text style={styles.messageBody}>{error}</Text>
          </View>
        ) : null}

        {!loading && !error ? (
          <View style={styles.calendarCard}>
            {occurrences.length > 0 ? (
              <Text style={styles.classesHeld}>
                {t('parentDashboard.attendanceClassesHeld', {
                  count: occurrences.length,
                })}
              </Text>
            ) : null}
            <AttendanceCalendarGrid
              occurrences={occurrences}
              groupName={groupName ?? t('parentDashboard.attendanceCalendarTitle')}
            />
            {occurrences.length === 0 ? (
              <Text style={styles.emptyNote}>
                {t('parentDashboard.attendanceCalendarEmpty')}
              </Text>
            ) : null}
          </View>
        ) : null}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: SURFACE_ALT },
  topBar: {
    paddingHorizontal: 12,
    paddingBottom: 4,
    backgroundColor: SURFACE_ALT,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignSelf: 'flex-start',
  },
  backBtnPressed: { opacity: 0.7 },
  backLabel: {
    fontSize: 16,
    fontFamily: FontFamily.regular,
    color: BRAND_BLUE_DARK,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 12,
  },
  screenTitle: {
    fontSize: 24,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    letterSpacing: -0.3,
  },
  institute: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
    marginBottom: 8,
  },
  calendarCard: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 8,
  },
  classesHeld: {
    fontSize: 14,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE,
    marginBottom: 4,
  },
  emptyNote: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
    textAlign: 'center',
    marginTop: 8,
  },
  centered: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  statusText: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
  },
  messageCard: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  messageTitle: {
    fontSize: 17,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    textAlign: 'center',
  },
  messageBody: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 20,
  },
});
