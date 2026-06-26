import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { parentBrandBlueDark } from '@/src/theme/parentDashboardPalette';
import { formatExamCountdown } from '@/src/utils/gamesScheduleExamTimer';

const FIVE_MINUTES_SECONDS = 5 * 60;
const TIMER_URGENT = '#DC2626';

export type GamesScheduleExamTimerProps = {
  remainingSeconds: number;
  label: string;
};

export default function GamesScheduleExamTimer({
  remainingSeconds,
  label,
}: GamesScheduleExamTimerProps) {
  const urgent = remainingSeconds > 0 && remainingSeconds <= FIVE_MINUTES_SECONDS;

  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <Text style={styles.label}>{label}</Text>
      <Text
        accessibilityRole="header"
        style={[styles.timer, urgent ? styles.timerUrgent : styles.timerNormal]}>
        {formatExamCountdown(remainingSeconds)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#EEF2F6',
    gap: 4,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FontFamily.bold,
    color: parentBrandBlueDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timer: {
    fontSize: 36,
    lineHeight: 42,
    fontFamily: FontFamily.black,
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  timerNormal: {
    color: parentBrandBlueDark,
  },
  timerUrgent: {
    color: TIMER_URGENT,
  },
});
