export type AmPm = 'AM' | 'PM';

export type ScheduleDateParts = {
  year: string;
  month: string;
  day: string;
};

export type ScheduleTime12Parts = {
  hour: string;
  minute: string;
  ampm: AmPm;
};

export function todayDateParts(): ScheduleDateParts {
  const d = new Date();
  return {
    year: String(d.getFullYear()),
    month: String(d.getMonth() + 1),
    day: String(d.getDate()),
  };
}

export function clock24ToTime12Parts(hhmm: string): ScheduleTime12Parts {
  const [hRaw, mRaw] = hhmm.split(':');
  let h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return { hour: '12', minute: '00', ampm: 'AM' };
  }
  const ampm: AmPm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return {
    hour: String(h),
    minute: String(m).padStart(2, '0'),
    ampm,
  };
}

export function combineDateParts(
  parts: ScheduleDateParts,
): { iso: string } | { error: 'invalid_date' } {
  const year = parts.year.trim();
  const month = parts.month.trim();
  const day = parts.day.trim();

  if (!/^\d{4}$/.test(year)) return { error: 'invalid_date' };
  if (!/^\d{1,2}$/.test(month)) return { error: 'invalid_date' };
  if (!/^\d{1,2}$/.test(day)) return { error: 'invalid_date' };

  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) {
    return { error: 'invalid_date' };
  }

  const iso = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const parsed = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return { error: 'invalid_date' };
  if (
    parsed.getFullYear() !== y ||
    parsed.getMonth() + 1 !== m ||
    parsed.getDate() !== d
  ) {
    return { error: 'invalid_date' };
  }

  return { iso };
}

export function combineTime12Parts(
  parts: ScheduleTime12Parts,
): { hhmm: string } | { error: 'invalid_time' } {
  const hourRaw = parts.hour.trim();
  const minuteRaw = parts.minute.trim();
  if (!/^\d{1,2}$/.test(hourRaw) || !/^\d{1,2}$/.test(minuteRaw)) {
    return { error: 'invalid_time' };
  }

  const hour12 = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) {
    return { error: 'invalid_time' };
  }

  let hour24 = hour12 % 12;
  if (parts.ampm === 'PM') hour24 += 12;

  return {
    hhmm: `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

export function validateCombinedTimes(
  startHhmm: string,
  endHhmm: string,
): 'invalid_time' | 'end_before_start' | null {
  const [sh, sm] = startHhmm.split(':').map(Number);
  const [eh, em] = endHhmm.split(':').map(Number);
  if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) {
    return 'invalid_time';
  }
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (end <= start) return 'end_before_start';
  return null;
}

/** Keep numeric input tidy while typing. */
export function sanitizeNumericInput(value: string, maxLen: number): string {
  return value.replace(/\D/g, '').slice(0, maxLen);
}

export function datePartsToIso(parts: ScheduleDateParts): string | null {
  const result = combineDateParts(parts);
  return 'error' in result ? null : result.iso;
}

export function isoToDateParts(iso: string): ScheduleDateParts {
  const [year = '', month = '', day = ''] = iso.split('-');
  return {
    year,
    month: month ? String(Number(month)) : '',
    day: day ? String(Number(day)) : '',
  };
}

export function datePartsToDate(parts: ScheduleDateParts): Date {
  const iso = datePartsToIso(parts);
  if (!iso) {
    const today = todayDateParts();
    return new Date(`${today.year}-${String(Number(today.month)).padStart(2, '0')}-${String(Number(today.day)).padStart(2, '0')}T12:00:00`);
  }
  return new Date(`${iso}T12:00:00`);
}

export function time12PartsToDate(parts: ScheduleTime12Parts): Date {
  const result = combineTime12Parts(parts);
  const d = new Date();
  if ('error' in result) {
    d.setHours(9, 0, 0, 0);
    return d;
  }
  const [h, m] = result.hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

export function dateToTime12Parts(d: Date): ScheduleTime12Parts {
  return clock24ToTime12Parts(
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  );
}

export function time12PartsToInputValue(parts: ScheduleTime12Parts): string {
  const result = combineTime12Parts(parts);
  return 'error' in result ? '09:00' : result.hhmm;
}

export function formatDatePartsDisplay(parts: ScheduleDateParts, locale?: string): string {
  const iso = datePartsToIso(parts);
  if (!iso) return '';
  return new Date(`${iso}T12:00:00`).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatTime12PartsDisplay(parts: ScheduleTime12Parts, locale?: string): string {
  if ('error' in combineTime12Parts(parts)) return '';
  return time12PartsToDate(parts).toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function parseClockHhmmToMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

/** True when a one-time class end (local date + end time) is in the past. */
export function isOneTimeSchedulePastEnd(
  classDate: string | null,
  endTime: string,
  now = new Date(),
): boolean {
  if (!classDate) return false;
  const endMinutes = parseClockHhmmToMinutes(endTime);
  if (endMinutes === null) return false;

  const [year, month, day] = classDate.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;

  const endAt = new Date(
    year,
    month - 1,
    day,
    Math.floor(endMinutes / 60),
    endMinutes % 60,
    0,
    0,
  );
  return now.getTime() > endAt.getTime();
}

export function filterActiveScheduleListRows<
  T extends { kind: string; class_date: string | null; end_time: string },
>(rows: T[], now = new Date()): T[] {
  return rows.filter(
    (row) =>
      row.kind !== 'one_time' || !isOneTimeSchedulePastEnd(row.class_date, row.end_time, now),
  );
}
