import type { ReactNode } from 'react';

import { KeyboardDismissView } from '@/src/components/layout/KeyboardDismissView';

/**
 * Wraps stack screens without KeyboardAvoidingView (avoids black gaps on Android
 * and broken layout when wrapping nested navigators). Form screens use
 * KeyboardAwareScrollView / AppScrollView; lists use NativeFluidFlatList — both
 * add keyboard bottom inset. Modals use KeyboardAwareModalFrame.
 */
export function globalStackScreenLayout({ children }: { children: ReactNode }) {
  return <KeyboardDismissView>{children}</KeyboardDismissView>;
}

export const globalStackScreenOptions = {
  contentStyle: { flex: 1 as const },
};
