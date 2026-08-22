import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import DashboardScreenShell from '@/src/components/layout/DashboardScreenShell';
import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import { SMS_NOTIFICATIONS_ENABLED } from '@/src/constants/smsNotifications';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import {
  invalidateSessionCache,
  SessionCacheKeys,
} from '@/src/services/sessionDataCache';
import {
  addTeacherSmsCredits,
  createTeacherSmsAccount,
  loadTeacherSmsAccount,
  parseSmsCreditPurchaseInput,
  setTeacherSmsChannels,
  SMS_CREDIT_LOW_THRESHOLD,
  SMS_CREDIT_PRICE_CENTS,
  type TeacherSmsAccount,
} from '@/src/services/teacherSmsAccountStorage';
import {
  fetchTeacherWalletOverview,
  teacherWalletSpendSmsCredits,
} from '@/src/services/teacherWalletApi';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { FontFamily } from '@/src/theme/fonts';
import { PAGE_CONTENT_BOTTOM, PAGE_EDGE_INSET } from '@/src/theme/pageLayout';
import { appAlert } from '@/src/utils/appAlert';
import { formatLkrFromCents } from '@/src/utils/classesPlaceholderBilling';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const TEXT_MUTED = '#64748B';
const BORDER = '#E2E8F0';
const SURFACE = '#FFFFFF';
const VIOLET = '#6D28D9';

