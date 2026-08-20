import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { formatScheduleClockTime } from '@/src/services/instituteAdminDashboardApi';
import {
  saveTeacherCalendarNote,
  type TeacherCalendarNotesMap,
} from '@/src/services/teacherCalendarNotesStorage';
import type { TeacherTimetableItem } from '@/src/services/teacherTodayScheduleApi';
import {
  classesForDate,
  dateToIsoLocal,
  dayDetailLabel,
  getMonthGridCells,
  isSameLocalDay,
  monthLabel,
} from '@/src/utils/teacherTimetableCalendar';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const CLASS_DOT = '#15803D';
const NOTE_DOT = '#D97706';

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

type Props = {
  weekly: TeacherTimetableItem[];
  oneTime: TeacherTimetableItem[];
  notes: TeacherCalendarNotesMap;
  teacherUserId: string;
  onNotesChange: (notes: TeacherCalendarNotesMap) => void;
};

export default function TeacherTimetableCalendarView({
  weekly,
  oneTime,
  notes,
  teacherUserId,
  onNotesChange,
}: Props) {
  const { t, i18n } = useTranslation();
  const tt = (k: string, o?: Record<string, unknown>) => t(`teacherDashboard.myTimetable.${k}`, o);
  const gd = (k: string) => t(`teacherDashboard.groupDetail.${k}`);

  const today = useMemo(() => new Date(), []);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const selectedIso = dateToIsoLocal(selectedDate);

  useEffect(() => {
    setNoteDraft(notes[selectedIso] ?? '');
  }, [selectedIso, notes]);

  const monthCells = useMemo(
    () => getMonthGridCells(visibleMonth.getFullYear(), visibleMonth.getMonth()),
    [visibleMonth],
  );

  const dayClasses = useMemo(
    () => classesForDate(selectedDate, weekly, oneTime),
    [selectedDate, weekly, oneTime],
  );

  const classDatesInMonth = useMemo(() => {
    const set = new Set<string>();
    const y = visibleMonth.getFullYear();
    const m = visibleMonth.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const date = new Date(y, m, d);
      if (classesForDate(date, weekly, oneTime).length > 0) {
        set.add(dateToIsoLocal(date));
      }
    }
    return set;
  }, [visibleMonth, weekly, oneTime]);

  const shiftMonth = (delta: number) => {
    setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const instituteOrPersonal = (item: TeacherTimetableItem) =>
    item.instituteName ?? t('teacherDashboard.groupsGroupClassBadge');

  const formatRange = (item: TeacherTimetableItem) => {
    const start = formatScheduleClockTime(item.startTime, i18n.language);
    const end = formatScheduleClockTime(item.endTime, i18n.language);
    return `${start} – ${end}`;
  };

  const persistNote = useCallback(async () => {
    if (!teacherUserId) return;
    setSavingNote(true);
    const next = await saveTeacherCalendarNote(teacherUserId, selectedIso, noteDraft);
    onNotesChange(next);
    setSavingNote(false);
  }, [teacherUserId, selectedIso, noteDraft, onNotesChange]);

  return (
    <View style={styles.root}>
      <View style={styles.monthHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tt('prevMonthA11y')}
          onPress={() => shiftMonth(-1)}
          style={({ pressed }) => [styles.monthNavBtn, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
        </Pressable>
        <Text style={styles.monthTitle}>{monthLabel(visibleMonth, i18n.language)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tt('nextMonthA11y')}
          onPress={() => shiftMonth(1)}
          style={({ pressed }) => [styles.monthNavBtn, pressed && styles.pressed]}>
          <Ionicons name="chevron-forward" size={22} color={BRAND_BLUE_DARK} />
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_KEYS.map((key) => (
          <Text key={key} style={styles.weekdayLabel}>
            {gd(`weekdayShort.${key}`)}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {monthCells.map((cell, index) => {
          if (!cell) {
            return <View key={`pad-${index}`} style={styles.dayCell} />;
          }
          const iso = dateToIsoLocal(cell);
          const selected = isSameLocalDay(cell, selectedDate);
          const isToday = isSameLocalDay(cell, today);
          const hasClass = classDatesInMonth.has(iso);
          const hasNote = Boolean(notes[iso]?.trim());

          return (
            <Pressable
              key={iso}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setSelectedDate(cell)}
              style={({ pressed }) => [
                styles.dayCell,
                selected && styles.dayCellSelected,
                isToday && !selected && styles.dayCellToday,
                pressed && styles.pressed,
              ]}>
              <Text
                style={[
                  styles.dayNumber,
                  selected && styles.dayNumberSelected,
                  isToday && !selected && styles.dayNumberToday,
                ]}>
                {cell.getDate()}
              </Text>
              <View style={styles.dotRow}>
                {hasClass ? <View style={[styles.dot, { backgroundColor: CLASS_DOT }]} /> : null}
                {hasNote ? <View style={[styles.dot, { backgroundColor: NOTE_DOT }]} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: CLASS_DOT }]} />
          <Text style={styles.legendText}>{tt('legendClass')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: NOTE_DOT }]} />
          <Text style={styles.legendText}>{tt('legendNote')}</Text>
        </View>
      </View>

      <View style={styles.dayPanel}>
        <Text style={styles.dayPanelTitle}>{dayDetailLabel(selectedDate, i18n.language)}</Text>

        <Text style={styles.sectionLabel}>{tt('classesOnDay')}</Text>
        {dayClasses.length === 0 ? (
          <Text style={styles.emptyLine}>{tt('dayEmpty')}</Text>
        ) : (
          <View style={styles.classList}>
            {dayClasses.map((item) => (
              <View key={`${item.scheduleId}:${item.groupId}`} style={styles.classRow}>
                <Text style={styles.classTime}>{formatRange(item)}</Text>
                <Text style={styles.className} numberOfLines={2}>
                  {item.groupName}
                </Text>
                <Text style={styles.classMeta} numberOfLines={1}>
                  {instituteOrPersonal(item)}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.sectionLabel}>{tt('personalNoteTitle')}</Text>
        <Text style={styles.noteHint}>{tt('personalNoteHint')}</Text>
        <TextInput
          value={noteDraft}
          onChangeText={setNoteDraft}
          onBlur={() => void persistNote()}
          placeholder={tt('personalNotePlaceholder')}
          multiline
          style={styles.noteInput}
          editable={!savingNote && Boolean(teacherUserId)}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => void persistNote()}
          disabled={savingNote || !teacherUserId}
          style={({ pressed }) => [
            styles.saveNoteBtn,
            pressed && styles.pressed,
            (savingNote || !teacherUserId) && styles.saveNoteDisabled,
          ]}>
          <Text style={styles.saveNoteText}>
            {savingNote ? tt('savingNote') : tt('saveNote')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthNavBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
  },
  monthTitle: { fontSize: 17, fontWeight: '800', color: BRAND_BLUE_DARK },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_MUTED,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  dayCell: {
    width: `${100 / 7}%`,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    gap: 2,
  },
  dayCellSelected: {
    backgroundColor: 'rgba(18, 59, 122, 0.12)',
  },
  dayCellToday: {
    backgroundColor: 'rgba(18, 59, 122, 0.05)',
  },
  dayNumber: { fontSize: 14, fontWeight: '700', color: BRAND_BLUE_DARK },
  dayNumberSelected: { color: BRAND_BLUE, fontWeight: '800' },
  dayNumberToday: { color: BRAND_BLUE },
  dotRow: { flexDirection: 'row', gap: 3, minHeight: 6 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  legendRow: { flexDirection: 'row', gap: 16, paddingHorizontal: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 12, color: TEXT_MUTED },
  dayPanel: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 8,
  },
  dayPanelTitle: { fontSize: 16, fontWeight: '800', color: BRAND_BLUE_DARK },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: BRAND_BLUE_DARK, marginTop: 4 },
  emptyLine: { fontSize: 13, color: TEXT_MUTED, fontStyle: 'italic' },
  classList: { gap: 8 },
  classRow: {
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
    gap: 2,
  },
  classTime: { fontSize: 12, fontWeight: '700', color: BRAND_BLUE },
  className: { fontSize: 14, fontWeight: '700', color: BRAND_BLUE_DARK },
  classMeta: { fontSize: 12, color: TEXT_MUTED },
  noteHint: { fontSize: 12, color: TEXT_MUTED, lineHeight: 16 },
  noteInput: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  saveNoteBtn: {
    alignSelf: 'flex-start',
    backgroundColor: BRAND_BLUE,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  saveNoteDisabled: { opacity: 0.6 },
  saveNoteText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  pressed: { opacity: 0.85 },
});
