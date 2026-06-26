import { Ionicons } from '@expo/vector-icons';
import messaging from '@react-native-firebase/messaging';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScrollView } from '@/src/components/layout/scroll';

import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import { logFcmToken } from '@/src/push/logFcmToken';
import { requestFcmPermission } from '@/src/push/requestFcmPermission';
import { registerDeviceToken } from '@/src/services/pushNotificationsApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import {
  parentBorder,
  parentBrandBlue,
  parentBrandBlueDark,
  parentInkSoft,
  parentSurface,
  parentSurfaceAlt,
} from '@/src/theme/parentDashboardPalette';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

type PermissionState = 'pending' | 'granted' | 'denied' | 'unsupported';

/**
 * Dev-build FCM test screen — permissions, copyable token, foreground Alert, Supabase sync.
 * Requires `google-services.json` / dev build (not Expo Go).
 */
export default function FcmTestScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const [permissionState, setPermissionState] = useState<PermissionState>('pending');
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const loadToken = useCallback(async () => {
    if (Platform.OS === 'web') {
      setPermissionState('unsupported');
      setError(t('fcmTest.unsupportedWeb'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const permission = await requestFcmPermission();
      if (!permission.granted) {
        setPermissionState(permission.reason === 'unsupported' ? 'unsupported' : 'denied');
        setError(permission.message ?? t('fcmTest.permissionDenied'));
        setFcmToken(null);
        setLoading(false);
        return;
      }

      setPermissionState('granted');
      const token = await messaging().getToken();
      setFcmToken(token);
      logFcmToken(token);
      await registerDeviceToken(
        token,
        Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fcmTest.tokenError'));
      setFcmToken(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setPermissionState('unsupported');
      setLoading(false);
      return undefined;
    }

    void loadToken();

    const unsubscribeTokenRefresh = messaging().onTokenRefresh((token) => {
      setFcmToken(token);
      logFcmToken(token);
      void registerDeviceToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
    });

    return () => {
      unsubscribeTokenRefresh();
    };
  }, [loadToken]);

  const permissionLabel =
    permissionState === 'granted'
      ? t('fcmTest.permissionGranted')
      : permissionState === 'denied'
        ? t('fcmTest.permissionDeniedShort')
        : permissionState === 'unsupported'
          ? t('fcmTest.unsupported')
          : t('fcmTest.permissionPending');

  const permissionColor =
    permissionState === 'granted' ? '#16A34A' : permissionState === 'denied' ? '#DC2626' : parentInkSoft;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardExtraPadding={24}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('fcmTest.back')}
            onPress={() => routerBackOrReplace(router, '/parent-dashboard')}
            style={({ pressed }) => [styles.backRow, pressed && styles.backRowPressed]}>
            <Ionicons name="chevron-back" size={22} color={parentBrandBlueDark} />
            <Text style={styles.backLabel}>{t('fcmTest.back')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('fcmTest.title')}</Text>
          <Text style={styles.subtitle}>{t('fcmTest.subtitle')}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.statusRow}>
            <View style={styles.statusIcon}>
              <Ionicons name="notifications-outline" size={20} color={parentBrandBlue} />
            </View>
            <View style={styles.statusTextCol}>
              <Text style={styles.statusLabel}>{t('fcmTest.permissionLabel')}</Text>
              <Text style={[styles.statusValue, { color: permissionColor }]}>{permissionLabel}</Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator color={parentBrandBlue} />
              <Text style={styles.loaderText}>{t('fcmTest.loadingToken')}</Text>
            </View>
          ) : error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void loadToken()}
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}>
                <Text style={styles.secondaryBtnText}>{t('fcmTest.retry')}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.sectionLabel}>{t('fcmTest.tokenLabel')}</Text>
              <Text style={styles.tokenHint}>{t('fcmTest.tokenHint')}</Text>
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator
                style={styles.tokenScroll}
                contentContainerStyle={styles.tokenScrollContent}>
                <Text selectable={true} style={styles.tokenText}>
                  {fcmToken ?? t('fcmTest.noToken')}
                </Text>
              </ScrollView>

              <Pressable
                accessibilityRole="button"
                onPress={() => void loadToken()}
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}>
                <Ionicons name="refresh-outline" size={18} color={parentBrandBlueDark} />
                <Text style={styles.secondaryBtnText}>{t('fcmTest.refreshToken')}</Text>
              </Pressable>
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>{t('fcmTest.howToTestTitle')}</Text>
          <Text style={styles.stepText}>{t('fcmTest.step1')}</Text>
          <Text style={styles.stepText}>{t('fcmTest.step2')}</Text>
          <Text style={styles.stepText}>{t('fcmTest.step3')}</Text>
          {lastMessage ? (
            <View style={styles.lastMessageBox}>
              <Text style={styles.lastMessageLabel}>{t('fcmTest.lastForeground')}</Text>
              <Text style={styles.lastMessageValue}>{lastMessage}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.noteCard}>
          <Ionicons name="information-circle-outline" size={18} color={parentInkSoft} />
          <Text style={styles.noteText}>{t('fcmTest.backgroundNote')}</Text>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: parentSurfaceAlt,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  header: {
    paddingTop: 4,
    paddingBottom: 12,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  backRowPressed: {
    opacity: 0.75,
  },
  backLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FontFamily.bold,
    color: parentBrandBlueDark,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: FontFamily.black,
    color: parentBrandBlueDark,
    paddingHorizontal: 4,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
    paddingHorizontal: 4,
  },
  card: {
    marginTop: 12,
    backgroundColor: parentSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: parentBorder,
    padding: 16,
    gap: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(18, 59, 122, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTextCol: {
    flex: 1,
    gap: 2,
  },
  statusLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FontFamily.bold,
    color: parentInkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statusValue: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: FontFamily.bold,
    color: parentBrandBlueDark,
  },
  loaderWrap: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  loaderText: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
  },
  errorBox: {
    gap: 12,
    paddingVertical: 8,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FontFamily.regular,
    color: '#DC2626',
  },
  sectionLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: FontFamily.bold,
    color: parentBrandBlueDark,
  },
  tokenHint: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
  },
  tokenScroll: {
    maxHeight: 140,
    borderWidth: 1,
    borderColor: parentBorder,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  tokenScrollContent: {
    padding: 14,
  },
  tokenText: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: FontFamily.regular,
    color: parentBrandBlueDark,
  },
  secondaryBtn: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: parentBorder,
    backgroundColor: parentSurface,
  },
  secondaryBtnPressed: {
    opacity: 0.85,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontFamily: FontFamily.bold,
    color: parentBrandBlueDark,
  },
  stepText: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: FontFamily.regular,
    color: parentBrandBlueDark,
  },
  lastMessageBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(18, 59, 122, 0.06)',
    gap: 4,
  },
  lastMessageLabel: {
    fontSize: 12,
    fontFamily: FontFamily.bold,
    color: parentInkSoft,
  },
  lastMessageValue: {
    fontSize: 14,
    fontFamily: FontFamily.bold,
    color: parentBrandBlueDark,
  },
  noteCard: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: parentSurface,
    borderWidth: 1,
    borderColor: parentBorder,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
  },
});
