import type { ViewStyle } from 'react-native';

/** Matches `AdminDashboardShell` compact drawer breakpoint. */
export const ADMIN_COMPACT_BREAKPOINT = 768;

export function adminContentPadding(isCompact: boolean): ViewStyle {
  return {
    paddingHorizontal: isCompact ? 16 : 24,
    paddingBottom: isCompact ? 32 : 40,
    paddingTop: isCompact ? 8 : 16,
  };
}
