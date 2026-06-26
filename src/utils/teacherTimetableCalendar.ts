import type { TeacherTimetableItem } from '@/src/services/teacherTodayScheduleApi';

export function dateToIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function classesForDate(
  date: Date,
  weekly: TeacherTimetableItem[],
  oneTime: TeacherTimetableItem[],
): TeacherTimetableItem[] {
  const iso = dateToIsoLocal(date);
  const dow = date.getDay();

  const fromWeekly = weekly.filter((item) => item.dayOfWeek === dow);
  const fromOneTime = oneTime.filter((item) => item.classDate === iso);

  return [...fromWeekly, ...fromOneTime].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/** Monday-first month grid cells (null = padding). */
export function getMonthGridCells(year: number, monthIndex: number): (Date | null)[] {
  const first = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const startPad = (first.getDay() + 6) % 7;

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= lastDay; d++) cells.push(new Date(year, monthIndex, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function monthLabel(date: Date, locale: string): string {
  const loc = locale === 'si' ? 'si-LK' : locale === 'ta' ? 'ta-LK' : 'en-LK';
  return new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' }).format(date);
}

export function dayDetailLabel(date: Date, locale: string): string {
  const loc = locale === 'si' ? 'si-LK' : locale === 'ta' ? 'ta-LK' : 'en-LK';
  return new Intl.DateTimeFormat(loc, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(date);
}
