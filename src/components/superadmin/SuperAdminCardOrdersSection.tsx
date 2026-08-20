import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ScrollView } from '@/src/components/layout/scroll';

import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import {
  fetchPremiumCardOrders,
  setPremiumCardOrderStatus,
  type PremiumCardOrderRow,
} from '@/src/services/superadminPremiumCardOrdersApi';
import { formatContactNumber } from '@/src/services/studentClassCardApi';
import {
  filterLabelKey,
  nextPremiumCardOrderStatus,
  PREMIUM_CARD_ORDER_STATUSES,
  previousPremiumCardOrderStatus,
  statusLabelKey,
  type PremiumCardOrderStatus,
  type PremiumCardOrderStatusFilter,
} from '@/src/utils/premiumCardOrderStatus';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const PAGE_BG = '#FFFFFF';
const SUBTLE_BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const PANEL_BG = '#F8FAFC';

type Props = {
  desktopShell?: boolean;
  onOrdersChanged?: () => void;
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

type StatusStepperProps = {
  current: PremiumCardOrderStatus;
  busy: boolean;
  onSelectStatus: (status: PremiumCardOrderStatus) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
};

function StatusStepper({ current, busy, onSelectStatus, t }: StatusStepperProps) {
  const currentIndex = PREMIUM_CARD_ORDER_STATUSES.indexOf(current);

  return (
    <View style={styles.stepperWrap}>
      <Text style={styles.stepperTitle}>{t('superAdmin.cardOrdersProgressTitle')}</Text>
      <View style={styles.stepperRow}>
        {PREMIUM_CARD_ORDER_STATUSES.map((step, index) => {
          const isPast = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isFuture = index > currentIndex;

          return (
            <View key={step} style={styles.stepperItem}>
              {index > 0 ? (
                <View
                  style={[
                    styles.stepperLine,
                    (isPast || isCurrent) && styles.stepperLineActive,
                  ]}
                />
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isCurrent }}
                accessibilityLabel={t(statusLabelKey(step))}
                disabled={busy}
                onPress={() => onSelectStatus(step)}
                style={({ pressed }) => [
                  styles.stepDot,
                  isPast && styles.stepDotPast,
                  isCurrent && styles.stepDotCurrent,
                  isFuture && styles.stepDotFuture,
                  pressed && !busy && { opacity: 0.88 },
                  busy && styles.btnDisabled,
                ]}>
                <Text
                  style={[
                    styles.stepDotLabel,
                    isPast && styles.stepDotLabelActive,
                    isCurrent && styles.stepDotLabelCurrent,
                  ]}>
                  {index + 1}
                </Text>
              </Pressable>
              <Text
                style={[styles.stepCaption, isCurrent && styles.stepCaptionCurrent]}
                numberOfLines={2}>
                {t(statusLabelKey(step))}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

type OrderRowProps = {
  order: PremiumCardOrderRow;
  busy: boolean;
  locale: string;
  onSelectStatus: (id: string, status: PremiumCardOrderStatus) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
};

function OrderRow({ order, busy, locale, onSelectStatus, t }: OrderRowProps) {
  const isNew = order.status === 'new';
  const next = nextPremiumCardOrderStatus(order.status);
  const prev = previousPremiumCardOrderStatus(order.status);

  return (
    <View style={[styles.orderRow, isNew && styles.orderRowNew]}>
      <View style={styles.orderRowMain}>
        <View style={styles.orderRowHeader}>
          <Text style={styles.studentName} numberOfLines={2}>
            {order.student_full_name || '—'}
          </Text>
          <View style={[styles.statusBadge, isNew && styles.statusBadgeNew]}>
            <Text style={[styles.statusBadgeLabel, isNew && styles.statusBadgeLabelNew]}>
              {t(statusLabelKey(order.status))}
            </Text>
          </View>
        </View>

        <Text style={styles.metaLine}>
          {t('superAdmin.cardOrdersMobile', {
            mobile: formatContactNumber(order.student_mobile),
          })}
        </Text>
        {order.student_email ? (
          <Text style={styles.metaLine}>{order.student_email}</Text>
        ) : null}

        <View style={styles.divider} />

        <Text style={styles.metaLabel}>{t('superAdmin.cardOrdersRequestedBy')}</Text>
        <Text style={styles.metaLine}>{order.requester_full_name || '—'}</Text>
        {order.requester_email ? <Text style={styles.metaLine}>{order.requester_email}</Text> : null}

        <Text style={styles.metaLabel}>{t('superAdmin.cardOrdersRequestedAt')}</Text>
        <Text style={styles.metaLine}>{formatRequestDate(order.created_at, locale)}</Text>

        {order.parent_notes?.trim() ? (
          <>
            <Text style={styles.metaLabel}>{t('superAdmin.cardOrdersParentNotes')}</Text>
            <Text style={styles.notesText}>{order.parent_notes}</Text>
          </>
        ) : null}
      </View>

      <StatusStepper
        current={order.status}
        busy={busy}
        onSelectStatus={(status) => onSelectStatus(order.id, status)}
        t={t}
      />

      {(prev || next) && (
        <View style={styles.actions}>
          {prev ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('superAdmin.cardOrdersMoveBack')}
              disabled={busy}
              onPress={() => onSelectStatus(order.id, prev)}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.actionBtnSecondary,
                pressed && { opacity: 0.88 },
                busy && styles.btnDisabled,
              ]}>
              <Text style={styles.actionBtnSecondaryLabel}>
                {t('superAdmin.cardOrdersMoveTo', { status: t(statusLabelKey(prev)) })}
              </Text>
            </Pressable>
          ) : null}
          {next ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('superAdmin.cardOrdersMoveNext')}
              disabled={busy}
              onPress={() => onSelectStatus(order.id, next)}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.actionBtnPrimary,
                pressed && { opacity: 0.88 },
                busy && styles.btnDisabled,
              ]}>
              <Text style={styles.actionBtnPrimaryLabel}>
                {t('superAdmin.cardOrdersMoveTo', { status: t(statusLabelKey(next)) })}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

export default function SuperAdminCardOrdersSection({ desktopShell, onOrdersChanged }: Props) {
  const { t, i18n } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [orders, setOrders] = useState<PremiumCardOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<PremiumCardOrderStatusFilter>('new');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    const { page, error } = await fetchPremiumCardOrders({
      status: statusFilter,
      search: debouncedSearch,
      limit: 50,
      offset: 0,
    });

    setLoading(false);

    if (error) {
      setErrorMessage(error);
      setOrders([]);
      setTotal(0);
      return;
    }

    setOrders(page?.requests ?? []);
    setTotal(page?.total ?? 0);
  }, [statusFilter, debouncedSearch]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const updateStatus = async (requestId: string, status: PremiumCardOrderStatus) => {
    setBusyId(requestId);
    setErrorMessage(null);

    const { error } = await setPremiumCardOrderStatus(requestId, status);

    setBusyId(null);

    if (error) {
      setErrorMessage(error);
      return;
    }

    await loadOrders();
    onOrdersChanged?.();
  };

  const filters: PremiumCardOrderStatusFilter[] = [...PREMIUM_CARD_ORDER_STATUSES, 'all'];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, desktopShell && styles.scrollContentDesktop]}
      keyboardShouldPersistTaps="handled">
      <Text style={styles.subtitle}>{t('superAdmin.cardOrdersSubtitle')}</Text>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={t('superAdmin.cardOrdersSearchPlaceholder')}
        placeholderTextColor="#94A3B8"
        style={styles.searchInput}
        accessibilityLabel={t('superAdmin.cardOrdersSearchPlaceholder')}
      />

      <View style={styles.filterRow}>
        {filters.map((filter) => {
          const selected = statusFilter === filter;
          return (
            <Pressable
              key={filter}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setStatusFilter(filter)}
              style={({ pressed }) => [
                styles.filterChip,
                selected && styles.filterChipSelected,
                pressed && !selected && { opacity: 0.88 },
              ]}>
              <Text style={[styles.filterChipLabel, selected && styles.filterChipLabelSelected]}>
                {t(filterLabelKey(filter))}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!loading && total > 0 ? (
        <Text style={styles.resultsMeta}>
          {t('superAdmin.cardOrdersResults', { count: orders.length, total })}
        </Text>
      ) : null}

      {errorMessage ? <Text style={styles.errorBanner}>{errorMessage}</Text> : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={BRAND_BLUE} />
        </View>
      ) : orders.length === 0 ? (
        <Text style={styles.empty}>{t('superAdmin.cardOrdersEmpty')}</Text>
      ) : (
        <View style={styles.list}>
          {orders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              busy={busyId === order.id}
              locale={i18n.language}
              onSelectStatus={(id, status) => void updateStatus(id, status)}
              t={t}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: PANEL_BG,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
  },
  scrollContentDesktop: {
    flexGrow: 1,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_MUTED,
    lineHeight: 20,
    marginBottom: 14,
  },
  searchInput: {
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: PAGE_BG,
    minHeight: 44,
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PAGE_BG,
  },
  filterChipSelected: {
    borderColor: BRAND_BLUE,
    backgroundColor: BRAND_BLUE,
  },
  filterChipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
  filterChipLabelSelected: {
    color: '#FFFFFF',
  },
  resultsMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_MUTED,
    marginBottom: 10,
  },
  errorBanner: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    color: '#991B1B',
    fontSize: 14,
    lineHeight: 20,
  },
  loadingWrap: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  empty: {
    fontSize: 14,
    color: TEXT_MUTED,
    lineHeight: 20,
  },
  list: {
    gap: 12,
  },
  orderRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PAGE_BG,
    padding: 14,
    gap: 12,
  },
  orderRowNew: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  orderRowMain: {
    gap: 4,
  },
  orderRowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  studentName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: PANEL_BG,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
  },
  statusBadgeNew: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  statusBadgeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_MUTED,
    textTransform: 'uppercase',
  },
  statusBadgeLabelNew: {
    color: '#B45309',
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_MUTED,
    textTransform: 'uppercase',
    marginTop: 6,
    letterSpacing: 0.3,
  },
  metaLine: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  notesText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 20,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: SUBTLE_BORDER,
    marginVertical: 8,
  },
  stepperWrap: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SUBTLE_BORDER,
  },
  stepperTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  stepperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  stepperItem: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  stepperLine: {
    position: 'absolute',
    left: -50,
    top: 14,
    width: '100%',
    height: 2,
    backgroundColor: SUBTLE_BORDER,
    zIndex: 0,
  },
  stepperLineActive: {
    backgroundColor: BRAND_BLUE,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PAGE_BG,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  stepDotPast: {
    borderColor: BRAND_BLUE,
    backgroundColor: BRAND_BLUE,
  },
  stepDotCurrent: {
    borderColor: BRAND_BLUE,
    backgroundColor: '#E3F2FD',
    transform: [{ scale: 1.08 }],
  },
  stepDotFuture: {
    borderColor: SUBTLE_BORDER,
    backgroundColor: PANEL_BG,
  },
  stepDotLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: TEXT_MUTED,
  },
  stepDotLabelActive: {
    color: '#FFFFFF',
  },
  stepDotLabelCurrent: {
    color: BRAND_BLUE,
  },
  stepCaption: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: '600',
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 13,
  },
  stepCaptionCurrent: {
    color: BRAND_BLUE_DARK,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    minHeight: 36,
    justifyContent: 'center',
  },
  actionBtnSecondary: {
    borderWidth: 1.5,
    borderColor: BRAND_BLUE,
    backgroundColor: PAGE_BG,
  },
  actionBtnSecondaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  actionBtnPrimary: {
    backgroundColor: BRAND_BLUE,
  },
  actionBtnPrimaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  btnDisabled: {
    opacity: 0.55,
  },
});
