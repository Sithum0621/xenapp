import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import NotificationBell from '@/src/components/navigation/NotificationBell';
import { useNotifications } from '@/src/hooks/useNotifications';

type Props = {
  isVisible?: boolean;
};

function TeacherHeaderNotifications({ isVisible = true }: Props) {
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
        emptyLabel={t('teacherDashboard.notificationsEmpty')}
        title={t('teacherDashboard.notificationsTitle')}
        accessibilityLabel={t('teacherDashboard.notificationsTitle')}
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

export default memo(TeacherHeaderNotifications);

const styles = StyleSheet.create({
  bellWrap: {
    flexShrink: 0,
  },
});
