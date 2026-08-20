import type { ViewStyle } from 'react-native';

import { PAGE_CONTENT_BOTTOM, PAGE_EDGE_INSET } from '@/src/theme/pageLayout';

/** Matches `AdminDashboardShell` compact drawer breakpoint. */
export const ADMIN_COMPACT_BREAKPOINT = 768;

/** Home-matching horizontal gutters; slightly more vertical room on desktop. */
export function adminContentPadding(isCompact: boolean): ViewStyle {
  return {
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingBottom: isCompact ? PAGE_CONTENT_BOTTOM : 40,
    paddingTop: isCompact ? 8 : 16,
  };
}
