import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import AttendanceDayBorderCell from '@/src/components/parent/AttendanceDayBorderCell';
import AttendanceDayTimelineSheet from '@/src/components/parent/AttendanceDayTimelineSheet';
import {
  ATTENDANCE_WINDOW_DAYS,
  attendanceWindowBounds,
  type AttendanceOccurrence,
} from '@/src/services/studentAttendanceApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import {
  buildDaySummaryMap,
  type AttendanceDaySummary,
} from '@/src/utils/attendanceDaySummary';

const PRESENT_BORDER = '#0F9D58';
const ABSENT_BORDER = '#B42318';
const TEXT_MUTED = '#64748B';
const BRAND_BLUE_DARK = '#00101F';

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

type CalendarCell = {
  key: string;
  date: Date | null;
  dateKey: string | null;
};

export type AttendanceCalendarGridProps = {
  occurrences: AttendanceOccurrence[];
  groupName: string;
  windowDays?: number;
};

export default function AttendanceCalendarGrid({
  occurrences,
  groupName,
  windowDays = ATTENDANCE_WINDOW_DAYS,
}: AttendanceCalendarGridProps) {
  const { t } = useTranslation();
  const [sheetDate, setSheetDate] = useState<string | null>(null);

  const dayMap = useMemo(() => buildDaySummaryMap(occurrences), [occurrences]);

  const selectedSummary: AttendanceDaySummary | null = sheetDate
    ? dayMap.get(sheetDate) ?? null
    : null;

  const { weeks, monthLabels } = useMemo(() => {
    const { start, end } = attendanceWindowBounds(windowDays);
    const cells: CalendarCell[] = [];
    const pad = start.getDay();
    for (let i = 0; i < pad; i += 1) {
      cells.push({ key: `pad-start-${i}`, date: null, dateKey: null });
    }
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      const dateKey = toDateKey(d);
      cells.push({ key: dateKey, date: new Date(d), dateKey });
    }
    while (cells.length % 7 !== 0) {
      cells.push({
        key: `pad-end-${cells.length}`,
        date: null,
        dateKey: null,
      });
    }
    const weekRows: CalendarCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weekRows.push(cells.slice(i, i + 7));
    }

    const labels = new Set<string>();
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      labels.add(
        d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      );
    }

    return { weeks: weekRows, monthLabels: Array.from(labels) };
  }, [windowDays]);

  const weekdayLabels = WEEKDAY_KEYS.map((k) =>
    t(`parentDashboard.weekdays.${k}`).slice(0, 3),
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>{t('parentDashboard.attendanceCalendarHint')}</Text>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.presentDot]} />
          <Text style={styles.legendText}>
            {t('parentDashboard.attendanceDotPresent')}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.absentDot]} />
          <Text style={styles.legendText}>
            {t('parentDashboard.attendanceDotAbsent')}
          </Text>
        </View>
      </View>

      {monthLabels.length > 0 ? (
        <Text style={styles.monthTitle}>{monthLabels.join(' · ')}</Text>
      ) : null}

      <View style={styles.weekdayRow}>
        {weekdayLabels.map((label) => (
          <Text key={label} style={styles.weekdayLabel}>
            {label}
          </Text>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={`week-${wi}`} style={styles.weekRow}>
          {week.map((cell) => {
            if (!cell.date || !cell.dateKey) {
              return <View key={cell.key} style={styles.dayCellEmpty} />;
            }
            const summary = dayMap.get(cell.dateKey);
            const a11y = summary
              ? t('parentDashboard.attendanceDayA11y', {
                  date: cell.dateKey,
                  present: summary.present,
                  total: summary.total,
                })
              : cell.dateKey;

            return (
              <AttendanceDayBorderCell
                key={cell.key}
                dayNumber={cell.date.getDate()}
                summary={summary}
                accessibilityLabel={a11y}
                onPress={
                  summary && summary.total > 0
                    ? () => setSheetDate(cell.dateKey)
                    : undefined
                }
              />
            );
          })}
        </View>
      ))}

      <AttendanceDayTimelineSheet
        visible={sheetDate !== null}
        onClose={() => setSheetDate(null)}
        groupName={groupName}
        daySummary={selectedSummary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  hint: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
    lineHeight: 18,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  presentDot: { backgroundColor: PRESENT_BORDER },
  absentDot: { backgroundColor: ABSENT_BORDER },
  legendText: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: BRAND_BLUE_DARK,
  },
  monthTitle: {
    fontSize: 16,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    marginTop: 4,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: FontFamily.bold,
    color: TEXT_MUTED,
  },
  weekRow: { flexDirection: 'row' },
  dayCellEmpty: { flex: 1, aspectRatio: 1, margin: 2 },
});