export default function TeacherSmsCreditScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const ov = (k: string, opts?: Record<string, unknown>) =>
    t(`teacherDashboard.overview.${k}`, opts);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [account, setAccount] = useState<TeacherSmsAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [smsNameDraft, setSmsNameDraft] = useState('');
  const [buyAmount, setBuyAmount] = useState('');
  const [buying, setBuying] = useState(false);
  const [channelBusy, setChannelBusy] = useState<'attendance' | 'payments' | null>(null);

  const buyCredits = useMemo(() => parseSmsCreditPurchaseInput(buyAmount), [buyAmount]);
  const buyCostCents = buyCredits ? buyCredits * SMS_CREDIT_PRICE_CENTS : 0;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await loadTeacherSmsAccount();
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      setAccount(null);
      return;
    }
    setAccount(result.account);
    invalidateSessionCache([SessionCacheKeys.TEACHER_DASHBOARD_OVERVIEW]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCreate = async () => {
    setSaving(true);
    setError(null);
    const result = await createTeacherSmsAccount(smsNameDraft);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAccount(result.account);
    setCreating(false);
    setSmsNameDraft('');
    invalidateSessionCache([SessionCacheKeys.TEACHER_DASHBOARD_OVERVIEW]);
  };

  const goToWalletTransfer = (amountRupees: number) => {
    const amount = Number.isFinite(amountRupees) && amountRupees > 0 ? String(amountRupees) : '';
    const query = amount
      ? `?addMoney=1&tab=manual&amount=${encodeURIComponent(amount)}`
      : '?addMoney=1&tab=manual';
    router.push(appHref(`${AppRoutes.teacherWallet}${query}`));
  };

  const onBuyCredits = async () => {
    if (!buyCredits) {
      appAlert(ov('smsCreditTitle'), ov('smsCreditBuyInvalid'));
      return;
    }
    setBuying(true);
    try {
      const wallet = await fetchTeacherWalletOverview(0);
      if (!wallet.ok) {
        appAlert(ov('smsCreditTitle'), wallet.error || ov('smsCreditBuyFail'));
        return;
      }
      const shortfallCents = buyCostCents - wallet.overview.balanceCents;
      if (shortfallCents > 0) {
        appAlert(ov('smsCreditTitle'), ov('smsCreditWalletNeeded'));
        goToWalletTransfer(Math.ceil(shortfallCents / 100));
        return;
      }
      const spent = await teacherWalletSpendSmsCredits(buyCredits);
      if (!spent.ok) {
        if (spent.error === 'insufficient_balance') {
          appAlert(ov('smsCreditTitle'), ov('smsCreditWalletNeeded'));
          goToWalletTransfer(Math.ceil(buyCostCents / 100));
          return;
        }
        appAlert(ov('smsCreditTitle'), spent.error || ov('smsCreditBuyFail'));
        return;
      }
      const added = await addTeacherSmsCredits(buyCredits);
      if (!added.ok) {
        appAlert(ov('smsCreditTitle'), added.error || ov('smsCreditBuyFail'));
        return;
      }
      setAccount(added.account);
      setBuyAmount('');
      invalidateSessionCache([
        SessionCacheKeys.TEACHER_DASHBOARD_OVERVIEW,
        SessionCacheKeys.TEACHER_WALLET,
      ]);
      appAlert(ov('smsCreditTitle'), ov('smsCreditBuySuccess'));
    } finally {
      setBuying(false);
    }
  };

  const onToggleChannel = async (channel: 'attendance' | 'payments', enabled: boolean) => {
    if (!account) return;
    if (!SMS_NOTIFICATIONS_ENABLED) {
      appAlert(ov('smsCreditTitle'), ov('smsNotificationsDisabledBody'));
      return;
    }
    setChannelBusy(channel);
    const next = {
      attendanceSmsEnabled:
        channel === 'attendance' ? enabled : account.attendanceSmsEnabled,
      paymentsSmsEnabled: channel === 'payments' ? enabled : account.paymentsSmsEnabled,
    };
    const result = await setTeacherSmsChannels(next);
    setChannelBusy(null);
    if (!result.ok) {
      appAlert(ov('smsCreditTitle'), result.error);
      return;
    }
    setAccount(result.account);
  };

  return (
    <DashboardScreenShell
      showBack
      title={t('teacherDashboard.overview.smsCreditTitle')}
      padContent={false}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        keyboardExtraPadding={32}
        showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={BRAND_BLUE} />
          </View>
        ) : null}

        {!loading && error && !creating ? (
          <View style={styles.messageCard}>
            <Ionicons name="alert-circle-outline" size={28} color={BRAND_BLUE} />
            <Text style={styles.messageTitle}>
              {t('teacherDashboard.overview.smsCreditLoadError')}
            </Text>
            <Text style={styles.messageBody}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void refresh()}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
              <Text style={styles.primaryBtnText}>
                {t('teacherDashboard.overview.retry')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !account && !creating ? (
          <View style={styles.messageCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="chatbubble-ellipses-outline" size={34} color={VIOLET} />
            </View>
            <Text style={styles.messageTitle}>
              {t('teacherDashboard.overview.smsCreditNoAccountTitle')}
            </Text>
            <Text style={styles.messageBody}>
              {t('teacherDashboard.overview.smsCreditNoAccountBody')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('teacherDashboard.overview.smsCreditCreateButton')}
              onPress={() => {
                setError(null);
                setCreating(true);
              }}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
              <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>
                {t('teacherDashboard.overview.smsCreditCreateButton')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && creating ? (
          <View style={styles.messageCard}>
            <Text style={styles.messageTitle}>
              {t('teacherDashboard.overview.smsCreditCreateTitle')}
            </Text>
            <Text style={styles.messageBody}>
              {t('teacherDashboard.overview.smsCreditCreateBody')}
            </Text>
            <TextInput
              value={smsNameDraft}
              onChangeText={setSmsNameDraft}
              placeholder={t('teacherDashboard.overview.smsCreditNamePlaceholder')}
              placeholderTextColor={TEXT_MUTED}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={40}
              style={styles.input}
              accessibilityLabel={t('teacherDashboard.overview.smsCreditNamePlaceholder')}
            />
            {error ? <Text style={styles.inlineError}>{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={saving || !smsNameDraft.trim()}
              onPress={() => void onCreate()}
              style={({ pressed }) => [
                styles.primaryBtn,
                (saving || !smsNameDraft.trim()) && styles.primaryBtnDisabled,
                pressed && !saving && smsNameDraft.trim() ? styles.pressed : null,
              ]}>
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {t('teacherDashboard.overview.smsCreditCreateSubmit')}
                </Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => {
                setCreating(false);
                setError(null);
                setSmsNameDraft('');
              }}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}>
              <Text style={styles.secondaryBtnText}>
                {t('teacherDashboard.overview.smsCreditCreateCancel')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && account && !creating ? (
          <View style={styles.accountCard}>
            <View style={styles.accountHeader}>
              <View style={styles.emptyIconSmall}>
                <Ionicons name="chatbubble-ellipses-outline" size={22} color={VIOLET} />
              </View>
              <View style={styles.accountTextCol}>
                <Text style={styles.accountLabel}>
                  {t('teacherDashboard.overview.smsCreditAccountName')}
                </Text>
                <Text style={styles.accountName}>{account.smsName}</Text>
              </View>
            </View>
            <View style={styles.creditRow}>
              <Text style={styles.creditLabel}>
                {ov('smsCredit')}
              </Text>
              <Text style={styles.creditValue}>
                {account.creditBalance.toLocaleString('en-LK')}
              </Text>
            </View>
            <View style={styles.rateBlock}>
              <Text style={styles.rateText}>{ov('smsCreditRateSms')}</Text>
              <Text style={styles.rateText}>{ov('smsCreditRatePrice')}</Text>
            </View>
            {account.creditBalance <= 0 ? (
              <View style={styles.stopBanner}>
                <Ionicons name="close-circle-outline" size={18} color="#991B1B" />
                <Text style={styles.stopBannerText}>{ov('smsCreditEmptyStop')}</Text>
              </View>
            ) : account.creditBalance <= SMS_CREDIT_LOW_THRESHOLD ? (
              <View style={styles.warnBanner}>
                <Ionicons name="warning-outline" size={18} color="#B45309" />
                <Text style={styles.warnBannerText}>
                  {ov('smsCreditLowWarning', { count: account.creditBalance })}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {!loading && account && !creating ? (
          <View style={styles.buyCard}>
            <Text style={styles.buyTitle}>{ov('smsCreditBuyMore')}</Text>
            <Text style={styles.fieldLabel}>{ov('smsCreditBuyAmountLabel')}</Text>
            <TextInput
              value={buyAmount}
              onChangeText={setBuyAmount}
              placeholder={ov('smsCreditBuyAmountPlaceholder')}
              placeholderTextColor={TEXT_MUTED}
              keyboardType="number-pad"
              style={styles.input}
              accessibilityLabel={ov('smsCreditBuyAmountLabel')}
            />
            {buyCredits ? (
              <Text style={styles.buyCost}>
                {ov('smsCreditBuyCost', { amount: formatLkrFromCents(buyCostCents) })}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ov('smsCreditBuyMoreA11y')}
              disabled={buying || !buyCredits}
              onPress={() => void onBuyCredits()}
              style={({ pressed }) => [
                styles.primaryBtn,
                (buying || !buyCredits) && styles.primaryBtnDisabled,
                pressed && buyCredits && !buying ? styles.pressed : null,
              ]}>
              {buying ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="wallet-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>{ov('smsCreditBuyConfirm')}</Text>
                </>
              )}
            </Pressable>
          </View>
        ) : null}

        {!loading && account && !creating ? (
          <View style={styles.buyCard}>
            <Text style={styles.buyTitle}>{ov('smsManageTitle')}</Text>
            {!SMS_NOTIFICATIONS_ENABLED ? (
              <Text style={styles.rateText}>{ov('smsNotificationsDisabledBody')}</Text>
            ) : (
              <Text style={styles.rateText}>{ov('smsManageHint')}</Text>
            )}
            <View style={styles.toggleRow}>
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleTitle}>{ov('smsManageAttendance')}</Text>
                <Text style={styles.toggleHint}>{ov('smsManageAttendanceHint')}</Text>
              </View>
              {channelBusy === 'attendance' ? (
                <ActivityIndicator color={BRAND_BLUE} />
              ) : (
                <Switch
                  value={SMS_NOTIFICATIONS_ENABLED ? account.attendanceSmsEnabled : false}
                  disabled={!SMS_NOTIFICATIONS_ENABLED || channelBusy != null}
                  onValueChange={(v) => void onToggleChannel('attendance', v)}
                  trackColor={{ false: '#CBD5E1', true: '#C4B5FD' }}
                  thumbColor={
                    SMS_NOTIFICATIONS_ENABLED && account.attendanceSmsEnabled ? VIOLET : '#F4F4F5'
                  }
                  accessibilityLabel={ov('smsManageAttendance')}
                />
              )}
            </View>
            <View style={styles.toggleRow}>
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleTitle}>{ov('smsManagePayments')}</Text>
                <Text style={styles.toggleHint}>{ov('smsManagePaymentsHint')}</Text>
              </View>
              {channelBusy === 'payments' ? (
                <ActivityIndicator color={BRAND_BLUE} />
              ) : (
                <Switch
                  value={SMS_NOTIFICATIONS_ENABLED ? account.paymentsSmsEnabled : false}
                  disabled={!SMS_NOTIFICATIONS_ENABLED || channelBusy != null}
                  onValueChange={(v) => void onToggleChannel('payments', v)}
                  trackColor={{ false: '#CBD5E1', true: '#C4B5FD' }}
                  thumbColor={
                    SMS_NOTIFICATIONS_ENABLED && account.paymentsSmsEnabled ? VIOLET : '#F4F4F5'
                  }
                  accessibilityLabel={ov('smsManagePayments')}
                />
              )}
            </View>
          </View>
        ) : null}
      </KeyboardAwareScrollView>
    </DashboardScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: 12,
    paddingBottom: PAGE_CONTENT_BOTTOM,
    gap: 16,
  },
  centered: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  messageCard: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 12,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconSmall: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageTitle: {
    fontSize: 17,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    textAlign: 'center',
  },
  messageBody: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
    textAlign: 'center',
  },
  primaryBtn: {
    marginTop: 6,
    minHeight: 48,
    alignSelf: 'stretch',
    borderRadius: 14,
    backgroundColor: BRAND_BLUE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: FontFamily.bold,
  },
  secondaryBtn: {
    minHeight: 44,
    alignSelf: 'stretch',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: TEXT_MUTED,
    fontSize: 14,
    fontFamily: FontFamily.bold,
  },
  pressed: { opacity: 0.88 },
  input: {
    alignSelf: 'stretch',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: BRAND_BLUE_DARK,
    backgroundColor: '#F8FAFC',
    minHeight: 48,
  },
  inlineError: {
    alignSelf: 'stretch',
    fontSize: 13,
    color: '#B91C1C',
    fontFamily: FontFamily.regular,
  },
  accountCard: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    padding: 18,
    gap: 18,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accountTextCol: { flex: 1, minWidth: 0, gap: 2 },
  accountLabel: {
    fontSize: 12,
    fontFamily: FontFamily.bold,
    color: TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  accountName: {
    fontSize: 18,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
  },
  creditRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  creditLabel: {
    fontSize: 14,
    fontFamily: FontFamily.bold,
    color: TEXT_MUTED,
  },
  creditValue: {
    fontSize: 28,
    fontFamily: FontFamily.bold,
    color: VIOLET,
    lineHeight: 34,
  },
  rateBlock: { gap: 4 },
  rateText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
  },
  buyCard: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    padding: 18,
    gap: 10,
  },
  buyTitle: {
    fontSize: 17,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
  },
  buyCost: {
    fontSize: 14,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE,
  },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
  },
  warnBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FontFamily.regular,
    color: '#92400E',
  },
  stopBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
  },
  stopBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FontFamily.regular,
    color: '#991B1B',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  toggleCopy: { flex: 1, minWidth: 0, gap: 2 },
  toggleTitle: {
    fontSize: 15,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
  },
  toggleHint: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
  },
});
