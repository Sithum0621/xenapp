import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { Text } from '@/src/theme/Text';
import type { ClassFeePreview, CollectionMethod } from '@/src/services/teacherPaymentCollectApi';
import { formatLkrFromCents } from '@/src/utils/classesPlaceholderBilling';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const GREEN = '#15803D';

type Props = {
  visible: boolean;
  preview: ClassFeePreview | null;
  submitting: boolean;
  onClose: () => void;
  onApprove: (method: CollectionMethod, includePlatformFee: boolean) => void;
};

export default function TeacherPaymentSlipModal({
  visible,
  preview,
  submitting,
  onClose,
  onApprove,
}: Props) {
  const { t } = useTranslation();
  const p = (k: string, o?: Record<string, unknown>) => t(`teacherDashboard.paymentsCollect.${k}`, o);

  const [method, setMethod] = useState<CollectionMethod>('cash');
  const [includePlatformFee, setIncludePlatformFee] = useState(false);

  useEffect(() => {
    if (!visible || !preview) return;
    setMethod('cash');
    setIncludePlatformFee(false);
  }, [visible, preview?.studentUserId, preview?.groupId]);

  const platformFeeCents = includePlatformFee ? preview?.platformFeeCents ?? 0 : 0;

  const walletOk = useMemo(() => {
    if (!preview || method !== 'wallet') return true;
    return preview.studentWalletBalanceCents >= preview.classFeeCents;
  }, [preview, method]);

  if (!preview) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Ionicons name="receipt-outline" size={22} color={BRAND_BLUE} />
            <Text style={styles.title}>{p('slipTitle')}</Text>
          </View>

          <Text style={styles.studentName}>{preview.studentName}</Text>
          <Text style={styles.groupName}>{preview.groupName}</Text>
          <Text style={styles.billIntro}>{p('slipIntro')}</Text>

          <View style={styles.lines}>
            <Text style={styles.sectionLabel}>{p('studentPaysSection')}</Text>
            <View style={styles.lineRow}>
              <Text style={styles.lineLabel}>{p('classFeeLine')}</Text>
              <Text style={styles.lineValue}>{formatLkrFromCents(preview.classFeeCents)}</Text>
            </View>

            <View style={[styles.lineRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>{p('collectTotal')}</Text>
              <Text style={styles.totalValue}>{formatLkrFromCents(preview.classFeeCents)}</Text>
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionLabel}>{p('yourAccountSection')}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: includePlatformFee }}
              accessibilityLabel={p('platformFeeToggleA11y')}
              disabled={submitting}
              onPress={() => setIncludePlatformFee((v) => !v)}
              style={({ pressed }) => [
                styles.platformToggle,
                includePlatformFee && styles.platformToggleOn,
                pressed && styles.pressed,
              ]}>
              <View style={styles.platformToggleMain}>
                <Ionicons
                  name={includePlatformFee ? 'checkmark-circle' : 'add-circle-outline'}
                  size={22}
                  color={includePlatformFee ? BRAND_BLUE : TEXT_MUTED}
                />
                <View style={styles.platformToggleText}>
                  <Text style={styles.platformToggleTitle}>{p('platformFeeAddButton')}</Text>
                  <Text style={styles.platformToggleHint}>
                    {includePlatformFee ? p('platformFeeIncluded') : p('platformFeeExcluded')}
                  </Text>
                </View>
              </View>
              <Text style={[styles.platformToggleAmount, includePlatformFee && styles.lineValue]}>
                {formatLkrFromCents(preview.platformFeeCents)}
              </Text>
            </Pressable>

            <View style={styles.summaryBox}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{p('summaryIncome')}</Text>
                <Text style={[styles.summaryValue, styles.summaryIncome]}>
                  +{formatLkrFromCents(preview.classFeeCents)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{p('summaryAmountToPay')}</Text>
                <Text
                  style={[
                    styles.summaryValue,
                    platformFeeCents > 0 ? styles.summaryPay : styles.summaryPayZero,
                  ]}>
                  +{formatLkrFromCents(platformFeeCents)}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.methodTitle}>{p('methodTitle')}</Text>
          <View style={styles.methodRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setMethod('cash')}
              disabled={submitting}
              style={[styles.methodBtn, method === 'cash' && styles.methodBtnActive]}>
              <Ionicons
                name="cash-outline"
                size={18}
                color={method === 'cash' ? BRAND_BLUE_DARK : TEXT_MUTED}
              />
              <Text style={[styles.methodText, method === 'cash' && styles.methodTextActive]}>
                {p('methodCash')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setMethod('wallet')}
              disabled={submitting}
              style={[styles.methodBtn, method === 'wallet' && styles.methodBtnActive]}>
              <Ionicons
                name="wallet-outline"
                size={18}
                color={method === 'wallet' ? BRAND_BLUE_DARK : TEXT_MUTED}
              />
              <Text style={[styles.methodText, method === 'wallet' && styles.methodTextActive]}>
                {p('methodWallet')}
              </Text>
            </Pressable>
          </View>

          {method === 'wallet' ? (
            <Text style={[styles.walletBal, !walletOk && styles.walletBalError]}>
              {p('studentWalletBalance', {
                amount: formatLkrFromCents(preview.studentWalletBalanceCents),
              })}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              disabled={submitting}
              style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}>
              <Text style={styles.cancelText}>{p('cancel')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => onApprove(method, includePlatformFee)}
              disabled={submitting || !walletOk}
              style={({ pressed }) => [
                styles.approveBtn,
                pressed && styles.pressed,
                (submitting || !walletOk) && styles.approveDisabled,
              ]}>
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.approveText}>{p('approve')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 28 : 20,
    gap: 8,
    maxHeight: '92%',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '800', color: BRAND_BLUE_DARK },
  studentName: { fontSize: 17, fontWeight: '800', color: BRAND_BLUE_DARK },
  groupName: { fontSize: 14, color: TEXT_MUTED },
  billIntro: { fontSize: 13, color: TEXT_MUTED, lineHeight: 18, marginBottom: 8 },
  lines: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
    gap: 8,
    backgroundColor: '#F8FAFC',
  },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  lineLabel: { fontSize: 14, fontWeight: '600', color: BRAND_BLUE_DARK, flex: 1 },
  lineValue: { fontSize: 15, fontWeight: '800', color: GREEN },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginVertical: 4,
  },
  platformToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#FFFFFF',
  },
  platformToggleOn: {
    borderColor: BRAND_BLUE,
    backgroundColor: 'rgba(18, 59, 122, 0.06)',
  },
  platformToggleMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  platformToggleText: { flex: 1, gap: 2 },
  platformToggleTitle: { fontSize: 14, fontWeight: '700', color: BRAND_BLUE_DARK },
  platformToggleHint: { fontSize: 12, color: TEXT_MUTED },
  platformToggleAmount: { fontSize: 15, fontWeight: '700', color: TEXT_MUTED },
  summaryBox: {
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
    gap: 6,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 13, color: TEXT_MUTED, fontWeight: '600' },
  summaryValue: { fontSize: 14, fontWeight: '800' },
  summaryIncome: { color: GREEN },
  summaryPay: { color: '#B45309' },
  summaryPayZero: { color: TEXT_MUTED },
  totalRow: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  totalLabel: { fontSize: 15, fontWeight: '800', color: BRAND_BLUE_DARK },
  totalValue: { fontSize: 18, fontWeight: '800', color: BRAND_BLUE_DARK },
  methodTitle: { fontSize: 14, fontWeight: '700', color: BRAND_BLUE_DARK, marginTop: 8 },
  methodRow: { flexDirection: 'row', gap: 10 },
  methodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 12,
  },
  methodBtnActive: { borderColor: BRAND_BLUE, backgroundColor: 'rgba(18, 59, 122, 0.06)' },
  methodText: { fontSize: 14, fontWeight: '700', color: TEXT_MUTED },
  methodTextActive: { color: BRAND_BLUE_DARK },
  walletBal: { fontSize: 13, color: TEXT_MUTED },
  walletBalError: { color: '#B42318', fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  cancelBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: { fontWeight: '700', color: TEXT_MUTED },
  approveBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
    paddingVertical: 14,
    alignItems: 'center',
  },
  approveDisabled: { opacity: 0.6 },
  approveText: { fontWeight: '800', color: '#FFFFFF' },
  pressed: { opacity: 0.85 },
});
