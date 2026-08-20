import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

const BRAND_BLUE_DARK = '#00101F';
const TEXT_MUTED = '#64748B';
const SURFACE = '#FFFFFF';
const GRADIENT_START = '#041830';
const GRADIENT_END = '#10B981';

const RING_SIZE = 124;
const RING_STROKE = 9;

export type GrowthTrackerCardProps = {
  targetPercent?: number;
};

function GrowthTrackerCard({ targetPercent = 100 }: GrowthTrackerCardProps) {
  const { t } = useTranslation();
  const displayValue = Math.round(Math.max(0, Math.min(100, targetPercent)));

  const scale = useRef(new Animated.Value(0.94)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(scale, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [opacity, scale]);

  return (
    <View style={styles.tile} accessibilityRole="summary">
      <View style={styles.body}>
        <Animated.View style={[styles.medallion, { opacity, transform: [{ scale }] }]}>
          <LinearGradient
            colors={[GRADIENT_START, GRADIENT_END]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.medallionGradient}
          />
          <View style={styles.medallionInner}>
            <Text style={styles.medallionValue}>{displayValue}%</Text>
            <View style={styles.medallionLabelRow}>
              <Ionicons name="trending-up" size={11} color={GRADIENT_END} />
              <Text style={styles.medallionLabel}>
                {t('parentDashboard.growthMedallionLabel')}
              </Text>
            </View>
          </View>
        </Animated.View>
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {t('parentDashboard.growthTitle')}
      </Text>
    </View>
  );
}

export default memo(GrowthTrackerCard);

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: SURFACE,
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 14,
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 196,
    ...Platform.select({
      android: { elevation: 3 },
      default: {
        shadowColor: '#00101F',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
      },
    }),
  },
  body: { alignItems: 'center', justifyContent: 'center' },
  medallion: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medallionGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RING_SIZE / 2,
  },
  medallionInner: {
    width: RING_SIZE - RING_STROKE * 2,
    height: RING_SIZE - RING_STROKE * 2,
    borderRadius: (RING_SIZE - RING_STROKE * 2) / 2,
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  medallionValue: {
    fontSize: 26,
    lineHeight: 30,
    fontFamily: FontFamily.black,
    color: BRAND_BLUE_DARK,
    letterSpacing: -0.6,
  },
  medallionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  medallionLabel: {
    fontSize: 9,
    lineHeight: 12,
    fontFamily: FontFamily.bold,
    color: TEXT_MUTED,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    letterSpacing: -0.1,
    textAlign: 'center',
  },
});
