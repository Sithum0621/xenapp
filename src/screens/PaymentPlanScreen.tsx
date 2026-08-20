import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ScrollView } from '@/src/components/layout/scroll';

import DashboardScreenShell from '@/src/components/layout/DashboardScreenShell';
import { useSubscriptionStatus } from '@/src/components/subscription/useSubscriptionStatus';
import { APP_SUPPORT_EMAIL } from '@/src/constants/brand';
import { AppRoutes, appHref, dashboardRouteForProfileRole, type ProfileRole } from '@/src/navigation/AppNavigator';
import { subscriptionChecksBypassForRole } from '@/src/services/subscription';
import { supabase } from '@/src/services/supabaseClient';
import { appBrandBlue, appBrandMy, appBrandRoyal } from '@/src/theme/appBrandPalette';
import { PAGE_CONTENT_BOTTOM, PAGE_EDGE_INSET } from '@/src/theme/pageLayout';

const BRAND_BLUE = appBrandBlue;
const BRAND_BLUE_DARK = '#00101F';
const TEXT_MUTED = '#64748B';

function formatExpiry(iso: string | null, t: (k: string, o?: Record<string, string>) => string) {
  if (!iso || iso === 'infinity') return t('package.noExpiry');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t('package.noExpiry');
  return t('package.expiresOn', { date: d.toLocaleDateString() });
}

/**
 * Package update page — Free (default) vs Paid compare + soft upgrade CTA.
 */
export default function PaymentPlanScreen() {
  const { t } = useTranslation();
  const { role } = useLocalSearchParams<{ role?: string }>();
  const subscription = useSubscriptionStatus();

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
        router.replace(appHref(dashboardRouteForProfileRole(profile!.role as ProfileRole)));
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const pricingKey =
    role === 'teacher' ? 'signup.pricing.teacher' : 'signup.pricing.parentStudent';

  const currentTierLabel = useMemo(() => {
    if (subscription.bypass) return t('package.tierUnlimited');
    if (subscription.tier === 'paid') return t('package.tierPaid');
    if (subscription.tier === 'trial') return t('package.tierTrial');
    return t('package.tierFree');
  }, [subscription.bypass, subscription.tier, t]);

  const goDashboard = () => {
    const r = (role === 'teacher' || role === 'admin' || role === 'parent_student'
      ? role
      : 'parent_student') as ProfileRole;
    router.replace(appHref(dashboardRouteForProfileRole(r)));
  };

  if (subscription.loading) {
    return (
      <DashboardScreenShell edges={['top', 'left', 'right', 'bottom']} padContent={false}>
        <View style={styles.loader}>
          <ActivityIndicator color={BRAND_BLUE} size="large" />
        </View>
      </DashboardScreenShell>
    );
  }

  return (
    <DashboardScreenShell
      showBack
      title={t('package.title')}
      subtitle={t('package.subtitle')}
      edges={['top', 'left', 'right', 'bottom']}
      onBack={goDashboard}
      padContent={false}>
      <ScrollView contentContainerStyle={styles.content}>

        <View style={styles.currentCard}>
          <Text style={styles.currentLabel}>{t('package.currentPlan')}</Text>
          <Text style={styles.currentValue}>{currentTierLabel}</Text>
          {!subscription.isFree && !subscription.bypass ? (
            <Text style={styles.currentMeta}>
              {formatExpiry(subscription.expiryDateIso, t)}
            </Text>
          ) : (
            <Text style={styles.currentMeta}>{t('package.freeDefaultHint')}</Text>
          )}
        </View>

        <View style={[styles.planCard, subscription.isFree && styles.planCardActive]}>
          <View style={styles.planHeaderRow}>
            <Text style={styles.planName}>{t('package.tierFree')}</Text>
            {subscription.isFree ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{t('package.currentBadge')}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.planPrice}>{t('package.freePrice')}</Text>
          <Text style={styles.planBullet}>{t('package.freeFeature1')}</Text>
          <Text style={styles.planBullet}>{t('package.freeFeature2')}</Text>
          <Text style={styles.planBullet}>{t('package.freeFeature3')}</Text>
        </View>

        <View
          style={[
            styles.planCard,
            styles.planCardPaid,
            (subscription.tier === 'paid' || subscription.tier === 'trial') && styles.planCardActive,
          ]}>
          <View style={styles.planHeaderRow}>
            <Text style={[styles.planName, styles.planNamePaid]}>{t('package.tierPaid')}</Text>
            {subscription.tier === 'paid' || subscription.tier === 'trial' ? (
              <View style={[styles.badge, styles.badgePaid]}>
                <Text style={styles.badgeTextPaid}>{t('package.currentBadge')}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.planPrice}>{t(pricingKey)}</Text>
          <Text style={styles.planBullet}>{t('package.paidFeature1')}</Text>
          <Text style={styles.planBullet}>{t('package.paidFeature2')}</Text>
          <Text style={styles.planBullet}>{t('package.paidFeature3')}</Text>
        </View>

        <View style={styles.upgradeNote}>
          <Ionicons name="information-circle-outline" size={20} color={appBrandRoyal} />
          <Text style={styles.upgradeNoteText}>
            {t('package.upgradeInstructions', { email: APP_SUPPORT_EMAIL })}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={goDashboard}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>{t('package.backToDashboard')}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace(AppRoutes.login)}
          style={({ pressed }) => [styles.linkBtn, pressed && styles.buttonPressed]}>
          <Text style={styles.linkBtnText}>{t('payment.backToLogin')}</Text>
        </Pressable>
      </ScrollView>
    </DashboardScreenShell>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    flexGrow: 1,
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: 12,
    gap: 14,
    paddingBottom: PAGE_CONTENT_BOTTOM,
  },
  currentCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    backgroundColor: '#EEF4FF',
    padding: 16,
    gap: 4,
  },
  currentLabel: { color: TEXT_MUTED, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  currentValue: { color: BRAND_BLUE_DARK, fontSize: 22, fontWeight: '800' },
  currentMeta: { color: TEXT_MUTED, fontSize: 13, fontWeight: '600', marginTop: 2 },
  planCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#D6E2F0',
    backgroundColor: '#FFFFFF',
    padding: 16,
    gap: 6,
  },
  planCardPaid: {
    borderColor: '#93C5FD',
  },
  planCardActive: {
    borderColor: appBrandMy,
    borderWidth: 2,
  },
  planHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  planName: { color: BRAND_BLUE_DARK, fontSize: 18, fontWeight: '800' },
  planNamePaid: { color: appBrandRoyal },
  planPrice: { color: TEXT_MUTED, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  planBullet: { color: '#334155', fontSize: 14, fontWeight: '600', lineHeight: 20 },
  badge: {
    backgroundColor: '#DBEAFE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgePaid: { backgroundColor: '#E0E7FF' },
  badgeText: { color: appBrandRoyal, fontSize: 11, fontWeight: '800' },
  badgeTextPaid: { color: '#3730A3', fontSize: 11, fontWeight: '800' },
  upgradeNote: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    borderRadius: 14,
    backgroundColor: '#F7FAFF',
    borderWidth: 1,
    borderColor: '#D6E2F0',
    padding: 14,
  },
  upgradeNoteText: {
    flex: 1,
    color: '#465668',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  button: {
    backgroundColor: BRAND_BLUE,
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  linkBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkBtnText: { color: appBrandRoyal, fontSize: 15, fontWeight: '700' },
});
