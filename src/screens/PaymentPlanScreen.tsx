import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Text } from '@/src/theme/Text';
import { Pressable, StyleSheet, View } from 'react-native';

import { ScrollView } from '@/src/components/layout/scroll';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { AppRoutes } from '@/src/navigation/AppNavigator';
import { subscriptionChecksBypassForRole } from '@/src/services/subscription';
import { supabase } from '@/src/services/supabaseClient';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const PAGE_BG = '#FFFFFF';
const TEXT_MUTED = '#64748B';

export default function PaymentPlanScreen() {
  const { t } = useTranslation();
  const { role } = useLocalSearchParams<{ role?: string }>();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (cancelled) return;

      if (subscriptionChecksBypassForRole(profile?.role)) {
        router.replace(AppRoutes.superAdminDashboard);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const pricingKey =
    role === 'teacher' ? 'signup.pricing.teacher' : 'signup.pricing.parentStudent';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>{t('payment.title')}</Text>
        <View style={styles.noteCard}>
          <Text style={styles.noteText}>{t('payment.trialUsed')}</Text>
          <Text style={styles.priceText}>{t(pricingKey)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace(AppRoutes.login)}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>{t('payment.backToLogin')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAGE_BG },
  content: { flexGrow: 1, padding: 24, justifyContent: 'center', gap: 18 },
  heading: { color: BRAND_BLUE_DARK, fontSize: 26, fontWeight: '700', textAlign: 'center' },
  noteCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    padding: 18,
    gap: 10,
  },
  noteText: { color: BRAND_BLUE_DARK, fontSize: 15, fontWeight: '700', textAlign: 'center', lineHeight: 22 },
  priceText: { color: TEXT_MUTED, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  button: {
    backgroundColor: BRAND_BLUE,
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
