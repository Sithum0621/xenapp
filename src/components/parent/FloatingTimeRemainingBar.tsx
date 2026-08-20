import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { routeForPaymentPlan, subscriptionCountdownVisibleForRole } from '@/src/services/subscription';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const BRAND_BLUE_DARK = '#00101F';
const BRAND_BLUE = '#041830';
const WARN_BORDER = 'rgba(217, 119, 6, 0.55)';
const WARN_FOREGROUND = '#92400E';
const SOFT_BORDER = 'rgba(18, 59, 122, 0.18)';

export type FloatingTimeRemainingBarProps = {
  role: string;
  expiryDateIso: string | null;
  isActive: boolean;
  bottom: number;
};

function formatCompactDuration(ms: number): { compact: string; long: string } {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const compact =
    days > 0
      ? `${days}d ${hours}h`
      : hours > 0
        ? `${hours}h ${minutes}m`
        : `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  const long = `${days}d ${hours}h ${minutes}m ${seconds}s`;
  return { compact, long };
}

/**
 * Sticky banner that sits above the bottom navigation bar and shows the
 * subscription countdown for the active user. Renders nothing when the
 * subscription cannot be evaluated (e.g. bypass roles or while loading).
 */
export default function FloatingTimeRemainingBar({
  role,
  expiryDateIso,
  isActive,
  bottom,
}: FloatingTimeRemainingBarProps) {
  const { t } = useTranslation();
  const [nowMs, setNowMs] = useState(() => Date.now());

  const expiryMs = useMemo(
    () => (expiryDateIso ? new Date(expiryDateIso).getTime() : 0),
    [expiryDateIso],
  );

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!subscriptionCountdownVisibleForRole(role)) return null;

  if (!expiryDateIso || expiryDateIso === 'infinity') return null;

  const remainingMs = Math.max(0, expiryMs - nowMs);
  const isExpired = !isActive || remainingMs <= 0;
  const isWarning = !isExpired && remainingMs < ONE_DAY_MS;

  if (isExpired) return null;

  const { compact } = formatCompactDuration(remainingMs);

  const gradientColors = isWarning
    ? (['rgba(255, 247, 237, 0.96)', 'rgba(253, 230, 138, 0.96)'] as const)
    : (['rgba(238, 244, 255, 0.96)', 'rgba(214, 228, 255, 0.96)'] as const);

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom }]}>
      <View
        style={[
          styles.glass,
          isWarning && styles.glassWarning,
          Platform.OS === 'web' ? styles.glassWeb : null,
        ]}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.row}>
          <View style={[styles.iconWrap, isWarning && styles.iconWrapWarning]}>
            <Ionicons
              name={isWarning ? 'alert-circle' : 'time-outline'}
              size={18}
              color={isWarning ? WARN_FOREGROUND : BRAND_BLUE}
            />
          </View>

          <View style={styles.textBlock}>
            <Text style={[styles.label, isWarning && styles.labelWarning]} numberOfLines={1}>
              {t('parentDashboard.timeRemainingLabel')}
            </Text>
            <Text
              style={[styles.value, isWarning && styles.valueWarning]}
              numberOfLines={1}
              accessibilityLabel={`${t('parentDashboard.timeRemainingLabel')}: ${compact}`}>
              {compact}
            </Text>
          </View>

          {isWarning ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace(routeForPaymentPlan(role))}
              style={({ pressed }) => [
                styles.renewBtn,
                pressed && styles.renewBtnPressed,
              ]}>
              <Ionicons name="refresh" size={14} color="#FFFFFF" />
              <Text style={styles.renewText}>{t('parentDashboard.timeRemainingRenew')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    alignItems: 'center',
  },
  glass: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SOFT_BORDER,
    backgroundColor: 'rgba(255, 255, 255, 0.86)',
    ...Platform.select({
      android: { elevation: 6 },
      default: {
        shadowColor: '#00101F',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 14,
      },
    }),
  },
  glassWeb: {
    backdropFilter: 'saturate(140%) blur(14px)',
    WebkitBackdropFilter: 'saturate(140%) blur(14px)',
  } as object,
  glassWarning: { borderColor: WARN_BORDER },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: 'rgba(18, 59, 122, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapWarning: { backgroundColor: 'rgba(217, 119, 6, 0.16)' },
  textBlock: { flex: 1, gap: 0 },
  label: { fontSize: 11.5, fontWeight: '700', color: BRAND_BLUE, letterSpacing: 0.3 },
  labelWarning: { color: WARN_FOREGROUND },
  value: { fontSize: 14.5, fontWeight: '900', color: BRAND_BLUE_DARK, letterSpacing: -0.2 },
  valueWarning: { color: WARN_FOREGROUND },
  renewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: WARN_FOREGROUND,
  },
  renewBtnPressed: { opacity: 0.88 },
  renewText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
});
