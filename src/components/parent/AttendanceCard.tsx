import { router } from 'expo-router';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import AttendanceDualRing from '@/src/components/parent/AttendanceDualRing';
import DashboardPremiumTile from '@/src/components/parent/dashboard/DashboardPremiumTile';
import {
  ATTENDANCE_WINDOW_DAYS,
  fetchOverallAttendanceCounts,
  type AttendanceCounts,
  countsFromParts,
} from '@/src/services/studentAttendanceApi';
import {
  parentInk,
  parentPresent,
  parentAbsent,
  parentTealBrand,
} from '@/src/theme/parentDashboardPalette';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';

export type AttendanceCardProps = {
  studentUserId: string | null;
  windowDays?: number;
};

function AttendanceCard({
  studentUserId,
  windowDays = ATTENDANCE_WINDOW_DAYS,
}: AttendanceCardProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<AttendanceCounts>({ present: 0, absent: 0, total: 0 });

  const load = useCallback(async () => {
    if (!studentUserId) {
      setCounts({ present: 0, absent: 0, total: 0 });
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await fetchOverallAttendanceCounts(studentUserId, windowDays);
    if (res.ok) setCounts(res.counts);
    else setCounts({ present: 0, absent: 0, total: 0 });
    setLoading(false);
  }, [studentUserId, windowDays]);

  useEffect(() => {
    void load();
  }, [load]);

  const openAttendance = () => {
    if (!studentUserId) return;
    router.push({
      pathname: '/parent-dashboard/attendance',
      params: { studentId: studentUserId },
    });
  };

  return (
    <DashboardPremiumTile
      style={styles.tile}
      accent="attendance"
      title={t('parentDashboard.attendanceTitle')}
      subtitle={t('parentDashboard.attendanceSubtitle', { days: windowDays })}
      accessibilityLabel={t('parentDashboard.attendanceTitle')}
      disabled={!studentUserId}
      onPress={openAttendance}>
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={parentTealBrand} />
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.ringWrap}>
            <AttendanceDualRing
              counts={countsFromParts(counts.present, counts.absent)}
              size={88}
              strokeWidth={10}
            />
          </View>
          <View style={styles.statRow}>
            <View
              style={[styles.statChip, styles.statChipPresent]}
              accessibilityLabel={`${t('parentDashboard.attendancePresentLabel')}: ${counts.present}`}>
              <View style={[styles.dot, { backgroundColor: parentPresent }]} />
              <Text style={styles.statValue}>{counts.present}</Text>
            </View>
            <View
              style={[styles.statChip, styles.statChipAbsent]}
              accessibilityLabel={`${t('parentDashboard.attendanceAbsentLabel')}: ${counts.absent}`}>
              <View style={[styles.dot, { backgroundColor: parentAbsent }]} />
              <Text style={styles.statValue}>{counts.absent}</Text>
            </View>
          </View>
        </View>
      )}
    </DashboardPremiumTile>
  );
}

export default memo(AttendanceCard);

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 196,
  },
  loadingWrap: {
    flex: 1,
    minHeight: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 2,
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  statChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  statChipPresent: {
    backgroundColor: '#EDF7F1',
    borderColor: '#B8D9C8',
  },
  statChipAbsent: {
    backgroundColor: '#FAF0F0',
    borderColor: '#E8C4C4',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statValue: {
    fontSize: 16,
    fontFamily: FontFamily.bold,
    color: parentInk,
  },
});
