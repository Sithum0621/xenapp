import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import DashboardPremiumTile from '@/src/components/parent/dashboard/DashboardPremiumTile';
import { fetchStudentClassesBillingOverview } from '@/src/services/studentWalletApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import {
  parentInkSoft,
  parentPurpleBrand,
} from '@/src/theme/parentDashboardPalette';
import { formatLkrWalletFromCents } from '@/src/utils/classesPlaceholderBilling';

export type WalletBalanceTileProps = {
  studentUserId: string | null;
};

function WalletBalanceTile({ studentUserId }: WalletBalanceTileProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [balanceLabel, setBalanceLabel] = useState<string>('—');

  const load = useCallback(async () => {
    if (!studentUserId) {
      setBalanceLabel('—');
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await fetchStudentClassesBillingOverview(studentUserId);
    if (res.ok) {
      setBalanceLabel(formatLkrWalletFromCents(res.overview.walletBalanceCents));
    } else {
      setBalanceLabel(formatLkrWalletFromCents(0));
    }
    setLoading(false);
  }, [studentUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardPremiumTile
      accent="wallet"
      title={t('parentDashboard.walletTitle')}
      subtitle={t('parentDashboard.walletSubtitle')}
      interactive>
      <View style={styles.body}>
        {loading ? (
          <ActivityIndicator size="small" color={parentPurpleBrand} />
        ) : (
          <>
            <Text style={styles.balanceLabel}>{t('parentDashboard.walletBalanceLabel')}</Text>
            <Text style={styles.balance} numberOfLines={2} adjustsFontSizeToFit>
              {balanceLabel}
            </Text>
          </>
        )}
      </View>
    </DashboardPremiumTile>
  );
}

export default memo(WalletBalanceTile);

const styles = StyleSheet.create({
  body: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  balanceLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  balance: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: FontFamily.black,
    color: parentPurpleBrand,
    letterSpacing: -0.5,
    textAlign: 'center',
    maxWidth: '100%',
  },
});
