import { useWindowDimensions } from 'react-native';

import { ADMIN_COMPACT_BREAKPOINT, adminContentPadding } from '@/src/constants/adminLayout';

export function useAdminLayout() {
  const { width } = useWindowDimensions();
  const isCompact = width < ADMIN_COMPACT_BREAKPOINT;

  return {
    isCompact,
    contentPadding: adminContentPadding(isCompact),
  };
}
