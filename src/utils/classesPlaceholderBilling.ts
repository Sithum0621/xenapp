export function formatLkrFromCents(cents: number): string {
  const amount = Math.round(cents / 100);
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace('LKR', 'Rs.');
}

/** Wallet display with cents (e.g. LKR 2,500.00). */
export function formatLkrWalletFromCents(cents: number): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `LKR ${amount.toFixed(2)}`;
  }
}

/** Fallback when RPC does not return teacher_name (legacy rows). */
export function teacherNameFromGroupTitle(groupName: string): string | null {
  const sep = ' - ';
  const idx = groupName.lastIndexOf(sep);
  if (idx < 0) return null;
  const tail = groupName.slice(idx + sep.length).trim();
  return tail.length > 0 ? tail : null;
}
