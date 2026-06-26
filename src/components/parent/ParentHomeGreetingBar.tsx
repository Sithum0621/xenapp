import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import NotificationBell from '@/src/components/navigation/NotificationBell';
import { useNotifications } from '@/src/hooks/useNotifications';

export type ParentHomeGreetingBarProps = {
  isVisible: boolean;
};

/** Notification bell for the parent home header trailing slot. */
function ParentHomeGreetingBar({ isVisible }: ParentHomeGreetingBarProps) {
  const { t } = useTranslation();
  const {
    notifications,
    unreadCount,
    loading: notificationsLoading,
    refresh: refreshNotifications,
    markAllRead,
  } = useNotifications(isVisible);

  return (
    <View style={styles.bellWrap}>
      <NotificationBell
        emptyLabel={t('parentDashboard.notificationsEmpty')}
        title={t('parentDashboard.notificationsTitle')}
        accessibilityLabel={t('parentDashboard.notificationsTitle')}
        badgeCount={unreadCount}
        notifications={notifications}
        loading={notificationsLoading}
        unreadOnly
        onOpen={() => void refreshNotifications({ silent: true })}
        onMarkAllRead={() => void markAllRead()}
      />
    </View>
  );
}

export function firstNameForGreeting(fullName: string, firstName?: string | null): string {
  if (firstName?.trim()) return firstName.trim();
  const first = fullName.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : fullName.trim();
}

export default memo(ParentHomeGreetingBar);

const styles = StyleSheet.create({
  bellWrap: {
    flexShrink: 0,
  },
});
