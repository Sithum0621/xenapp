import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Router } from 'expo-router';
import type { TFunction } from 'i18next';

import { appLockGetStatus } from '@/src/services/appLockApi';
import { appAlert } from '@/src/utils/appAlert';

const STORAGE_KEY = 'xen_app_lock_register_prompt_handled';

export async function hasHandledAppLockRegisterPrompt(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) === '1';
  } catch {
    return false;
  }
}

async function markAppLockRegisterPromptHandled(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

/**
 * One-time per app install: suggest app lock after the first student account is registered.
 * Skipped when app lock is already on, or after the prompt was already handled.
 */
export async function maybeShowAppLockRegistrationPrompt(
  router: Router,
  t: TFunction,
): Promise<void> {
  if (await hasHandledAppLockRegisterPrompt()) return;

  const { status } = await appLockGetStatus();
  const appLockActive = Boolean(status?.enabled && status?.pinIsSet);
  await markAppLockRegisterPromptHandled();
  if (appLockActive) return;

  appAlert(t('appLock.registerPromptTitle'), t('appLock.registerPromptBody'), [
    { text: t('appLock.registerPromptLater'), style: 'cancel' },
    {
      text: t('appLock.registerPromptSetup'),
      onPress: () => router.push('/parent-dashboard/settings/app-lock'),
    },
  ]);
}
