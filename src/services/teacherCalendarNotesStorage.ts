import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = '@xen/teacher_calendar_notes';

export type TeacherCalendarNotesMap = Record<string, string>;

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

export async function loadTeacherCalendarNotes(userId: string): Promise<TeacherCalendarNotesMap> {
  if (!userId.trim()) return {};
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: TeacherCalendarNotesMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export async function saveTeacherCalendarNote(
  userId: string,
  dateIso: string,
  text: string,
): Promise<TeacherCalendarNotesMap> {
  if (!userId.trim() || !dateIso.trim()) return {};
  const existing = await loadTeacherCalendarNotes(userId);
  const trimmed = text.trim();
  const next = { ...existing };
  if (trimmed) {
    next[dateIso] = trimmed;
  } else {
    delete next[dateIso];
  }
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
