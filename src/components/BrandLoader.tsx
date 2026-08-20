import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { BrandAssets } from '@/src/constants/brand';

type Size = 'sm' | 'md' | 'lg';

const SIZE_PX: Record<Size, number> = {
  sm: 56,
  md: 96,
  lg: 140,
};

type BrandLoaderProps = {
  size?: Size;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/** Current MyTuition mark with a soft blink — use for full-screen / section loading. */
export function BrandLoader({
  size = 'md',
  style,
  accessibilityLabel = 'Loading',
}: BrandLoaderProps) {
  const px = SIZE_PX[size];
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.28, {
        duration: 720,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [opacity]);

  const blinkStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const markSource = Platform.OS === 'web' ? BrandAssets.markWebp : BrandAssets.markPng;

  return (
    <View
      style={[styles.wrap, { width: px, height: px }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}>
      <Animated.View style={[{ width: px, height: px }, blinkStyle]}>
        <Image
          source={markSource}
          style={{ width: px, height: px }}
          contentFit="contain"
          accessibilityIgnoresInvertColors
        />
      </Animated.View>
    </View>
  );
}

type BrandLoadingScreenProps = {
  size?: Size;
  /** Defaults to light-blue page so the branded mark reads on theme surface. */
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/** Full-screen branded boot / gate loader. */
export function BrandLoadingScreen({
  size = 'lg',
  backgroundColor = '#F7FAFF',
  style,
  accessibilityLabel = 'Loading',
}: BrandLoadingScreenProps) {
  return (
    <View style={[styles.screen, { backgroundColor }, style]}>
      <BrandLoader size={size} accessibilityLabel={accessibilityLabel} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
