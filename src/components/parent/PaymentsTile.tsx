import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';

import { routeForPaymentPlan } from '@/src/services/subscription';
import { FontFamily } from '@/src/theme/fonts';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const SURFACE = '#FFFFFF';

/**
 * 2×2 grid tile: card icon (vector). Opens payment / renewal plan.
 */
export default function PaymentsTile() {
  const { t } = useTranslation();
  const scale = useRef(new Animated.Value(1)).current;

  const onIn = () =>
    Animated.timing(scale, {
      toValue: 0.97,
      duration: 90,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  const onOut = () =>
    Animated.timing(scale, {
      toValue: 1,
      duration: 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <Animated.View style={[styles.outer, { transform: [{ scale }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('parentDashboard.paymentsTitle')}
        onPress={() => router.push(routeForPaymentPlan('parent_student'))}
        onPressIn={onIn}
        onPressOut={onOut}
        style={styles.tile}>
        <View style={styles.iconArea}>
          <Ionicons name="card" size={60} color={BRAND_BLUE} />
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {t('parentDashboard.paymentsTitle')}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    minHeight: 196,
  },
  tile: {
    flex: 1,
    backgroundColor: SURFACE,
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 14,
    gap: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 196,
    ...Platform.select({
      android: { elevation: 3 },
      default: {
        shadowColor: '#0E2F63',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
      },
    }),
  },
  iconArea: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
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
