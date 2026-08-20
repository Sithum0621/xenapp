import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppScrollView } from '@/src/components/layout/AppScrollView';
import { KeyboardAwareModalFrame } from '@/src/components/layout/scroll';
import BrandHeader from '@/src/components/parent/BrandHeader';
import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';
import TeacherWalletAddMoneyModal from '@/src/components/teacher/TeacherWalletAddMoneyModal';
import { useSessionCachedQuery } from '@/src/hooks/useSessionCachedQuery';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import {
  invalidateSessionCache,
  SessionCacheKeys,
} from '@/src/services/sessionDataCache';
import {
  fetchTeacherWalletOverview,
  parseRupeeInputToCents,
  teacherWalletBankTransfer,
  type TeacherWalletTransaction,
  type TeacherWalletTxKind,
} from '@/src/services/teacherWalletApi';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { formatLkrFromCents } from '@/src/utils/classesPlaceholderBilling';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const PAGE_BG = '#F8FAFC';
const GREEN_OK = '#15803D';
const RED = '#B42318';
const AMBER = '#D97706';

type WalletAction = 'bank_transfer' | null;

function formatTxDate(iso: string, language: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const locale = language === 'si' ? 'si-LK' : language === 'ta' ? 'ta-LK' : 'en-LK';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function txIcon(kind: TeacherWalletTxKind): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case 'top_up':
      return 'add-circle-outline';
    case 'bank_transfer':
      return 'business-outline';
    case 'payment_received':
      return 'arrow-down-circle-outline';
    default:
      return 'swap-horizontal-outline';
  }
}

function txColor(kind: TeacherWalletTxKind): string {
  switch (kind) {
    case 'top_up':
    case 'payment_received':
      return GREEN_OK;
    case 'bank_transfer':
      return RED;
    default:
      return BRAND_BLUE;
  }
}

function TransactionRow({
  tx,
  language,
  label,
}: {
  tx: TeacherWalletTransaction;
  language: string;
  label: string;
}) {
  const pending = tx.status === 'pending';
  const credit = !pending && (tx.kind === 'top_up' || tx.kind === 'payment_received');
  const sign = pending ? '' : credit ? '+' : '−';
  const color = pending ? AMBER : txColor(tx.kind);

  return (
    <View style={styles.txRow}>
      <View style={[styles.txIconWrap, { backgroundColor: `${color}14` }]}>
        <Ionicons name={txIcon(tx.kind)} size={20} color={color} />
      </View>
      <View style={styles.txMain}>
        <Text style={styles.txLabel} numberOfLines={2}>
          {label}
        </Text>
        <Text style={styles.txDate}>{formatTxDate(tx.createdAt, language)}</Text>
        {tx.note ? (
          <Text style={styles.txNote} numberOfLines={2}>
            {tx.note}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.txAmount, { color }]}>
        {sign}
        {formatLkrFromCents(tx.amountCents)}
      </Text>
    </View>
  );
}

