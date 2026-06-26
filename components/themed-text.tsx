import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { StyleSheet, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      style={[
        { color },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? styles.link : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: FontFamily.regular,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: FontFamily.bold,
  },
  title: {
    fontSize: 32,
    lineHeight: 36,
    fontFamily: FontFamily.black,
  },
  subtitle: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: FontFamily.bold,
  },
  link: {
    lineHeight: 30,
    fontSize: 16,
    fontFamily: FontFamily.regular,
    color: '#0a7ea4',
  },
});
