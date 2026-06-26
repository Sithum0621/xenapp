import { StyleSheet } from 'react-native';

import { appSurface, appWarnBanner } from '@/src/theme/appBrandPalette';

export const ALERT_BANNER_STACK_BREAKPOINT = 640;

/** Shared layout for inline warning banners (temp password, ops notices). */
export const alertBannerStyles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: appWarnBanner.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: appWarnBanner.border,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    width: '100%',
    maxWidth: '100%',
  },
  shellStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  topRowStacked: {
    flex: 0,
    width: '100%',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: appWarnBanner.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  message: {
    fontSize: 13.5,
    fontWeight: '700',
    color: appWarnBanner.text,
    lineHeight: 19,
    flexShrink: 1,
  },
  hint: {
    fontSize: 12.5,
    color: appWarnBanner.text,
    opacity: 0.85,
    lineHeight: 17,
    flexShrink: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: appWarnBanner.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    flexShrink: 0,
  },
  actionBtnStacked: {
    alignSelf: 'stretch',
    width: '100%',
  },
  actionBtnPressed: { opacity: 0.9 },
  actionText: {
    fontSize: 13,
    fontWeight: '800',
    color: appSurface,
    letterSpacing: 0.2,
    textAlign: 'center',
    flexShrink: 1,
  },
  wrap: {
    width: '100%',
    maxWidth: '100%',
  },
});
