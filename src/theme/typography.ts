import { FontFamily } from '@/src/theme/fonts';

/** Shared Lato typography tokens for dashboards and cards. */
export const Typography = {
  /** Large greeting — "Hello," */
  greeting: {
    fontFamily: FontFamily.black,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  /** Student name in greeting */
  greetingName: {
    fontFamily: FontFamily.boldItalic,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.3,
  },
  /** Section / card titles */
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  /** Secondary labels, subtitles */
  subtitle: {
    fontFamily: FontFamily.light,
    fontSize: 12,
    lineHeight: 16,
  },
  /** Body / descriptions */
  body: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  /** Tab / chip labels */
  tab: {
    fontFamily: FontFamily.bold,
    fontSize: 14,
    lineHeight: 18,
  },
} as const;
