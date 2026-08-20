import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/src/services/supabaseClient';

const storageKey = (userId: string) => `teacher_class_card_pdf_files:v1:${userId}`;

export type TeacherClassCardPdfFile = {
  id: string;
  fileName: string;
  pages: number;
  cardCount: number;
  qrUrls: string[];
  createdAt: string;
};

function fileNameFor(cardCount: number): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `MyTuition-class-cards-${cardCount}-${stamp}.pdf`;
}

export async function loadTeacherClassCardPdfFiles(): Promise<TeacherClassCardPdfFile[]> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) return [];
  try {
    const raw = await AsyncStorage.getItem(storageKey(data.user.id));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is TeacherClassCardPdfFile => {
      if (!row || typeof row !== 'object') return false;
      const r = row as TeacherClassCardPdfFile;
      return (
        typeof r.id === 'string' &&
        typeof r.fileName === 'string' &&
        typeof r.pages === 'number' &&
        typeof r.cardCount === 'number' &&
        Array.isArray(r.qrUrls)
      );
    });
  } catch {
    return [];
  }
}

export async function saveTeacherClassCardPdfFile(input: {
  pages: number;
  cardCount: number;
  qrUrls: string[];
}): Promise<{ ok: true; file: TeacherClassCardPdfFile } | { ok: false; error: string }> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) {
    return { ok: false, error: error?.message ?? 'Not signed in.' };
  }
  const file: TeacherClassCardPdfFile = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    fileName: fileNameFor(input.cardCount),
    pages: input.pages,
    cardCount: input.cardCount,
    qrUrls: input.qrUrls,
    createdAt: new Date().toISOString(),
  };
  try {
    const prev = await loadTeacherClassCardPdfFiles();
    await AsyncStorage.setItem(storageKey(data.user.id), JSON.stringify([file, ...prev]));
    return { ok: true, file };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
