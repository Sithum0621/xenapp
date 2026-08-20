import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { Pressable, StyleSheet, View } from 'react-native';

import { routeForPaymentPlan } from '@/src/services/subscription';

/**
 * Soft upsell banner when the user is on Free (no full-screen block).
 */
export default function SubscriptionExpiredOverlay({
  role,
  onDismiss,
}: {
  role: string;
  onDismiss?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.bannerWrap} pointerEvents="box-none">
      <View style={styles.banner}>
        <View style={styles.textCol}>
          <Text style={styles.title}>{t('package.onFreeBannerTitle')}</Text>
          <Text style={styles.body}>{t('package.onFreeBannerBody')}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(routeForPaymentPlan(role))}
            style={({ pressed }) => [styles.upgradeBtn, pressed && styles.pressed]}>
            <Text style={styles.upgradeBtnText}>{t('package.upgradeCta')}</Text>
          </Pressable>
          {onDismiss ? (
            <Pressable
              accessibilityRole="button"
              onPress={onDismiss}
              style={({ pressed }) => [styles.dismissBtn, pressed && styles.pressed]}>
              <Text style={styles.dismissBtnText}>{t('package.dismiss')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 12,
    zIndex: 40,
  },
  banner: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 10,
    shadowColor: '#041830',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  textCol: { gap: 4 },
  title: { color: '#041830', fontSize: 15, fontWeight: '800' },
  body: { color: '#64748B', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  upgradeBtn: {
    backgroundColor: '#041830',
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  dismissBtn: {
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#D6E2F0',
  },
  dismissBtnText: { color: '#465668', fontWeight: '700', fontSize: 14 },
  pressed: { opacity: 0.85 },
});
