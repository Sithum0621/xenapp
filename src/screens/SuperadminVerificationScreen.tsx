import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppRoutes } from '@/src/navigation/AppNavigator';
import { finalizeAuthenticatedLogin } from '@/src/navigation/completeAuthenticatedLogin';
import { superadminMfaVerify } from '@/src/services/superadminMfaApi';
import { supabase } from '@/src/services/supabaseClient';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const PAGE_BG = '#FFFFFF';
const TEXT_MUTED = '#64748B';
const SUBTLE_BORDER = '#E2E8F0';

export default function SuperadminVerificationScreen() {
  const { t } = useTranslation();
  const { challengeId } = useLocalSearchParams<{ challengeId?: string }>();
  const inputRef = useRef<TextInput>(null);

  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resolveErrorKey = useCallback(
    (err?: string) => {
      switch (err) {
        case 'network_error':
        case 'invoke_failed':
          return 'auth.errors.mfaNetworkFailed';
        case 'missing_supabase_env':
          return 'auth.errors.mfaConfigMissing';
        case 'invalid_credentials':
          return 'auth.errors.loginFailed';
        case 'challenge_not_found':
        case 'challenge_expired':
          return 'auth.errors.mfaExpired';
        case 'invalid_code':
          return 'auth.errors.mfaWrongCode';
        case 'session_exchange_failed':
          return 'auth.errors.mfaSessionFailed';
        default:
          return 'auth.errors.mfaGeneric';
      }
    },
    [],
  );

  const submit = useCallback(async () => {
    const id = typeof challengeId === 'string' ? challengeId.trim() : '';
    const digits = code.replace(/\D/g, '').slice(0, 6);
    if (!id || digits.length !== 6) {
      setErrorMessage(t('auth.errors.mfaIncomplete'));
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    const res = await superadminMfaVerify(id, digits);

    if (!res.ok || !res.access_token || !res.refresh_token) {
      setSubmitting(false);
      setErrorMessage(t(resolveErrorKey(res.error)));
      return;
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: res.access_token,
      refresh_token: res.refresh_token,
    });

    setSubmitting(false);

    if (sessionError) {
      setErrorMessage(sessionError.message || t('auth.errors.mfaSessionFailed'));
      return;
    }

    const fin = await finalizeAuthenticatedLogin(t, setSubmitting);
    if (!fin.ok) {
      setErrorMessage(fin.message);
    }
  }, [challengeId, code, resolveErrorKey, t]);

  const onChangeCode = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    setErrorMessage(null);
  };

  if (!challengeId?.trim()) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.center}>
          <Text style={styles.warnTitle}>{t('auth.superadminVerify.missingChallenge')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace(AppRoutes.login)}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}>
            <Text style={styles.primaryBtnText}>{t('auth.back')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.page}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('auth.back')}
          onPress={() => router.replace(AppRoutes.login)}
          style={({ pressed }) => [styles.backRow, pressed && styles.backRowPressed]}>
          <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
          <Text style={styles.backText}>{t('auth.back')}</Text>
        </Pressable>

        <View style={styles.hero}>
          <View style={styles.iconCircle}>
            <Ionicons name="shield-checkmark-outline" size={32} color={BRAND_BLUE} />
          </View>
          <Text style={styles.title}>{t('auth.superadminVerify.title')}</Text>
          <Text style={styles.subtitle}>{t('auth.superadminVerify.subtitle')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>{t('auth.superadminVerify.codeLabel')}</Text>
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={onChangeCode}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            textContentType="oneTimeCode"
            autoComplete={Platform.OS === 'ios' ? 'one-time-code' : 'sms-otp'}
            placeholder="000000"
            placeholderTextColor="#94A3B8"
            style={styles.codeInput}
            accessibilityLabel={t('auth.superadminVerify.codeLabel')}
          />

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('auth.superadminVerify.verify')}
            onPress={() => void submit()}
            disabled={submitting || code.length < 6}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && styles.primaryBtnPressed,
              (submitting || code.length < 6) && styles.primaryBtnDisabled,
            ]}>
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>{t('auth.superadminVerify.verify')}</Text>
            )}
          </Pressable>

          <Text style={styles.help}>{t('auth.superadminVerify.help')}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAGE_BG },
  page: { flex: 1, paddingHorizontal: 24, paddingTop: 8 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 20 },
  warnTitle: { fontSize: 16, fontWeight: '600', color: BRAND_BLUE_DARK, textAlign: 'center' },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingRight: 12,
    marginBottom: 12,
    gap: 4,
  },
  backRowPressed: { opacity: 0.65 },
  backText: { fontSize: 17, fontWeight: '600', color: BRAND_BLUE_DARK },
  hero: { alignItems: 'center', marginBottom: 28 },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 32,
  },
  subtitle: { fontSize: 15, color: TEXT_MUTED, textAlign: 'center', lineHeight: 22, maxWidth: 360 },
  card: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#F8FAFC',
    padding: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#123B7A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  label: { color: BRAND_BLUE_DARK, fontSize: 14, fontWeight: '600', marginBottom: 10 },
  codeInput: {
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: Platform.OS === 'ios' ? 16 : 12,
    fontSize: 28,
    letterSpacing: 12,
    fontVariant: ['tabular-nums'],
    color: BRAND_BLUE_DARK,
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorText: {
    marginTop: 8,
    marginBottom: 4,
    color: '#B91C1C',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
  },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: BRAND_BLUE,
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnPressed: { backgroundColor: BRAND_BLUE_DARK },
  primaryBtnDisabled: { opacity: 0.65 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  help: { marginTop: 18, fontSize: 13, color: TEXT_MUTED, textAlign: 'center', lineHeight: 19 },
});
