import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@xen/preferred_language';

export type StoredLangCode = 'en' | 'si' | 'ta';

export async function getStoredLanguagePreference(): Promise<StoredLangCode | null> {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'si' || v === 'ta') return v;
    return null;
  } catch {
    return null;
  }
}

export async function setStoredLanguagePreference(code: StoredLangCode): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* ignore */
  }
}
