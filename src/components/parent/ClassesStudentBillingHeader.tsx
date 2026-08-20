import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';
import { Text } from '@/src/theme/Text';

import { fetchStudentClassesBillingOverview } from '@/src/services/studentWalletApi';
import { formatLkrFromCents } from '@/src/utils/classesPlaceholderBilling';
import { FontFamily } from '@/src/theme/fonts';

const BRAND_BLUE_DARK = '#00101F';
const BRAND_BLUE = '#041830';
const BRAND_BLUE_SOFT = 'rgba(18, 59, 122, 0.08)';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const SURFACE = '#FFFFFF';
const ERROR = '#B42318';

export type ClassesStudentBillingHeaderProps = {
  studentUserId: string;
  /** Bump to reload wallet / monthly due (e.g. tab focus or pull-to-refresh). */
  refreshNonce?: number;
  onTransferPress?: () => void;
};

export default function ClassesStudentBillingHeader({
  studentUserId,
  refreshNonce = 0,
  onTransferPress,
}: ClassesStudentBillingHeaderProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [walletCents, setWalletCents] = useState(0);
  const [monthlyCents, setMonthlyCents] = useState(0);

  const load = useCallback(async () => {
    const studentId = studentUserId.trim();
    if (!studentId) {
      setWalletCents(0);
      setMonthlyCents(0);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const res = await fetchStudentClassesBillingOverview(studentId);
    if (res.ok) {
      setWalletCents(res.overview.walletBalanceCents);
      setMonthlyCents(res.overview.monthlyTotalDueCents);
      setError(null);
    } else {
      setWalletCents(0);
      setMonthlyCents(0);
      setError(res.error);
    }
    setLoading(false);
  }, [studentUserId]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  const handleTransfer = () => {
    if (onTransferPress) {
      onTransferPress();
      return;
    }
    // Transfer flow will call student_wallet_top_up when implemented.
  };

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="small" color={BRAND_BLUE} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color={ERROR} />
          <Text style={styles.errorText} numberOfLines={2}>
            {error}
          </Text>
          <ScrollFriendlyPressable accessibilityRole="button" onPress={() => void load()}>
            <Text style={styles.errorRetry}>{t('parentDashboard.classesRetry')}</Text>
          </ScrollFriendlyPressable>
        </View>
      ) : null}

      <View style={styles.billingRow}>
        <View style={styles.statCard}>
          <View style={styles.statHeader}>
            <View style={styles.statIconWrap}>
              <Ionicons name="wallet-outline" size={16} color={BRAND_BLUE} />
            </View>
            <Text style={styles.statLabel} numberOfLines={1}>
              {t('parentDashboard.classesWalletLabel')}
            </Text>
          </View>
          <Text style={styles.statAmount} numberOfLines={1} adjustsFontSizeToFit>
            {formatLkrFromCents(walletCents)}
          </Text>
          <ScrollFriendlyPressable
            accessibilityRole="button"
            accessibilityLabel={t('parentDashboard.classesTransferFunds')}
            onPress={handleTransfer}
            style={styles.transferBtn}
            innerStyle={styles.transferBtnInner}>
            <Ionicons name="add" size={14} color={SURFACE} />
            <Text style={styles.transferBtnText}>{t('parentDashboard.classesTransfer')}</Text>
          </ScrollFriendlyPressable>
        </View>

        <View style={styles.statCard}>
          <View style={styles.statHeader}>
            <View style={styles.statIconWrap}>
              <Ionicons name="calendar-outline" size={16} color={BRAND_BLUE} />
            </View>
            <Text style={styles.statLabel} numberOfLines={2}>
              {t('parentDashboard.classesMonthlyDueLabel')}
            </Text>
          </View>
          <Text style={styles.statAmount} numberOfLines={1} adjustsFontSizeToFit>
            {formatLkrFromCents(monthlyCents)}
          </Text>
        </View>
      </View>

      <Text style={styles.monthlyHint} numberOfLines={2}>
        {t('parentDashboard.classesMonthlyDueHint')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6, marginBottom: 10 },
  loaderWrap: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 10,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(180, 35, 24, 0.06)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(180, 35, 24, 0.2)',
  },
  errorText: { flex: 1, fontSize: 11.5, color: ERROR },
  errorRetry: { fontSize: 11.5, fontWeight: '800', color: BRAND_BLUE },
  billingRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 4,
    minHeight: 88,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: BRAND_BLUE_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statLabel: {
    flex: 1,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: FontFamily.bold,
    color: TEXT_MUTED,
  },
  statAmount: {
    fontSize: 17,
    lineHeight: 22,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    letterSpacing: -0.2,
  },
  transferBtn: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    marginTop: 2,
  },
  transferBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BRAND_BLUE,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  transferBtnText: {
    fontSize: 11,
    fontFamily: FontFamily.bold,
    color: SURFACE,
  },
  monthlyHint: {
    fontSize: 10.5,
    lineHeight: 14,
    color: TEXT_MUTED,
    paddingHorizontal: 2,
  },
});
