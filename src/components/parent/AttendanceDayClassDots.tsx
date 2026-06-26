import { StyleSheet, View } from 'react-native';

import type { AttendanceOccurrence } from '@/src/services/studentAttendanceApi';

const PRESENT_COLOR = '#0F9D58';
const ABSENT_COLOR = '#B42318';

const MAX_DOTS = 6;
const DOT_SIZE = 5;

type Props = {
  occurrences: AttendanceOccurrence[];
};

/** One green/red dot per class held that day (weekly or extra). */
export default function AttendanceDayClassDots({ occurrences }: Props) {
  if (occurrences.length === 0) return null;

  const sorted = [...occurrences].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const visible = sorted.slice(0, MAX_DOTS);
  const overflow = sorted.length - visible.length;

  return (
    <View style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {visible.map((occ, i) => (
        <View
          key={`${occ.date}-${occ.startTime}-${i}`}
          style={[styles.dot, { backgroundColor: occ.present ? PRESENT_COLOR : ABSENT_COLOR }]}
        />
      ))}
      {overflow > 0 ? <View style={styles.moreDot} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
    maxWidth: '100%',
    paddingHorizontal: 2,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  moreDot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#94A3B8',
  },
});
