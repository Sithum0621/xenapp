import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import AttendanceCalendarGrid from '@/src/components/parent/AttendanceCalendarGrid';
import DashboardScreenShell from '@/src/components/layout/DashboardScreenShell';
import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import {
  ATTENDANCE_WINDOW_DAYS,
  fetchGroupAttendanceOccurrences,
  type AttendanceOccurrence,
} from '@/src/services/studentAttendanceApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { PAGE_CONTENT_BOTTOM, PAGE_EDGE_INSET } from '@/src/theme/pageLayout';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const TEXT_MUTED = '#64748B';
const SURFACE = '#FFFFFF';
const BORDER = '#E2E8F0';

export default function ParentAttendanceGroupCalendarScreen() {
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
    <DashboardScreenShell
      showBack
      title={groupName ?? t('parentDashboard.attendanceCalendarTitle')}
      subtitle={instituteName || undefined}
      padContent={false}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardExtraPadding={32}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
        }>
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
    </DashboardScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: 12,
    paddingBottom: PAGE_CONTENT_BOTTOM,
    gap: 12,
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
