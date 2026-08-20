import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/src/services/supabaseClient';
import type { StudentClassCardData } from '@/src/services/studentClassCardApi';

const storageKey = (userId: string) => `parent_class_card_soft_copies:v1:${userId}`;

export type ParentClassCardSoftCopy = {
  /** `${studentUserId}:${lectureGroupId ?? 'none'}` */
  key: string;
  card: StudentClassCardData;
  lectureGroupId: string | null;
  groupName: string | null;
  instituteName: string | null;
  teacherName: string | null;
};

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseCard(raw: unknown): StudentClassCardData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const studentUserId = asString(r.studentUserId).trim();
  if (!studentUserId) return null;
  return {
    studentUserId,
    fullName: asString(r.fullName),
    mobileNumber: asString(r.mobileNumber),
    xenStudentId: asString(r.xenStudentId),
  };
}

function parseEntry(raw: unknown): ParentClassCardSoftCopy | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const key = asString(r.key).trim();
  const card = parseCard(r.card);
  if (!key || !card) return null;
  return {
    key,
    card,
    lectureGroupId: typeof r.lectureGroupId === 'string' ? r.lectureGroupId : null,
    groupName: typeof r.groupName === 'string' ? r.groupName : null,
    instituteName: typeof r.instituteName === 'string' ? r.instituteName : null,
    teacherName: typeof r.teacherName === 'string' ? r.teacherName : null,
  };
}

export async function loadParentClassCardSoftCopies(): Promise<ParentClassCardSoftCopy[]> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) return [];
  try {
    const raw = await AsyncStorage.getItem(storageKey(data.user.id));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseEntry)
      .filter((row): row is ParentClassCardSoftCopy => row != null);
  } catch {
    return [];
  }
}

export async function saveParentClassCardSoftCopies(
  copies: ParentClassCardSoftCopy[],
): Promise<void> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) return;
  try {
    await AsyncStorage.setItem(storageKey(data.user.id), JSON.stringify(copies));
  } catch {
    // Keep the in-memory list even if disk write fails.
  }
}
