import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { enablePushNotificationsFromUserAction } from '@/src/push/enablePushNotifications';
import { checkPushPermissionGranted } from '@/src/push/checkPushPermission';
import { supabase } from '@/src/services/supabaseClient';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import {
  hasHandledPushPermissionPrompt,
  markPushPermissionPromptHandled,
} from '@/src/utils/pushPermissionPromptStorage';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const BORDER = '#E2E8F0';

function isDashboardHomePath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return (
    p === '/teacher-dashboard' ||
    p === '/parent-dashboard' ||
    p === '/admin-dashboard' ||
    p === '/super-admin-dashboard'
  );
}

/**
 * One-time home-screen prompt: ask the user to allow push notifications.
 * Shown after login on any role dashboard home (web PWA + native app).
 */
export default function PushNotificationPermissionPrompt() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const evaluate = useCallback(async (uid: string | null, path: string) => {
    if (!uid || !isDashboardHomePath(path)) {
      setVisible(false);
      return;
    }
    if (await checkPushPermissionGranted()) {
      await markPushPermissionPromptHandled(uid);
      setVisible(false);
      return;
    }
    if (await hasHandledPushPermissionPrompt(uid)) {
      setVisible(false);
      return;
    }
    setUserId(uid);
    setVisible(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      await evaluate(session?.user?.id ?? null, pathname || '/');
    })();

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      void evaluate(session?.user?.id ?? null, pathname || '/');
    });

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
    };
  }, [pathname, evaluate]);

  const close = useCallback(async (markHandled: boolean) => {
    if (markHandled && userId) {
      await markPushPermissionPromptHandled(userId);
    }
    setVisible(false);
  }, [userId]);

  const onAllow = useCallback(async () => {
    setBusy(true);
    const ok = await enablePushNotificationsFromUserAction();
    setBusy(false);
    await close(true);
    if (!ok && Platform.OS === 'web') {
      // Browser blocked — user can retry from settings after changing site permissions.
    }
  }, [close]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => void close(true)}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="notifications-outline" size={28} color={BRAND_BLUE} />
          </View>
          <Text style={styles.title}>{t('pushPermission.promptTitle')}</Text>
          <Text style={styles.body}>{t('pushPermission.promptBody')}</Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void close(true)}
              style={({ pressed }) => [styles.btnSecondary, pressed && styles.pressed]}>
              <Text style={styles.btnSecondaryText}>{t('pushPermission.promptLater')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void onAllow()}
              style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}>
              {busy ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.btnPrimaryText}>{t('pushPermission.promptAllow')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 16, 31, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 12,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(18, 59, 122, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: {
    fontSize: 18,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: FontFamily.regular,
    color: '#475569',
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  btnSecondary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  btnSecondaryText: {
    fontSize: 15,
    fontFamily: FontFamily.semiBold,
    color: BRAND_BLUE_DARK,
  },
  btnPrimary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  btnPrimaryText: {
    fontSize: 15,
    fontFamily: FontFamily.semiBold,
    color: '#FFFFFF',
  },
  pressed: { opacity: 0.88 },
});
