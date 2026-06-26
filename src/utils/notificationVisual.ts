const BRAND_BLUE = '#123B7A';
const SUCCESS = '#059669';
const DANGER = '#B42318';
const TEXT_MUTED = '#64748B';

export type NotificationVisual = {
  icon: 'checkmark-circle-outline' | 'alert-circle-outline' | 'notifications-outline';
  color: string;
  rowBackground: string;
  iconBackground: string;
  titleColor: string;
};

export function notificationVisual(
  type: string | undefined,
  data?: Record<string, unknown> | null,
): NotificationVisual {
  const accent = typeof data?.accent === 'string' ? data.accent : undefined;

  if (type === 'attendance_not_arrived' || accent === 'danger') {
    return {
      icon: 'alert-circle-outline',
      color: DANGER,
      rowBackground: 'rgba(180, 35, 24, 0.08)',
      iconBackground: 'rgba(180, 35, 24, 0.12)',
      titleColor: DANGER,
    };
  }

  if (type === 'attendance_marked') {
    return {
      icon: 'checkmark-circle-outline',
      color: SUCCESS,
      rowBackground: 'rgba(5, 150, 105, 0.06)',
      iconBackground: 'rgba(5, 150, 105, 0.1)',
      titleColor: '#065F46',
    };
  }

  return {
    icon: 'notifications-outline',
    color: BRAND_BLUE,
    rowBackground: 'rgba(18, 59, 122, 0.05)',
    iconBackground: 'rgba(18, 59, 122, 0.08)',
    titleColor: '#0E2F63',
  };
}

export const NOTIFICATION_DANGER_COLOR = DANGER;
export const NOTIFICATION_MUTED_COLOR = TEXT_MUTED;
