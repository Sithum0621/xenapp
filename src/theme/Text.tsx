import {
  Platform,
  StyleSheet,
  Text as RNText,
  type TextProps,
  type TextStyle,
} from 'react-native';

import { FontFamily } from '@/src/theme/fonts';

function weightToFamily(weight: TextStyle['fontWeight'] | undefined): string {
  if (weight === undefined || weight === 'normal' || weight === '400') {
    return FontFamily.regular;
  }
  if (weight === 'bold' || weight === '700' || weight === '600' || weight === '500') {
    return FontFamily.bold;
  }
  if (weight === '100' || weight === '200' || weight === '300' || weight === 'light') {
    return FontFamily.light;
  }
  if (weight === '800' || weight === '900' || weight === 800 || weight === 900) {
    return FontFamily.black;
  }
  return FontFamily.regular;
}

function resolveFontFamily(style: TextProps['style']): string {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  if (flat?.fontFamily) {
    return flat.fontFamily as string;
  }
  const italic = flat?.fontStyle === 'italic';
  const w = flat?.fontWeight;
  if (italic) {
    if (w === '700' || w === 'bold' || w === '600' || w === '500' || w === '800' || w === '900') {
      return FontFamily.boldItalic;
    }
    return FontFamily.regularItalic;
  }
  return weightToFamily(w);
}

/**
 * App-wide `Text` using Lato. Prefer this over `react-native`’s `Text` so
 * typography stays consistent. Custom `fontFamily` in `style` overrides mapping.
 */
export function Text({ style, ...rest }: TextProps) {
  const fontFamily = resolveFontFamily(style);
  return (
    <RNText
      {...rest}
      {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
      style={[
        { fontFamily },
        style,
        Platform.OS === 'android' ? { fontWeight: undefined, fontStyle: undefined } : null,
      ]}
    />
  );
}
