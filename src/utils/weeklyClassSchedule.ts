import type { WeekdayKey } from '@/src/utils/teacherGroupRouteParams';
import { WEEKDAY_KEY_TO_JS_DOW } from '@/src/utils/teacherGroupRouteParams';

export const SCHEDULE_TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
export const SCHEDULE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function formatLocalDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Next calendar date (today or later) that falls on the given weekday. */
export function nextDateForWeekday(weekday: WeekdayKey, from: Date = new Date()): string {
  const targetDow = WEEKDAY_KEY_TO_JS_DOW[weekday];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < 8; i += 1) {
    if (cursor.getDay() === targetDow) {
      return formatLocalDateIso(cursor);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return formatLocalDateIso(from);
}

export function parseLocalDateIso(iso: string): Date | null {
  if (!SCHEDULE_DATE_RE.test(iso.trim())) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

export function dateMatchesWeekday(iso: string, weekday: WeekdayKey): boolean {
  const date = parseLocalDateIso(iso);
  if (!date) return false;
  return date.getDay() === WEEKDAY_KEY_TO_JS_DOW[weekday];
}

export function scheduleYearFromDate(iso: string): number | null {
  const date = parseLocalDateIso(iso);
  return date ? date.getFullYear() : null;
}

export function normalizeScheduleTime(t: string): string {
  const s = t.trim();
  if (!s) return '09:00:00';
  return s.length <= 5 ? `${s}:00` : s;
}

export type ScheduleTimeValidation = 'invalid_time' | 'end_before_start' | null;

export function validateScheduleTimes(start: string, end: string): ScheduleTimeValidation {
  const a = start.trim();
  const b = end.trim();
  if (!SCHEDULE_TIME_RE.test(a) || !SCHEDULE_TIME_RE.test(b)) return 'invalid_time';
  const [sh, sm] = a.split(':').map(Number);
  const [eh, em] = b.split(':').map(Number);
  const smin = sh * 60 + sm;
  const emin = eh * 60 + em;
  if (emin <= smin) return 'end_before_start';
  return null;
}
