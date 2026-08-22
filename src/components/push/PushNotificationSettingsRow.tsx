import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { checkPushPermissionGranted } from '@/src/push/checkPushPermission';
import { enablePushNotificationsFromUserAction } from '@/src/push/enablePushNotifications';
import { appAlert } from '@/src/utils/appAlert';
import { Text } from '@/src/theme/Text';

const BRAND_BLUE_DARK = '#00101F';
const TEXT_MUTED = '#64748B';

/** Settings row: enable / re-enable push notifications (PWA + native). */
export default function PushNotificationSettingsRow() {
  const { t } = useTranslation();
  const [granted, setGranted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setGranted(await checkPushPermissionGranted());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onEnable = useCallback(async () => {
    setBusy(true);
    const ok = await enablePushNotificationsFromUserAction();
    setBusy(false);
    await refresh();
    if (ok) {
      appAlert(t('pushPermission.settingsTitle'), t('pushPermission.settingsEnabled'));
    } else if (Platform.OS === 'web') {
      appAlert(t('pushPermission.settingsTitle'), t('pushPermission.settingsDeniedWeb'));
    } else {
      appAlert(t('pushPermission.settingsTitle'), t('fcmTest.permissionDenied'));
    }
  }, [refresh, t]);

  const statusLabel =
    granted === null
      ? t('fcmTest.permissionPending')
      : granted
        ? t('fcmTest.permissionGranted')
        : t('fcmTest.permissionDeniedShort');

  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={() => void onEnable()}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.iconWrap}>
        <Ionicons name="notifications-outline" size={18} color={BRAND_BLUE_DARK} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title}>{t('pushPermission.settingsTitle')}</Text>
        <Text style={styles.sub}>
          {statusLabel} · {t('pushPermission.settingsHint')}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={BRAND_BLUE_DARK} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  pressed: { opacity: 0.85 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(18, 59, 122, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '700', color: BRAND_BLUE_DARK },
  sub: { fontSize: 12, lineHeight: 17, color: TEXT_MUTED },
});
