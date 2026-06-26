/** Route / workspace context for teacher group detail screens (Expo Router search params). */

export type TeacherGroupSource = 'institute' | 'personal';

export type TeacherGroupRouteContext = {
  source: TeacherGroupSource;
  groupId: string;
  title: string;
};

export function paramString(v: string | string[] | undefined): string {
  if (v == null) return '';
  return Array.isArray(v) ? (v[0] ?? '') : v;
}

export function safeDecodeURIComponent(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
}

export function parseTeacherGroupParams(params: {
  title?: string | string[];
  source?: string | string[];
  id?: string | string[];
}): TeacherGroupRouteContext {
  const id = paramString(params.id).trim();
  const rawSource = paramString(params.source).trim().toLowerCase();
  const source: TeacherGroupSource = rawSource === 'personal' ? 'personal' : 'institute';
  const titleRaw = paramString(params.title).trim();
  const title = titleRaw ? safeDecodeURIComponent(titleRaw) : '';
  return { source, groupId: id, title };
}

/** JS Date.getDay(): 0=Sun .. 6=Sat — matches public.group_schedules.day_of_week */
export const WEEKDAY_KEY_TO_JS_DOW = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 0,
} as const;

export type WeekdayKey = keyof typeof WEEKDAY_KEY_TO_JS_DOW;

export function jsDowToWeekdayKey(dow: number): WeekdayKey | null {
  const map: Record<number, WeekdayKey> = {
    0: 'sun',
    1: 'mon',
    2: 'tue',
    3: 'wed',
    4: 'thu',
    5: 'fri',
    6: 'sat',
  };
  return map[dow] ?? null;
}
