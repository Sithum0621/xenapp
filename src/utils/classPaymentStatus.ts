export type ClassPaymentStatus = 'paid' | 'pending' | 'overdue';

export function parseClassPaymentStatus(raw: unknown): ClassPaymentStatus {
  if (raw === 'paid' || raw === 'overdue') return raw;
  return 'pending';
}

/** billing_month from API is YYYY-MM-DD (first of month). */
export function formatBillingMonthLabel(billingMonthIso: string): string {
  const trimmed = billingMonthIso.trim();
  const match = /^(\d{4})-(\d{2})/.exec(trimmed);
  if (!match) return trimmed;
  const year = Number.parseInt(match[1]!, 10);
  const monthIndex = Number.parseInt(match[2]!, 10) - 1;
  if (!Number.isFinite(year) || monthIndex < 0 || monthIndex > 11) return trimmed;
  return new Intl.DateTimeFormat(undefined, { month: 'long' }).format(
    new Date(year, monthIndex, 1),
  );
}

export function paymentStatusColor(status: ClassPaymentStatus): string {
  if (status === 'paid') return '#0F9D58';
  if (status === 'overdue') return '#B42318';
  return '#B45309';
}
