import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/src/services/supabaseClient';

const storageKey = (userId: string) => `teacher_class_card_template:v1:${userId}`;

export type TeacherClassCardSide = 'front' | 'back';

export type TeacherClassCardTemplate = {
  frontUrl: string | null;
  backUrl: string | null;
};

export async function loadTeacherClassCardTemplate(): Promise<
  { ok: true; template: TeacherClassCardTemplate } | { ok: false; error: string }
> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) {
    return { ok: false, error: error?.message ?? 'Not signed in.' };
  }
  try {
    const raw = await AsyncStorage.getItem(storageKey(data.user.id));
    if (!raw) return { ok: true, template: { frontUrl: null, backUrl: null } };
    const parsed = JSON.parse(raw) as Partial<TeacherClassCardTemplate>;
    return {
      ok: true,
      template: {
        frontUrl: typeof parsed.frontUrl === 'string' ? parsed.frontUrl : null,
        backUrl: typeof parsed.backUrl === 'string' ? parsed.backUrl : null,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function persist(
  userId: string,
  template: TeacherClassCardTemplate,
): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(template));
}

export async function saveTeacherClassCardSide(
  side: TeacherClassCardSide,
  uri: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const url = uri.trim();
  if (!url) return { ok: false, error: 'Image is required.' };
  const loaded = await loadTeacherClassCardTemplate();
  if (!loaded.ok) return loaded;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) {
    return { ok: false, error: error?.message ?? 'Not signed in.' };
  }
  const template: TeacherClassCardTemplate = {
    ...loaded.template,
    [side === 'front' ? 'frontUrl' : 'backUrl']: url,
  };
  try {
    await persist(data.user.id, template);
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function removeTeacherClassCardSide(
  side: TeacherClassCardSide,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const loaded = await loadTeacherClassCardTemplate();
  if (!loaded.ok) return loaded;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) {
    return { ok: false, error: error?.message ?? 'Not signed in.' };
  }
  const template: TeacherClassCardTemplate = {
    ...loaded.template,
    [side === 'front' ? 'frontUrl' : 'backUrl']: null,
  };
  if (side === 'front') template.backUrl = null;
  try {
    await persist(data.user.id, template);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
