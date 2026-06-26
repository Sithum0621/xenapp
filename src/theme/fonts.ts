/**
 * Lato (`@expo-google-fonts/lato`) face names for `fontFamily`.
 * Loaded in `app/_layout.tsx` via `useFonts` before the UI is shown.
 *
 * Latin text uses Lato as intended. Scripts that Lato does not cover (e.g. some
 * Sinhala/Tamil glyphs) are typically rendered via the platform’s fallback
 * fonts for those code points when available.
 */
export const FontFamily = {
  thin: 'Lato_100Thin',
  light: 'Lato_300Light',
  regular: 'Lato_400Regular',
  regularItalic: 'Lato_400Regular_Italic',
  bold: 'Lato_700Bold',
  boldItalic: 'Lato_700Bold_Italic',
  black: 'Lato_900Black',
  blackItalic: 'Lato_900Black_Italic',
} as const;
