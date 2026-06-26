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

import AttendanceGroupCard from '@/src/components/parent/AttendanceGroupCard';
import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import {
  ATTENDANCE_WINDOW_DAYS,
  fetchAttendanceByGroup,
  type GroupAttendanceSummary,
} from '@/src/services/studentAttendanceApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const TEXT_MUTED = '#64748B';
const SURFACE = '#FFFFFF';
const SURFACE_ALT = '#F4F6FA';
const BORDER = '#E2E8F0';

export default function ParentAttendanceScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ studentId?: string | string[] }>();
  const studentId = Array.isArray(params.studentId)
    ? params.studentId[0]
    : params.studentId;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groups, setGroups] = useState<GroupAttendanceSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!studentId) {
      setGroups([]);
      setError(t('parentDashboard.attendanceErrorNoStudent'));
      setLoading(false);
      return;
    }
    const res = await fetchAttendanceByGroup(studentId, ATTENDANCE_WINDOW_DAYS);
    if (res.ok) {
      setGroups(res.groups);
      setError(null);
    } else {
      setGroups([]);
      setError(res.error);
    }
  }, [studentId, t]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openGroup = (group: GroupAttendanceSummary) => {
    if (!studentId) return;
    router.push({
      pathname: '/parent-dashboard/attendance/[groupId]',
      params: {
        studentId,
        groupId: group.lectureGroupId,
        groupSource: group.groupSource,
        groupName: group.groupName,
        instituteName: group.instituteName,
      },
    });
  };

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
        <Text style={styles.screenTitle}>{t('parentDashboard.attendanceScreenTitle')}</Text>
        <Text style={styles.screenSubtitle}>
          {t('parentDashboard.attendanceScreenSubtitle', {
            days: ATTENDANCE_WINDOW_DAYS,
          })}
        </Text>

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
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setLoading(true);
                void load().finally(() => setLoading(false));
              }}
              style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}>
              <Text style={styles.retryLabel}>{t('parentDashboard.classesRetry')}</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !error && groups.length === 0 ? (
          <View style={styles.messageCard}>
            <Ionicons name="calendar-outline" size={28} color={BRAND_BLUE} />
            <Text style={styles.messageTitle}>
              {t('parentDashboard.attendanceEmptyGroupsTitle')}
            </Text>
            <Text style={styles.messageBody}>
              {t('parentDashboard.attendanceEmptyGroupsBody')}
            </Text>
          </View>
        ) : null}

        {!loading && !error && groups.length > 0 ? (
          <View style={styles.list}>
            {groups.map((group) => (
              <AttendanceGroupCard
                key={`${group.groupSource}:${group.lectureGroupId}`}
                group={group}
                onPress={() => openGroup(group)}
              />
            ))}
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
    gap: 16,
  },
  screenTitle: {
    fontSize: 26,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    letterSpacing: -0.3,
  },
  screenSubtitle: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
    marginBottom: 8,
  },
  list: { gap: 14 },
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
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: BRAND_BLUE,
  },
  retryBtnPressed: { opacity: 0.88 },
  retryLabel: {
    fontSize: 14,
    fontFamily: FontFamily.bold,
    color: '#FFFFFF',
  },
});
