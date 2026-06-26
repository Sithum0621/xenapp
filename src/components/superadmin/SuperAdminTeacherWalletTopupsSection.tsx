import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { ScrollView } from '@/src/components/layout/scroll';

import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import {
  approveTeacherWalletManualTopup,
  createTeacherWalletSlipSignedUrl,
  fetchPendingTeacherWalletTopups,
  rejectTeacherWalletManualTopup,
  type TeacherWalletManualTopupRow,
} from '@/src/services/superadminTeacherWalletApi';
import { formatLkrFromCents } from '@/src/utils/classesPlaceholderBilling';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const PAGE_BG = '#FFFFFF';
const SUBTLE_BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const PANEL_BG = '#F8FAFC';

type Props = {
  desktopShell?: boolean;
  onRequestsChanged?: () => void;
};

function formatRequestDate(iso: string, locale: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

type RequestCardProps = {
  row: TeacherWalletManualTopupRow;
  locale: string;
  onChanged: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
};

function RequestCard({ row, locale, onChanged, t }: RequestCardProps) {
  const [slipUrl, setSlipUrl] = useState<string | null>(null);
  const [slipLoading, setSlipLoading] = useState(true);
  const [transactionId, setTransactionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSlipLoading(true);
    void createTeacherWalletSlipSignedUrl(row.slipPath).then((res) => {
      if (cancelled) return;
      setSlipUrl(res.url);
      setSlipLoading(false);
      if (res.error && !res.url) setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [row.slipPath]);

  const handleApprove = async () => {
    setBusy(true);
    setError(null);
    const res = await approveTeacherWalletManualTopup(row.id, transactionId);
    setBusy(false);
    if (!res.ok) {
      setError(
        res.error === 'duplicate_transaction_id'
          ? t('superAdmin.walletTopupsDuplicateTxn')
          : res.error,
      );
      return;
    }
    onChanged();
  };

  const handleReject = async () => {
    setBusy(true);
    setError(null);
    const res = await rejectTeacherWalletManualTopup(row.id);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onChanged();
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderMain}>
          <Text style={styles.teacherName}>{row.teacherName}</Text>
          {row.teacherEmail ? (
            <Text style={styles.teacherEmail}>{row.teacherEmail}</Text>
          ) : null}
        </View>
        <Text style={styles.amount}>{formatLkrFromCents(row.amountCents)}</Text>
      </View>

      {row.depositorName ? (
        <Text style={styles.meta}>
          {t('superAdmin.walletTopupsDepositorName', { name: row.depositorName })}
        </Text>
      ) : null}
      {row.depositorIdNumber ? (
        <Text style={styles.meta}>
          {t('superAdmin.walletTopupsDepositorId', { id: row.depositorIdNumber })}
        </Text>
      ) : null}
      <Text style={styles.meta}>
        {t('superAdmin.walletTopupsSubmitted', {
          date: formatRequestDate(row.createdAt, locale),
        })}
      </Text>
      {row.note ? <Text style={styles.note}>{row.note}</Text> : null}

      <Text style={styles.fieldLabel}>{t('superAdmin.walletTopupsSlipLabel')}</Text>
      {slipLoading ? (
        <ActivityIndicator color={BRAND_BLUE} style={styles.slipLoader} />
      ) : slipUrl ? (
        <Image source={{ uri: slipUrl }} style={styles.slipImage} resizeMode="contain" />
      ) : (
        <Text style={styles.slipMissing}>{t('superAdmin.walletTopupsSlipMissing')}</Text>
      )}

      <Text style={styles.fieldLabel}>{t('superAdmin.walletTopupsTxnLabel')}</Text>
      <TextInput
        value={transactionId}
        onChangeText={setTransactionId}
        placeholder={t('superAdmin.walletTopupsTxnPlaceholder')}
        autoCapitalize="characters"
        style={styles.fieldInput}
        editable={!busy}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => void handleReject()}
          disabled={busy}
          style={({ pressed }) => [
            styles.rejectBtn,
            pressed && styles.pressed,
            busy && styles.btnDisabled,
          ]}>
          <Text style={styles.rejectText}>{t('superAdmin.walletTopupsReject')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void handleApprove()}
          disabled={busy || transactionId.trim().length < 4}
          style={({ pressed }) => [
            styles.approveBtn,
            pressed && styles.pressed,
            (busy || transactionId.trim().length < 4) && styles.btnDisabled,
          ]}>
          {busy ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.approveText}>{t('superAdmin.walletTopupsApprove')}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export default function SuperAdminTeacherWalletTopupsSection({
  desktopShell,
  onRequestsChanged,
}: Props) {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<TeacherWalletManualTopupRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchPendingTeacherWalletTopups(50);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      setItems([]);
      return;
    }
    setItems(res.items);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleChanged = useCallback(() => {
    void load();
    onRequestsChanged?.();
  }, [load, onRequestsChanged]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        desktopShell && styles.scrollContentDesktop,
      ]}>
      <Text style={styles.title}>{t('superAdmin.walletTopupsTitle')}</Text>
      <Text style={styles.subtitle}>{t('superAdmin.walletTopupsSubtitle')}</Text>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={BRAND_BLUE} size="large" />
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorBoxText}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void load()}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}>
            <Text style={styles.retryText}>{t('superAdmin.walletTopupsRetry')}</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{t('superAdmin.walletTopupsEmpty')}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((row) => (
            <RequestCard
              key={row.id}
              row={row}
              locale={i18n.language}
              onChanged={handleChanged}
              t={t}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: PAGE_BG },
  scrollContent: { padding: 16, paddingBottom: 32, gap: 12 },
  scrollContentDesktop: { paddingHorizontal: 24 },
  title: { fontSize: 22, fontWeight: '800', color: BRAND_BLUE_DARK },
  subtitle: { fontSize: 14, color: TEXT_MUTED, lineHeight: 20, marginBottom: 8 },
  centered: { paddingVertical: 40, alignItems: 'center' },
  errorBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    gap: 10,
  },
  errorBoxText: { color: '#991B1B', fontWeight: '600' },
  retryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: BRAND_BLUE,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
  emptyBox: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PANEL_BG,
  },
  emptyText: { color: TEXT_MUTED, textAlign: 'center', lineHeight: 20 },
  list: { gap: 12 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PANEL_BG,
    padding: 16,
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardHeaderMain: { flex: 1, gap: 2 },
  teacherName: { fontSize: 16, fontWeight: '800', color: BRAND_BLUE_DARK },
  teacherEmail: { fontSize: 13, color: TEXT_MUTED },
  amount: { fontSize: 18, fontWeight: '800', color: BRAND_BLUE },
  meta: { fontSize: 12, color: TEXT_MUTED },
  note: { fontSize: 13, color: BRAND_BLUE_DARK, fontStyle: 'italic' },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: BRAND_BLUE_DARK, marginTop: 4 },
  fieldInput: {
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: PAGE_BG,
  },
  slipLoader: { marginVertical: 12 },
  slipImage: {
    width: '100%',
    height: 220,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PAGE_BG,
  },
  slipMissing: { fontSize: 13, color: TEXT_MUTED, fontStyle: 'italic' },
  error: { fontSize: 13, color: '#B42318', fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  rejectBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    paddingVertical: 12,
    alignItems: 'center',
  },
  rejectText: { fontWeight: '700', color: '#B91C1C' },
  approveBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: BRAND_BLUE,
    paddingVertical: 12,
    alignItems: 'center',
  },
  approveText: { fontWeight: '800', color: '#FFFFFF' },
  pressed: { opacity: 0.85 },
  btnDisabled: { opacity: 0.6 },
});
