import { router } from 'expo-router';
import { Text } from '@/src/theme/Text';
import { Pressable, StyleSheet, View } from 'react-native';

import { routeForPaymentPlan } from '@/src/services/subscription';

/**
 * Full-screen overlay shown when the user's subscription has expired.
 * Extracted from `SubscriptionCountdownGate` so it can be rendered standalone
 * by screens that drive their own countdown UI (e.g. the parent dashboard).
 */
export default function SubscriptionExpiredOverlay({ role }: { role: string }) {
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

const styles = StyleSheet.create({
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
  renewBtnPressed: { opacity: 0.85 },
  renewBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
});
