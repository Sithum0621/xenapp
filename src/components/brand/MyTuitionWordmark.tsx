import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { APP_BRAND_NAME } from '@/src/constants/brand';
import { Text } from '@/src/theme/Text';
import { appBrandBlue, appBrandMy } from '@/src/theme/appBrandPalette';
import { FontFamily } from '@/src/theme/fonts';

export type MyTuitionWordmarkProps = {
  /** Overall height cue — maps to font size. */
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  myStyle?: StyleProp<TextStyle>;
  tuitionStyle?: StyleProp<TextStyle>;
};

const SIZE_PX = { sm: 22, md: 34, lg: 48 } as const;

/**
 * Temporary product lockup until MyTuition PNG/WebP logos are added.
 * “My” = azure · “Tuition” = navy.
 */
function MyTuitionWordmark({
  size = 'md',
  style,
  myStyle,
  tuitionStyle,
}: MyTuitionWordmarkProps) {
  const fontSize = SIZE_PX[size];
  const lineHeight = Math.round(fontSize * 1.15);

  return (
    <View
      style={[styles.wrap, style]}
      accessibilityRole="image"
      accessibilityLabel={APP_BRAND_NAME}>
      <Text style={[styles.base, { fontSize, lineHeight, color: appBrandMy }, myStyle]}>My</Text>
      <Text style={[styles.base, { fontSize, lineHeight, color: appBrandBlue }, tuitionStyle]}>
        Tuition
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexShrink: 1,
  },
  base: {
    fontFamily: FontFamily.black,
    letterSpacing: -0.4,
  },
});

export default memo(MyTuitionWordmark);
