import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { parentBrandBlueDark, parentInkSoft } from '@/src/theme/parentDashboardPalette';

export type GamesScheduleExamScoreResultProps = {
  score: number;
  total: number;
  title: string;
  subtitle?: string;
};

export default function GamesScheduleExamScoreResult({
  title,
  subtitle,
}: GamesScheduleExamScoreResultProps) {
  const scale = useRef(new Animated.Value(0.82)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, scale]);

  return (
    <Animated.View style={[styles.wrap, { opacity, transform: [{ scale }] }]}>
      <View style={styles.badge}>
        <Text style={styles.scoreLine} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  badge: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  scoreLine: {
    fontSize: 32,
    lineHeight: 38,
    fontFamily: FontFamily.black,
    color: parentBrandBlueDark,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
    textAlign: 'center',
  },
});
