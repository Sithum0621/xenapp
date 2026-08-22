import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'mt_push_perm_prompt_v1:';

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId.trim()}`;
}

export async function hasHandledPushPermissionPrompt(userId: string): Promise<boolean> {
  if (!userId.trim()) return true;
  try {
    return (await AsyncStorage.getItem(storageKey(userId))) === '1';
  } catch {
    return false;
  }
}

export async function markPushPermissionPromptHandled(userId: string): Promise<void> {
  if (!userId.trim()) return;
  try {
    await AsyncStorage.setItem(storageKey(userId), '1');
  } catch {
    /* ignore */
  }
}
