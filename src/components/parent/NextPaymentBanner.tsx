import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { Pressable, StyleSheet, View } from 'react-native';

import { routeForPaymentPlan, subscriptionCountdownVisibleForRole } from '@/src/services/subscription';
import { FontFamily } from '@/src/theme/fonts';
import { parentBrandBlueDark } from '@/src/theme/parentDashboardPalette';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const WARN_FOREGROUND = '#B45309';

/** Extra height inside the bottom bar when this row is shown. */
export const NEXT_PAYMENT_ROW_HEIGHT = 32;

export type NextPaymentBannerProps = {
  role: string;
  expiryDateIso: string | null;
  isActive: boolean;
};

function formatCompactDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

/**
 * Next-payment countdown row — rendered inside the bottom nav bar (no own background).
 */
export default function NextPaymentBanner({
  role,
  expiryDateIso,
  isActive,
}: NextPaymentBannerProps) {
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

  if (!expiryDateIso) return null;

  const remainingMs = Math.max(0, expiryMs - nowMs);
  const isExpired = !isActive || remainingMs <= 0;
  const isWarning = !isExpired && remainingMs < ONE_DAY_MS;
  if (isExpired) return null;

  const compact = formatCompactDuration(remainingMs);
  const fg = isWarning ? WARN_FOREGROUND : parentBrandBlueDark;
  const label = t('parentDashboard.nextPaymentLabel');

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole={isWarning ? 'button' : 'text'}
        accessibilityLabel={`${label} ${compact}`}
        disabled={!isWarning}
        onPress={isWarning ? () => router.push(routeForPaymentPlan(role)) : undefined}
        style={({ pressed }) => [
          styles.rowInner,
          isWarning && pressed && styles.rowPressed,
        ]}>
        <Ionicons name="time-outline" size={14} color={fg} />
        <Text style={[styles.text, { color: fg }]} numberOfLines={1}>
          <Text style={[styles.textLabel, { color: fg }]}>{label}</Text>
          <Text style={{ color: fg }}> : </Text>
          <Text style={[styles.textValue, { color: fg }]}>{compact}</Text>
        </Text>
        {isWarning ? <Ionicons name="chevron-forward" size={14} color={fg} /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    minHeight: NEXT_PAYMENT_ROW_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(18, 59, 122, 0.1)',
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 7,
    minHeight: NEXT_PAYMENT_ROW_HEIGHT,
  },
  rowPressed: { opacity: 0.75 },
  text: {
    fontSize: 12.5,
    lineHeight: 16,
    flexShrink: 1,
  },
  textLabel: {
    fontFamily: FontFamily.bold,
  },
  textValue: {
    fontFamily: FontFamily.bold,
    letterSpacing: 0.15,
  },
});