export default function TeacherWalletScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    payhere?: string;
    addMoney?: string;
    tab?: string;
    amount?: string;
  }>();
  const { t, i18n } = useTranslation();
  const w = (k: string, o?: Record<string, unknown>) => t(`teacherDashboard.wallet.${k}`, o);

  const [addMoneyOpen, setAddMoneyOpen] = useState(false);
  const [addMoneyTab, setAddMoneyTab] = useState<'payhere' | 'manual'>('manual');
  const [addMoneyAmount, setAddMoneyAmount] = useState('');
  const [action, setAction] = useState<WalletAction>(null);
  const [amountInput, setAmountInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error, refresh } = useSessionCachedQuery(
    SessionCacheKeys.TEACHER_WALLET,
    () => fetchTeacherWalletOverview(50),
    { shouldCache: (res) => res.ok },
  );

  const overview = data?.ok ? data.overview : null;
  const loadError = data?.ok === false ? data.error : error;

  const goBack = useCallback(() => {
    routerBackOrReplace(router, appHref(AppRoutes.teacherDashboard));
  }, [router]);

  const closeModal = useCallback(() => {
    if (submitting) return;
    setAction(null);
    setAmountInput('');
    setNoteInput('');
    setActionError(null);
  }, [submitting]);

  const openAction = useCallback((next: WalletAction) => {
    setAction(next);
    setAmountInput('');
    setNoteInput('');
    setActionError(null);
  }, []);

  const invalidateWalletCaches = useCallback(() => {
    invalidateSessionCache([
      SessionCacheKeys.TEACHER_WALLET,
      SessionCacheKeys.TEACHER_DASHBOARD_OVERVIEW,
    ]);
  }, []);

  useEffect(() => {
    if (params.addMoney !== '1') return;
    setAddMoneyTab(params.tab === 'payhere' ? 'payhere' : 'manual');
    setAddMoneyAmount(typeof params.amount === 'string' ? params.amount : '');
    setAddMoneyOpen(true);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.replaceState({}, '', AppRoutes.teacherWallet);
    }
  }, [params.addMoney, params.tab, params.amount]);

  useEffect(() => {
    if (!params.payhere) return;
    invalidateWalletCaches();
    void refresh(true);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.replaceState({}, '', AppRoutes.teacherWallet);
    }
  }, [params.payhere, invalidateWalletCaches, refresh]);

  const handleBankTransferSubmit = useCallback(async () => {
    const cents = parseRupeeInputToCents(amountInput);
    if (!cents) {
      setActionError(w('invalidAmount'));
      return;
    }

    setSubmitting(true);
    setActionError(null);

    const note = noteInput.trim() || undefined;
    const res = await teacherWalletBankTransfer(cents, note);

    setSubmitting(false);

    if (!res.ok) {
      setActionError(
        res.error === 'insufficient_balance' ? w('insufficientBalance') : res.error,
      );
      return;
    }

    invalidateWalletCaches();
    closeModal();
    void refresh(true);
  }, [amountInput, noteInput, w, invalidateWalletCaches, closeModal, refresh]);

  const txLabel = useCallback(
    (tx: TeacherWalletTransaction) => {
      if (tx.status === 'pending') {
        if (tx.method === 'manual') return w('txManualPending');
        if (tx.method === 'payhere') return w('txPayherePending');
        return w('txPending');
      }
      switch (tx.kind) {
        case 'top_up':
          return tx.method === 'manual' || (tx.note ?? '').toLowerCase().startsWith('manual')
            ? w('txManualTopUp')
            : w('txTopUp');
        case 'bank_transfer':
          return w('txBankTransfer');
        case 'payment_received':
          return w('txPaymentReceived');
        default:
          if ((tx.note ?? '').toLowerCase().includes('sms credit')) return w('txSmsCredit');
          return w('txAdjustment');
      }
    },
    [w],
  );

  const modalTitle = w('bankTransferTitle');
  const modalHint = w('bankTransferHint');
  const modalSubmit = w('bankTransferSubmit');

  const body = useMemo(() => {
    if (loading && !overview) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={BRAND_BLUE} />
          <Text style={styles.muted}>{w('loading')}</Text>
        </View>
      );
    }

    if (loadError || !overview) {
      return (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>{w('loadError')}</Text>
          <Text style={styles.errorDetail}>{loadError ?? w('loadError')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => refresh(true)}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}>
            <Text style={styles.retryBtnText}>{w('retry')}</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <AppScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.balanceCard}>
          <View style={styles.balanceRow}>
            <View style={styles.balanceIconWrap}>
              <Ionicons name="wallet-outline" size={22} color={BRAND_BLUE} />
            </View>
            <View style={styles.balanceTextCol}>
              <Text style={styles.balanceLabel}>{w('balanceLabel')}</Text>
              <Text style={styles.balanceAmount}>{formatLkrFromCents(overview.balanceCents)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <ScrollFriendlyPressable
            accessibilityRole="button"
            accessibilityLabel={w('addMoneyA11y')}
            onPress={() => {
              setAddMoneyTab('manual');
              setAddMoneyAmount('');
              setAddMoneyOpen(true);
            }}
            style={styles.actionBtnPrimary}
            innerStyle={styles.actionBtnPrimaryInner}>
            <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.actionBtnPrimaryText}>{w('addMoney')}</Text>
          </ScrollFriendlyPressable>
          <ScrollFriendlyPressable
            accessibilityRole="button"
            accessibilityLabel={w('bankTransferA11y')}
            onPress={() => openAction('bank_transfer')}
            style={styles.actionBtnSecondary}
            innerStyle={styles.actionBtnSecondaryInner}>
            <Ionicons name="arrow-down-circle-outline" size={20} color={BRAND_BLUE} />
            <Text style={styles.actionBtnSecondaryText}>{w('bankTransfer')}</Text>
          </ScrollFriendlyPressable>
        </View>

        <Text style={styles.sectionTitle}>{w('transactionsTitle')}</Text>
        {overview.transactions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="receipt-outline" size={28} color={TEXT_MUTED} />
            <Text style={styles.emptyText}>{w('transactionsEmpty')}</Text>
          </View>
        ) : (
          <View style={styles.txList}>
            {overview.transactions.map((tx) => (
              <TransactionRow
                key={`${tx.id}:${tx.status}`}
                tx={tx}
                language={i18n.language}
                label={txLabel(tx)}
              />
            ))}
          </View>
        )}
      </AppScrollView>
    );
  }, [
    loading,
    overview,
    loadError,
    w,
    refresh,
    openAction,
    i18n.language,
    txLabel,
  ]);

  const handleAddMoneySuccess = useCallback(() => {
    invalidateWalletCaches();
    void refresh(true);
  }, [invalidateWalletCaches, refresh]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <BrandHeader helloPrefix={t('teacherDashboard.overview.helloPrefix')} userName={null} />

      <TeacherWalletAddMoneyModal
        visible={addMoneyOpen}
        onClose={() => setAddMoneyOpen(false)}
        onSuccess={handleAddMoneySuccess}
        initialTab={addMoneyTab}
        initialAmount={addMoneyAmount}
      />

      <View style={styles.pageHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('auth.back')}
          onPress={goBack}
          style={({ pressed }) => [styles.backRow, pressed && styles.backRowPressed]}>
          <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
          <Text style={styles.backLabel}>{t('auth.back')}</Text>
        </Pressable>
        <Text style={styles.pageTitle}>{w('title')}</Text>
      </View>

      <View style={styles.main}>{body}</View>

      <KeyboardAwareModalFrame
        visible={action === 'bank_transfer'}
        onRequestClose={closeModal}
        overlayStyle={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={closeModal} />
        <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{modalTitle}</Text>
            <Text style={styles.modalHint}>{modalHint}</Text>

            <Text style={styles.fieldLabel}>{w('amountLabel')}</Text>
            <TextInput
              value={amountInput}
              onChangeText={setAmountInput}
              placeholder={w('amountPlaceholder')}
              keyboardType="decimal-pad"
              style={styles.fieldInput}
            />

            <Text style={styles.fieldLabel}>{w('noteLabel')}</Text>
            <TextInput
              value={noteInput}
              onChangeText={setNoteInput}
              placeholder={w('notePlaceholder')}
              style={styles.fieldInput}
            />

            {actionError ? <Text style={styles.modalError}>{actionError}</Text> : null}

            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                onPress={closeModal}
                disabled={submitting}
                style={({ pressed }) => [styles.modalCancel, pressed && styles.pressed]}>
                <Text style={styles.modalCancelText}>{w('cancel')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void handleBankTransferSubmit()}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.modalSubmit,
                  pressed && styles.pressed,
                  submitting && styles.modalSubmitDisabled,
                ]}>
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>{modalSubmit}</Text>
                )}
              </Pressable>
            </View>
          </View>
      </KeyboardAwareModalFrame>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAGE_BG },
  pageHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 6,
    backgroundColor: PAGE_BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingRight: 8,
  },
  backRowPressed: { opacity: 0.7 },
  backLabel: { fontSize: 16, fontWeight: '600', color: BRAND_BLUE_DARK },
  pageTitle: { fontSize: 22, fontWeight: '800', color: BRAND_BLUE_DARK },
  main: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  muted: { fontSize: 14, color: TEXT_MUTED, fontWeight: '600' },
  errorBox: {
    margin: 18,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    gap: 8,
  },
  errorTitle: { fontSize: 15, fontWeight: '800', color: '#991B1B' },
  errorDetail: { fontSize: 13, color: '#7F1D1D' },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: BRAND_BLUE,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryBtnPressed: { opacity: 0.9 },
  retryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  balanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  balanceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(18, 59, 122, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceTextCol: { flex: 1, gap: 2 },
  balanceLabel: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },
  balanceAmount: { fontSize: 24, fontWeight: '800', color: BRAND_BLUE_DARK },
  actionsRow: { flexDirection: 'row', gap: 10 },
  actionBtnPrimary: { flex: 1 },
  actionBtnPrimaryInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: BRAND_BLUE,
    borderRadius: 12,
    paddingVertical: 12,
  },
  actionBtnPrimaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  actionBtnSecondary: { flex: 1 },
  actionBtnSecondaryInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingVertical: 12,
  },
  actionBtnSecondaryText: { color: BRAND_BLUE_DARK, fontWeight: '800', fontSize: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: BRAND_BLUE_DARK, marginTop: 4 },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: { fontSize: 14, color: TEXT_MUTED, textAlign: 'center', lineHeight: 20 },
  txList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  txIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txMain: { flex: 1, gap: 2 },
  txLabel: { fontSize: 14, fontWeight: '700', color: BRAND_BLUE_DARK },
  txDate: { fontSize: 12, color: TEXT_MUTED },
  txNote: { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: '800' },
  modalRoot: { justifyContent: 'center', paddingHorizontal: 20 },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    gap: 8,
    zIndex: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: BRAND_BLUE_DARK },
  modalHint: { fontSize: 13, color: TEXT_MUTED, lineHeight: 18, marginBottom: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: BRAND_BLUE_DARK, marginTop: 4 },
  fieldInput: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  modalError: { fontSize: 13, color: RED, fontWeight: '600', marginTop: 4 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  modalCancel: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelText: { fontWeight: '700', color: TEXT_MUTED },
  modalSubmit: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: BRAND_BLUE,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalSubmitDisabled: { opacity: 0.7 },
  modalSubmitText: { fontWeight: '800', color: '#FFFFFF' },
  pressed: { opacity: 0.85 },
});
