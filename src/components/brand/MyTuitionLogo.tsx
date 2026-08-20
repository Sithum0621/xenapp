import { Image } from 'expo-image';
import { memo } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import MyTuitionWordmark from '@/src/components/brand/MyTuitionWordmark';
import { APP_BRAND_NAME, BrandAssets } from '@/src/constants/brand';

export type MyTuitionLogoProps = {
  /** `full` = login/welcome header; `mark` = compact nav strip. */
  variant?: 'full' | 'mark';
  showWordmark?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Product logo: processed mark image + optional two-tone “MyTuition” wordmark.
 * Uses WebP on web, PNG on native.
 */
function MyTuitionLogo({
  variant = 'full',
  showWordmark = true,
  style,
}: MyTuitionLogoProps) {
  const markSource =
    Platform.OS === 'web'
      ? variant === 'mark'
        ? BrandAssets.markWebp
        : BrandAssets.fullWebp
      : variant === 'mark'
        ? BrandAssets.markPng
        : BrandAssets.fullPng;

  const isMark = variant === 'mark';
  const markStyle = isMark ? styles.markCompact : styles.markFull;

  return (
    <View
      style={[styles.wrap, isMark && showWordmark ? styles.wrapRow : null, style]}
      accessibilityRole="image"
      accessibilityLabel={APP_BRAND_NAME}>
      <Image
        source={markSource}
        style={markStyle}
        contentFit="contain"
        accessibilityIgnoresInvertColors
      />
      {showWordmark ? (
        <MyTuitionWordmark
          size={isMark ? 'sm' : 'md'}
          style={isMark ? styles.wordmarkInline : styles.wordmarkStack}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  wrapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  markFull: {
    width: 96,
    height: 96,
  },
  markCompact: {
    width: 36,
    height: 36,
  },
  wordmarkStack: {
    marginTop: 2,
  },
  wordmarkInline: {
    marginTop: 0,
    transform: [{ translateY: 1 }],
  },
});

export default memo(MyTuitionLogo);
