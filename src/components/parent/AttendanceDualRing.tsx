import { View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import type { AttendanceCounts } from '@/src/services/studentAttendanceApi';

import {
  parentAbsent,
  parentInk,
  parentPresent,
  parentTrack,
} from '@/src/theme/parentDashboardPalette';

const PRESENT_COLOR = parentPresent;
const ABSENT_COLOR = parentAbsent;
const TRACK_COLOR = parentTrack;

export type AttendanceDualRingProps = {
  counts: AttendanceCounts;
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
};

export default function AttendanceDualRing({
  counts,
  size = 88,
  strokeWidth = 10,
  centerLabel,
}: AttendanceDualRingProps) {
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  const { present, absent, total } = counts;
  const presentLen = total > 0 ? (present / total) * circumference : 0;
  const absentLen = total > 0 ? (absent / total) * circumference : 0;

  const pctLabel =
    centerLabel ??
    (total > 0 ? `${Math.round((present / total) * 100)}%` : '—');

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke={TRACK_COLOR}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <G transform={`rotate(-90 ${cx} ${cy})`}>
          {presentLen > 0 ? (
            <Circle
              cx={cx}
              cy={cy}
              r={radius}
              stroke={PRESENT_COLOR}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${presentLen} ${circumference - presentLen}`}
              strokeLinecap="round"
            />
          ) : null}
          {absentLen > 0 && present > 0 ? (
            <Circle
              cx={cx}
              cy={cy}
              r={radius}
              stroke={ABSENT_COLOR}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${absentLen} ${circumference - absentLen}`}
              strokeDashoffset={-presentLen}
              strokeLinecap="round"
            />
          ) : null}
        </G>
      </Svg>
      <View
        style={{
          position: 'absolute',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text
          style={{
            fontSize: total > 0 ? 16 : 14,
            fontFamily: FontFamily.bold,
            color: parentInk,
          }}>
          {pctLabel}
        </Text>
      </View>
    </View>
  );
}
