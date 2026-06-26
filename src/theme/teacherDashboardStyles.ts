import { Platform, StyleSheet } from 'react-native';

import { appBorder, appPageSurface, appSurface } from '@/src/theme/appBrandPalette';

/** Shared elevated panel used on teacher overview + chats tabs. */
export const teacherDashboardCard = {
  backgroundColor: appSurface,
  borderRadius: 14,
  borderWidth: 1.5,
  borderColor: appBorder,
  overflow: 'hidden' as const,
  ...Platform.select({
    ios: {
      shadowColor: '#123B7A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },
    android: { elevation: 2 },
    default: {},
  }),
};

export const teacherDashboardScreen = StyleSheet.create({
  contentPad: {
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  pageHeader: {
    marginBottom: 14,
    gap: 4,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0E2F63',
  },
  pageSub: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  emptyCard: {
    ...teacherDashboardCard,
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 22,
    gap: 10,
    marginTop: 4,
  },
  emptyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(18, 59, 122, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0E2F63',
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: appBorder,
    borderRadius: 12,
    backgroundColor: appPageSurface,
    paddingLeft: 40,
    paddingRight: 36,
    minHeight: 46,
  },
});
