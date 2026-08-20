import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import AttendanceDualRing from '@/src/components/parent/AttendanceDualRing';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import type { LastSessionAttendance } from '@/src/services/teacherLastSessionAttendanceApi';
import { countsFromParts } from '@/src/services/studentAttendanceApi';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const SURFACE = '#FFFFFF';
const ABSENT = '#DC2626';

type Props = {
  loading: boolean;
  error: string | null;
  data: LastSessionAttendance | null;
  sessionDateLabel: string | null;
  labels: {
    title: string;
    present: string;
    absent: string;
    absentListTitle: string;
    empty: string;
    noAbsent: string;
  };
};

function TeacherLastSessionAttendanceCard({
  loading,
  error,
  data,
  sessionDateLabel,
  labels,
}: Props) {
  const counts = data
    ? countsFromParts(data.presentCount, data.absentCount)
    : countsFromParts(0, 0);

  const presentPct =
    counts.total > 0 ? `${Math.round((counts.present / counts.total) * 100)}%` : '—';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="stats-chart-outline" size={18} color={BRAND_BLUE} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{labels.title}</Text>
          {sessionDateLabel ? <Text style={styles.date}>{sessionDateLabel}</Text> : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={BRAND_BLUE} />
        </View>
      ) : error ? (
        <Text style={styles.emptyText}>{error}</Text>
      ) : !data || counts.total === 0 ? (
        <Text style={styles.emptyText}>{labels.empty}</Text>
      ) : (
        <>
          <View style={styles.summaryRow}>
            <AttendanceDualRing counts={counts} size={96} strokeWidth={11} centerLabel={presentPct} />
            <View style={styles.statsCol}>
              <View style={styles.statRow}>
                <View style={[styles.dot, styles.presentDot]} />
                <Text style={styles.statLabel}>{labels.present}</Text>
                <Text style={styles.statValue}>{counts.present}</Text>
              </View>
              <View style={styles.statRow}>
                <View style={[styles.dot, styles.absentDot]} />
                <Text style={styles.statLabel}>{labels.absent}</Text>
                <Text style={[styles.statValue, styles.absentValue]}>{counts.absent}</Text>
              </View>
            </View>
          </View>

          <View style={styles.listBlock}>
            <Text style={styles.listTitle}>{labels.absentListTitle}</Text>
            {data.absentStudents.length === 0 ? (
              <Text style={styles.noAbsent}>{labels.noAbsent}</Text>
            ) : (
              data.absentStudents.map((student, index) => (
                <View key={`${student.name}-${index}`} style={styles.listRow}>
                  <Ionicons name="person-outline" size={16} color={ABSENT} />
                  <Text style={styles.listName}>{student.name}</Text>
                </View>
              ))
            )}
          </View>
        </>
      )}
    </View>
  );
}

export default memo(TeacherLastSessionAttendanceCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: SURFACE,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 14,
    gap: 14,
    marginTop: 8,
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  headerText: { flex: 1, gap: 2 },
  title: {
    fontSize: 15,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
  },
  date: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
  },
  centered: { alignItems: 'center', paddingVertical: 24 },
  emptyText: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
    lineHeight: 18,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  statsCol: { flex: 1, gap: 10 },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  presentDot: { backgroundColor: '#16A34A' },
  absentDot: { backgroundColor: ABSENT },
  statLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
  },
  statValue: {
    fontSize: 16,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
  },
  absentValue: { color: ABSENT },
  listBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    paddingTop: 12,
    gap: 8,
  },
  listTitle: {
    fontSize: 12,
    fontFamily: FontFamily.bold,
    color: TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  noAbsent: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: '#16A34A',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  listName: {
    flex: 1,
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: BRAND_BLUE_DARK,
  },
});
