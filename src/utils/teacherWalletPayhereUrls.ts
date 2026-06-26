import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { AppRoutes } from '@/src/navigation/AppNavigator';

/** PayHere return/cancel URLs — web uses http(s); native uses xen:// deep link. */
export function teacherWalletPayhereReturnUrl(outcome: 'success' | 'cancel'): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const url = new URL(AppRoutes.teacherWallet, window.location.origin);
    url.searchParams.set('payhere', outcome);
    return url.href;
  }
  return Linking.createURL('teacher-dashboard/wallet', { queryParams: { payhere: outcome } });
}

/** Redirect target after in-app browser closes (native auth session). */
export function teacherWalletPayhereRedirectUrl(): string {
  return teacherWalletPayhereReturnUrl('success').split('?')[0] ?? teacherWalletPayhereReturnUrl('success');
}

export function isAllowedPayhereReturnUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('xen://')) return true;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.pathname.includes('/teacher-dashboard/wallet');
    }
  } catch {
    return false;
  }
  return false;
}
