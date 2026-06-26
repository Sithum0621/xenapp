const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ScheduleTimeValidationCode =
  | 'invalid_time'
  | 'end_before_start'
  | 'invalid_date';

export function parseClockMinutes(value: string): number | null {
  const t = value.trim();
  if (!TIME_RE.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function validateScheduleTimes(
  startTime: string,
  endTime: string,
): ScheduleTimeValidationCode | null {
  const start = parseClockMinutes(startTime);
  const end = parseClockMinutes(endTime);
  if (start === null || end === null) return 'invalid_time';
  if (end <= start) return 'end_before_start';
  return null;
}

export function validateScheduleDate(classDate: string): ScheduleTimeValidationCode | null {
  const d = classDate.trim();
  if (!DATE_RE.test(d)) return 'invalid_date';
  const parsed = new Date(`${d}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'invalid_date';
  return null;
}

export function timesOverlapMinutes(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function mapScheduleDbError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('schedule_time_conflict')) return 'schedule_time_conflict';
  if (lower.includes('schedule_end_before_start') || lower.includes('end_before_start')) {
    return 'schedule_end_before_start';
  }
  if (lower.includes('group_schedules_recurring_year_ck')) return 'schedule_year_constraint';
  if (lower.includes('invalid_class_date') || lower.includes('class_date_required')) {
    return 'schedule_invalid_date';
  }
  if (lower.includes('invalid_day_of_week')) return 'schedule_invalid_day';
  return message;
}
