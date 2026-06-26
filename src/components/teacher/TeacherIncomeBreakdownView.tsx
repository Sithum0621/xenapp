import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppScrollView } from '@/src/components/layout/AppScrollView';

import type { TeacherDashboardClassRow } from '@/src/services/teacherDashboardApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';

const BRAND_BLUE_DARK = '#0E2F63';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const GREEN_OK = '#15803D';
const AMBER = '#D97706';
const VIOLET = '#6D28D9';

function formatMoney(cents: number, language: string): string {
  const locale = language === 'si' ? 'si-LK' : language === 'ta' ? 'ta-LK' : 'en-LK';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(cents / 100));
}

export type TeacherIncomeBreakdownViewProps = {
  monthLabel: string;
  classes: TeacherDashboardClassRow[];
  totalCollectedCents: number;
  totalDuePaymentCents: number;
  totalAmountToPayCents: number;
};

function TeacherIncomeBreakdownView({
  monthLabel,
  classes,
  totalCollectedCents,
  totalDuePaymentCents,
  totalAmountToPayCents,
}: TeacherIncomeBreakdownViewProps) {
  const { t, i18n } = useTranslation();
  const ov = (k: string, o?: Record<string, unknown>) => t(`teacherDashboard.overview.${k}`, o);
  const money = (cents: number) => `Rs. ${formatMoney(cents, i18n.language)}`;

  const hasStudentPayments = classes.some((c) => c.collectedCents > 0 || c.duePaymentCents > 0);
  const hasPackageAmounts = classes.some((c) => c.amountToPayCents > 0) || totalAmountToPayCents > 0;

  return (
    <AppScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}>
      <Text style={styles.monthCaption}>{ov('incomeBreakdownMonth', { month: monthLabel })}</Text>

      <View style={styles.totalsRow}>
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>{ov('incomeBreakdownTotalReceived')}</Text>
          <Text style={[styles.totalValue, { color: GREEN_OK }]}>{money(totalCollectedCents)}</Text>
        </View>
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>{ov('incomeBreakdownTotalDue')}</Text>
          <Text style={[styles.totalValue, { color: AMBER }]}>{money(totalDuePaymentCents)}</Text>
        </View>
      </View>

      <View style={styles.totalBoxWideWrap}>
        <View style={[styles.totalBox, styles.totalBoxWide]}>
          <Text style={styles.totalLabel}>{ov('incomeBreakdownTotalAmountToPay')}</Text>
          <Text style={[styles.totalValue, { color: VIOLET }]}>{money(totalAmountToPayCents)}</Text>
        </View>
      </View>

      {!hasStudentPayments ? (
        <Text style={styles.emptyHint}>{ov('incomeBreakdownEmpty')}</Text>
      ) : null}
      {!hasPackageAmounts ? (
        <Text style={styles.emptyHint}>{ov('packageAmountToPayHint')}</Text>
      ) : null}

      <View style={styles.list}>
        {classes.map((row) => (
          <View key={`${row.source}:${row.id}`} style={styles.classBlock}>
            <Text style={styles.className} numberOfLines={2}>
              {row.name}
            </Text>
            {row.instituteName ? (
              <Text style={styles.classMeta} numberOfLines={1}>
                {row.instituteName}
              </Text>
            ) : null}
            <View style={styles.classAmounts}>
              <View style={styles.amountCol}>
                <Text style={styles.amountLabel}>{ov('incomeReceived')}</Text>
                <Text style={[styles.amountValue, { color: GREEN_OK }]}>{money(row.collectedCents)}</Text>
              </View>
              <View style={styles.amountCol}>
                <Text style={styles.amountLabel}>{ov('incomeDuePayment')}</Text>
                <Text style={[styles.amountValue, { color: AMBER }]}>{money(row.duePaymentCents)}</Text>
              </View>
            </View>
            <View style={styles.packageAmountRow}>
              <Text style={styles.amountLabel}>{ov('incomeAmountToPay')}</Text>
              <Text style={[styles.amountValue, { color: VIOLET }]}>{money(row.amountToPayCents)}</Text>
            </View>
          </View>
        ))}
      </View>
    </AppScrollView>
  );
}

export default memo(TeacherIncomeBreakdownView);

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 28,
    gap: 10,
  },
  monthCaption: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_MUTED,
    marginBottom: 4,
  },
  totalsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  totalBoxWideWrap: {
    marginBottom: 6,
  },
  totalBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    gap: 4,
    minWidth: 0,
  },
  totalBoxWide: {
    flex: undefined,
    width: '100%',
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: FontFamily.bold,
  },
  emptyHint: {
    fontSize: 13,
    color: TEXT_MUTED,
    fontWeight: '600',
    lineHeight: 18,
  },
  list: { gap: 10, marginTop: 4 },
  classBlock: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
    gap: 6,
    backgroundColor: '#FFFFFF',
  },
  className: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    lineHeight: 20,
  },
  classMeta: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontWeight: '600',
  },
  classAmounts: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  packageAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 2,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  amountCol: { flex: 1, minWidth: 0, gap: 2 },
  amountLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_MUTED,
  },
  amountValue: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: FontFamily.bold,
  },
});
