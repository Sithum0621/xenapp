import { Pressable, StyleSheet, View } from 'react-native';

import AttendanceDayClassDots from '@/src/components/parent/AttendanceDayClassDots';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import type { AttendanceDaySummary } from '@/src/utils/attendanceDaySummary';

const NEUTRAL_BORDER = '#E2E8F0';
const NEUTRAL_BG = '#F8FAFC';
const BRAND_BLUE_DARK = '#00101F';
const TEXT_MUTED = '#64748B';

export type AttendanceDayBorderCellProps = {
  dayNumber: number;
  summary: AttendanceDaySummary | undefined;
  onPress?: () => void;
  accessibilityLabel: string;
};

export default function AttendanceDayBorderCell({
  dayNumber,
  summary,
  onPress,
  accessibilityLabel,
}: AttendanceDayBorderCellProps) {
  const hasClasses = summary != null && summary.total > 0;

  const content = (
    <View style={styles.inner}>
      <Text
        style={[
          styles.dayNumber,
          hasClasses && styles.dayNumberMarked,
        ]}>
        {dayNumber}
      </Text>
      {hasClasses ? <AttendanceDayClassDots occurrences={summary.occurrences} /> : null}
    </View>
  );

  const cellStyle = [
    styles.cell,
    !hasClasses && styles.neutral,
    hasClasses && styles.hasClasses,
  ];

  if (onPress && hasClasses) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [cellStyle, pressed && styles.pressed]}>
        {content}
      </Pressable>
    );
  }

  return (
    <View accessibilityLabel={accessibilityLabel} style={cellStyle}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    aspectRatio: 1,
    margin: 2,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NEUTRAL_BG,
    overflow: 'hidden',
    minHeight: 44,
  },
  neutral: {
    borderWidth: 1,
    borderColor: NEUTRAL_BORDER,
  },
  hasClasses: {
    borderWidth: 1,
    borderColor: NEUTRAL_BORDER,
    backgroundColor: '#FFFFFF',
  },
  pressed: { opacity: 0.88 },
  inner: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  dayNumber: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
  },
  dayNumberMarked: {
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
  },
});
