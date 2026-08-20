import { useEffect, type ReactNode } from 'react';
import { Appearance } from 'react-native';

import { appThemeColors, type AppThemeColors } from '@/src/theme/appThemeColors';

/**
 * Locks the app to the single light blue theme (dark appearance removed).
 * Kept as a thin provider so StatusBar / navigation can share one color object.
 */
export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    try {
      Appearance.setColorScheme('light');
    } catch {
      /* web / older RN may ignore */
    }
  }, []);

  return <>{children}</>;
}

export function useAppThemeColors(): AppThemeColors {
  return appThemeColors;
}
