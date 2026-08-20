import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  isPaidLike,
  routeForPaymentPlan,
  subscriptionCountdownVisibleForRole,
} from '@/src/services/subscription';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type Props = {
  role: string;
  expiryDateIso: string | null;
  isActive: boolean;
  /** From validate_subscription_access — countdown only for paid/trial. */
  reason?: string | null;
};

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / (24 * 3600));
  const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

/**
 * Soft countdown / free chip for parent dashboards. Never hard-blocks the app.
 */
export default function SubscriptionCountdownGate({
  role,
  expiryDateIso,
  isActive,
  reason,
}: Props) {
  const { t } = useTranslation();
  const [nowMs, setNowMs] = useState(Date.now());
  const expiryMs = useMemo(
    () => (expiryDateIso ? new Date(expiryDateIso).getTime() : 0),
    [expiryDateIso],
  );

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!subscriptionCountdownVisibleForRole(role)) {
    return null;
  }

  const paidLike = isPaidLike(reason) || (isActive && Boolean(expiryDateIso) && expiryDateIso !== 'infinity');

  if (!paidLike) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(routeForPaymentPlan(role))}
        style={({ pressed }) => [styles.freeChip, pressed && styles.pressed]}>
        <Text style={styles.freeChipTitle}>{t('package.onFreeBannerTitle')}</Text>
        <Text style={styles.freeChipSub}>{t('package.onFreeBannerBody')}</Text>
      </Pressable>
    );
  }

  const remainingMs = Math.max(0, expiryMs - nowMs);
  const isExpired = remainingMs <= 0;
  const isWarning = !isExpired && remainingMs < ONE_DAY_MS;

  if (isExpired) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(routeForPaymentPlan(role))}
        style={({ pressed }) => [styles.freeChip, styles.expiredChip, pressed && styles.pressed]}>
        <Text style={styles.freeChipTitle}>{t('package.expiredSoftTitle')}</Text>
        <Text style={styles.freeChipSub}>{t('package.expiredSoftBody')}</Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.countdownCard, isWarning && styles.warningCard]}>
      <Text style={[styles.countdownLabel, isWarning && styles.warningText]}>
        {t('package.timeRemaining', { time: formatDuration(remainingMs) })}
      </Text>
      {isWarning ? (
        <Pressable accessibilityRole="button" onPress={() => router.push(routeForPaymentPlan(role))}>
          <Text style={styles.warningText}>{t('package.renewWithin24h')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  countdownCard: {
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    backgroundColor: '#E3F2FD',
    padding: 12,
    gap: 4,
  },
  warningCard: {
    borderColor: '#FDBA74',
    backgroundColor: '#FFF7ED',
  },
  countdownLabel: {
    color: '#1E3A8A',
    fontWeight: '700',
    textAlign: 'center',
  },
  warningText: {
    color: '#9A3412',
    textAlign: 'center',
    fontWeight: '700',
  },
  freeChip: {
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    backgroundColor: '#F7FAFF',
    padding: 12,
    gap: 4,
  },
  expiredChip: {
    borderColor: '#93C5FD',
    backgroundColor: '#EEF4FF',
  },
  freeChipTitle: {
    color: '#041830',
    fontWeight: '800',
    textAlign: 'center',
    fontSize: 14,
  },
  freeChipSub: {
    color: '#64748B',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 18,
  },
  pressed: { opacity: 0.88 },
});
