import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text } from '@/src/theme/Text';
import { Pressable, StyleSheet, View } from 'react-native';

import { routeForPaymentPlan, subscriptionCountdownVisibleForRole } from '@/src/services/subscription';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type Props = {
  role: string;
  expiryDateIso: string | null;
  isActive: boolean;
};

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / (24 * 3600));
  const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

export default function SubscriptionCountdownGate({ role, expiryDateIso, isActive }: Props) {
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

  const remainingMs = Math.max(0, expiryMs - nowMs);
  const isExpired = !isActive || remainingMs <= 0;
  const isWarning = !isExpired && remainingMs < ONE_DAY_MS;

  if (isExpired) {
    return (
      <View style={styles.overlay}>
        <View style={styles.overlayCard}>
          <Text style={styles.overlayTitle}>Package Expired</Text>
          <Text style={styles.overlayText}>
            Your subscription has expired. Please renew your package to continue.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace(routeForPaymentPlan(role))}
            style={({ pressed }) => [styles.renewBtn, pressed && styles.renewBtnPressed]}>
            <Text style={styles.renewBtnText}>Renew Package</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.countdownCard, isWarning && styles.warningCard]}>
      <Text style={[styles.countdownLabel, isWarning && styles.warningText]}>
        Time Remaining: {formatDuration(remainingMs)}
      </Text>
      {isWarning ? <Text style={styles.warningText}>Renew Package within 24 hours.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  countdownCard: {
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,6,23,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 100,
    pointerEvents: 'auto',
  },
  overlayCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
    gap: 10,
  },
  overlayTitle: {
    color: '#991B1B',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  overlayText: {
    color: '#334155',
    textAlign: 'center',
    lineHeight: 21,
    fontWeight: '600',
  },
  renewBtn: {
    marginTop: 8,
    backgroundColor: '#123B7A',
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  renewBtnPressed: {
    opacity: 0.85,
  },
  renewBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
});
