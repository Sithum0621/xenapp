import { type ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

export type AnimatedCardProps = {
  children: ReactNode;
  /** Delay in ms before the entrance animation begins. Use to stagger cards. */
  delay?: number;
  /**
   * When set, skips the entrance animation and shows content immediately.
   * Use after the first mount to avoid re-animating on student/tab changes.
   */
  instant?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Wraps any content in a soft fade-in + slide-up entrance animation.
 * Cheap (only animates opacity + transform, runs on the native driver) and
 * intentionally lightweight so it can wrap every card on the home screen
 * without compounding into jank.
 */
export default function AnimatedCard({ children, delay = 0, instant = false, style }: AnimatedCardProps) {
  const opacity = useRef(new Animated.Value(instant ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(instant ? 0 : 14)).current;

  useEffect(() => {
    if (instant) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    opacity.setValue(0);
    translateY.setValue(14);
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 320,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 360,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [delay, instant, opacity, translateY]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}
