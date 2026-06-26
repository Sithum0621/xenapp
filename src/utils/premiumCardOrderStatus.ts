export const PREMIUM_CARD_ORDER_STATUSES = ['new', 'processing', 'sending', 'received'] as const;

export type PremiumCardOrderStatus = (typeof PREMIUM_CARD_ORDER_STATUSES)[number];

export type PremiumCardOrderStatusFilter = PremiumCardOrderStatus | 'all';

const LEGACY_STATUS_MAP: Record<string, PremiumCardOrderStatus> = {
  pending: 'new',
  reviewed: 'processing',
  fulfilled: 'received',
  cancelled: 'received',
};

export function parsePremiumCardOrderStatus(value: unknown): PremiumCardOrderStatus {
  const s = typeof value === 'string' ? value.toLowerCase() : '';
  if (PREMIUM_CARD_ORDER_STATUSES.includes(s as PremiumCardOrderStatus)) {
    return s as PremiumCardOrderStatus;
  }
  return LEGACY_STATUS_MAP[s] ?? 'new';
}

export function statusStepIndex(status: PremiumCardOrderStatus): number {
  return PREMIUM_CARD_ORDER_STATUSES.indexOf(status);
}

export function statusLabelKey(status: PremiumCardOrderStatus): string {
  switch (status) {
    case 'new':
      return 'superAdmin.cardOrdersStatusNew';
    case 'processing':
      return 'superAdmin.cardOrdersStatusProcessing';
    case 'sending':
      return 'superAdmin.cardOrdersStatusSending';
    case 'received':
      return 'superAdmin.cardOrdersStatusReceived';
    default:
      return 'superAdmin.cardOrdersStatusNew';
  }
}

export function filterLabelKey(filter: PremiumCardOrderStatusFilter): string {
  if (filter === 'all') return 'superAdmin.cardOrdersFilterAll';
  return statusLabelKey(filter);
}

export function nextPremiumCardOrderStatus(
  status: PremiumCardOrderStatus,
): PremiumCardOrderStatus | null {
  const index = statusStepIndex(status);
  if (index < 0 || index >= PREMIUM_CARD_ORDER_STATUSES.length - 1) return null;
  return PREMIUM_CARD_ORDER_STATUSES[index + 1];
}

export function previousPremiumCardOrderStatus(
  status: PremiumCardOrderStatus,
): PremiumCardOrderStatus | null {
  const index = statusStepIndex(status);
  if (index <= 0) return null;
  return PREMIUM_CARD_ORDER_STATUSES[index - 1];
}
