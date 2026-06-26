import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';

import { LanguageLnToggle } from '@/src/components/LanguageLnToggle';
import { SriLankaMobileInput } from '@/src/components/auth/SriLankaMobileInput';
import { AppRoutes, appHref, dashboardRouteForProfileRole, type ProfileRole } from '@/src/navigation/AppNavigator';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';
import { finalizeAuthenticatedLogin } from '@/src/navigation/completeAuthenticatedLogin';
import { DESIGNATED_SUPERADMIN_EMAIL, isDesignatedSuperadminMfaEmail } from '@/src/constants/superadminMfa';
import { getStoredLanguagePreference } from '@/src/services/languagePreference';
import { superadminMfaStart } from '@/src/services/superadminMfaApi';
import { supabase } from '@/src/services/supabaseClient';
import { fetchTempPasswordStatus } from '@/src/services/tempPasswordApi';
import { roleUsesTempPassword } from '@/src/utils/tempPasswordPolicy';
import {
  parseLoginIdentifier,
  parseSriLankaMobile,
  resolveIdentifierToAuthEmail,
  type ParsedLoginIdentifier,
} from '@/src/utils/loginIdentifier';
import { isValidSriLankaMobile } from '@/src/utils/sriLankaMobile';
import {
  isProfileFetchNetworkError,
  isProfileFetchServerError,
} from '@/src/utils/profileFetchErrors';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const PAGE_BG = '#FFFFFF';
const TEXT_MUTED = '#64748B';
const SUBTLE_BORDER = '#E2E8F0';

function roleLabelKey(role: string | undefined): string {
  switch (role) {
    case 'admin':
      return 'roleSelect.roles.admin';
    case 'teacher':
      return 'roleSelect.roles.teacher';
    case 'parent':
    case 'parent_student':
      return 'roleSelect.roles.parentStudent';
    default:
      return 'roleSelect.roles.parentStudent';
  }
}

export default function LoginScreen() {
  const { t, i18n } = useTranslation();
  const { role, superadmin_hint, profileIssue } = useLocalSearchParams<{
    role?: string;
    superadmin_hint?: string;
    profileIssue?: string;
  }>();
  const [identifier, setIdentifier] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  /** Session exists but loading `profiles.role` failed (e.g. HTTP 500) — offer retry without signing out. */
  const [profileGateFailed, setProfileGateFailed] = useState(false);

  const hasRoleContext = role === 'admin' || role === 'teacher' || role === 'parent' || role === 'parent_student';
  const isStudentLogin = role === 'parent_student' || role === 'parent';
  const showSignupLink = role === 'teacher' || isStudentLogin;
  const signupRoleParam = role === 'teacher' ? 'teacher' : 'parent_student';
  const signupLinkLabel =
    role === 'teacher' ? t('auth.createAccount') : t('signup.createAccount');
  const useLoginOnlyHeading = !showSignupLink;
  const roleLabel = useMemo(() => t(roleLabelKey(role)), [role, t]);
  const identifierLabel = t('auth.identifier');
  const identifierPlaceholder = t('auth.identifierPlaceholder');

  useEffect(() => {
    void (async () => {
      const lang = await getStoredLanguagePreference();
      if (lang) await i18n.changeLanguage(lang);
    })();
  }, [i18n]);

  useEffect(() => {
    if (superadmin_hint === '1') {
      setIdentifier(DESIGNATED_SUPERADMIN_EMAIL);
    }
  }, [superadmin_hint]);

  useEffect(() => {
    if (profileIssue === 'server') {
      setErrorMessage(t('auth.errors.profileServerError'));
      setProfileGateFailed(true);
      setCheckingSession(false);
    } else if (profileIssue === 'network') {
      setErrorMessage(t('auth.errors.profileNetworkError'));
      setProfileGateFailed(true);
      setCheckingSession(false);
    } else if (profileIssue === 'unknown') {
      setErrorMessage(t('auth.errors.profileLoadFailed'));
      setProfileGateFailed(true);
      setCheckingSession(false);
    }
  }, [profileIssue, t]);

  useEffect(() => {
    let cancelled = false;

    const redirectIfAuthenticated = async () => {
      if (profileIssue) {
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        if (!cancelled) setCheckingSession(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle<{ role: ProfileRole }>();

      if (cancelled) return;

      if (profileError) {
        if (isProfileFetchServerError(profileError)) {
          setErrorMessage(t('auth.errors.profileServerError'));
        } else if (isProfileFetchNetworkError(profileError)) {
          setErrorMessage(t('auth.errors.profileNetworkError'));
        } else {
          setErrorMessage(t('auth.errors.profileLoadFailed'));
        }
        setProfileGateFailed(true);
        setCheckingSession(false);
        return;
      }

      if (profile?.role) {
        router.replace(appHref(dashboardRouteForProfileRole(profile.role)));
        return;
      }

      setCheckingSession(false);
    };

    void redirectIfAuthenticated();
    return () => {
      cancelled = true;
    };
  }, [t, profileIssue]);

  const retryProfileAfterGateFailure = async () => {
    setErrorMessage(null);
    setProfileGateFailed(false);
    setCheckingSession(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      setCheckingSession(false);
      return;
    }
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .maybeSingle<{ role: ProfileRole }>();
    setCheckingSession(false);
    if (profileError) {
      if (isProfileFetchServerError(profileError)) {
        setErrorMessage(t('auth.errors.profileServerError'));
      } else if (isProfileFetchNetworkError(profileError)) {
        setErrorMessage(t('auth.errors.profileNetworkError'));
      } else {
        setErrorMessage(t('auth.errors.profileLoadFailed'));
      }
      setProfileGateFailed(true);
      return;
    }
    if (profile?.role) {
      router.replace(appHref(dashboardRouteForProfileRole(profile.role)));
    }
  };

  type LoginIdentifier = ParsedLoginIdentifier;

  const validate = (): LoginIdentifier | null => {
    if (!password.trim()) {
      setErrorMessage(t('auth.errors.required'));
      return null;
    }
    if (password.length < 6) {
      setErrorMessage(t('auth.errors.passwordMin'));
      return null;
    }

    if (isStudentLogin) {
      const mobile = mobileNumber.trim();
      if (!mobile) {
        setErrorMessage(t('signup.errors.mobileRequired'));
        return null;
      }
      const phoneE164 = parseSriLankaMobile(mobile);
      if (!phoneE164 || !isValidSriLankaMobile(mobile)) {
        setErrorMessage(t('signup.errors.mobileInvalid'));
        return null;
      }
      return { kind: 'phone', phone: phoneE164 };
    }

    const normalizedIdentifier = identifier.trim();
    if (!normalizedIdentifier) {
      setErrorMessage(t('auth.errors.required'));
      return null;
    }
    const parsed = parseLoginIdentifier(normalizedIdentifier);
    if (parsed) return parsed;
    setErrorMessage(t('auth.errors.identifierInvalid'));
    return null;
  };

  const handleForgotPassword = async () => {
    if (isStudentLogin) {
      setErrorMessage(t('auth.errors.forgotPhoneAccountHint'));
      return;
    }

    const parsed = parseLoginIdentifier(identifier);
    if (!parsed || parsed.kind !== 'email') {
      setErrorMessage(t('auth.errors.forgotNeedsEmail'));
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(parsed.email);
    if (error) {
      setErrorMessage(error.message || t('auth.errors.forgotFailed'));
      return;
    }

    appAlert(t('auth.forgotPassword'), t('auth.resetSent'));
  };

  const enforceTempPasswordExpiry = async (): Promise<boolean> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return true;

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (!roleUsesTempPassword(profile?.role)) return true;

    const status = await fetchTempPasswordStatus();
    if (status.isTemporary && status.isExpired) {
      await supabase.auth.signOut();
      setIsSubmitting(false);
      setErrorMessage(t('auth.errors.tempPasswordExpired'));
      return false;
    }
    return true;
  };

  const runFinalizeLogin = async () => {
    const stillValid = await enforceTempPasswordExpiry();
    if (!stillValid) return;
    const result = await finalizeAuthenticatedLogin(t, setIsSubmitting);
    if (!result.ok) {
      setErrorMessage(result.message);
    }
  };

  const friendlyAuthError = (message: string | undefined): string => {
    const lower = (message ?? '').toLowerCase();
    if (lower.includes('phone logins are disabled') || lower.includes('phone_provider_disabled')) {
      return t('auth.errors.legacyPhoneAccountUnsupported');
    }
    if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials')) {
      return t('auth.errors.loginFailed');
    }
    if (lower.includes('email not confirmed')) {
      return t('auth.errors.loginFailed');
    }
    return message || t('auth.errors.loginFailed');
  };

  const fallbackSignInWithPassword = async (parsed: ParsedLoginIdentifier) => {
    // Phone identifiers are mapped to a deterministic synthetic email created by the
    // teacher-student-enroll edge function, so login always flows through Supabase's email
    // provider (no need to enable the Supabase Phone provider in the project).
    const authEmail = resolveIdentifierToAuthEmail(parsed);
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password,
    });

    if (signInError || !signInData.user) {
      setIsSubmitting(false);
      setErrorMessage(friendlyAuthError(signInError?.message));
      return;
    }

    await runFinalizeLogin();
  };

  const handleLogin = async () => {
    setErrorMessage(null);
    setProfileGateFailed(false);
    const parsed = validate();
    if (!parsed) return;

    setIsSubmitting(true);

    /**
     * Institute admins (`role=admin` from role select) share the same Edge MFA path as
     * platform superadmin (see `superadmin-mfa`: OTP for profile roles admin + superadmin).
     * Teachers/parents stay on password-only Supabase auth.
     */
    const useSuperadminMfaFlow =
      role === 'admin' ||
      superadmin_hint === '1' ||
      (parsed.kind === 'email' && isDesignatedSuperadminMfaEmail(parsed.email));

    if (!useSuperadminMfaFlow) {
      await fallbackSignInWithPassword(parsed);
      return;
    }

    if (parsed.kind !== 'email') {
      setIsSubmitting(false);
      setErrorMessage(t('auth.errors.adminEmailOnly'));
      return;
    }

    const email = parsed.email;
    const start = await superadminMfaStart(email, password);

    const otpChallenge =
      typeof start.challenge_id === 'string' && start.challenge_id.length > 0;

    if (
      start.ok &&
      start.skip_otp &&
      typeof start.access_token === 'string' &&
      typeof start.refresh_token === 'string'
    ) {
      const access_token = start.access_token;
      const refresh_token = start.refresh_token;
      const { error: sessionError } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      if (sessionError) {
        setIsSubmitting(false);
        setErrorMessage(sessionError.message || t('auth.errors.loginFailed'));
        return;
      }

      await runFinalizeLogin();
      return;
    }

    if (start.ok && otpChallenge) {
      setIsSubmitting(false);
      router.replace({
        pathname: AppRoutes.superadminVerify,
        params: { challengeId: start.challenge_id },
      });
      return;
    }

    const fallbackReasons = new Set(['network_error', 'invoke_failed', 'edge_http_error']);
    if (fallbackReasons.has(start.error ?? '')) {
      await fallbackSignInWithPassword(parsed);
      return;
    }

    setIsSubmitting(false);

    const key =
      start.error === 'invalid_credentials'
        ? 'auth.errors.loginFailed'
        : start.error === 'email_send_failed'
          ? 'auth.errors.mfaEmailFailed'
          : start.error === 'profile_missing'
            ? 'auth.errors.profileMissing'
            : start.error === 'missing_supabase_env'
              ? 'auth.errors.mfaConfigMissing'
              : 'auth.errors.mfaGeneric';

    let message = t(key);
    if (start.error === 'email_send_failed') {
      if (start.detail === 'missing_resend') {
        message += `\n\n${t('auth.errors.mfaEmailFailedHintMissingResend')}`;
      } else if (start.detail === 'resend_unverified_domain') {
        message += `\n\n${t('auth.errors.mfaEmailFailedHintResendUnverifiedDomain')}`;
      } else if (start.detail === 'resend_testing_domain') {
        message += `\n\n${t('auth.errors.mfaEmailFailedHintResendTestingDomain')}`;
      } else if (start.detail === 'resend_http_error') {
        message += `\n\n${t('auth.errors.mfaEmailFailedHintResendRejected')}`;
      }
    }
    setErrorMessage(message);
  };

  if (checkingSession) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.bootLoading}>
          <ActivityIndicator size="large" color={BRAND_BLUE} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardExtraPadding={32}>
        <View style={styles.navRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('auth.back')}
            onPress={() => routerBackOrReplace(router, appHref(AppRoutes.roleSelect))}
            style={({ pressed }) => [styles.backCompact, pressed && styles.backRowPressed]}>
            <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
            <Text style={styles.backText}>{t('auth.back')}</Text>
          </Pressable>
          <View style={styles.navRowSpacer} />
          <LanguageLnToggle />
        </View>

        <Text style={styles.heading} accessibilityRole="header">
          {useLoginOnlyHeading ? t('auth.titleLoginOnly') : t('auth.title')}
        </Text>
        <Text style={styles.subtitle}>
          {hasRoleContext ? t('auth.subtitle', { role: roleLabel }) : t('auth.subtitleNoRole')}
        </Text>

        <View style={styles.formCard}>
          {isStudentLogin ? (
            <SriLankaMobileInput
              value={mobileNumber}
              onChangeText={(value) => {
                setMobileNumber(value);
                setErrorMessage(null);
              }}
              label={t('auth.loginUsername')}
              hint={t('auth.loginUsernameHint')}
              placeholder={t('auth.loginUsernamePlaceholder')}
              labelStyle={styles.label}
              inputStyle={styles.input}
              validateOnBlur
            />
          ) : (
            <>
              <Text style={styles.label}>{identifierLabel}</Text>
              <TextInput
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder={identifierPlaceholder}
                style={styles.input}
                placeholderTextColor="#94A3B8"
              />
            </>
          )}

          <Text style={[styles.label, styles.passwordLabel]}>{t('auth.password')}</Text>
          <View style={styles.passwordWrap}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              placeholder={t('auth.passwordPlaceholder')}
              style={[styles.input, styles.passwordInput]}
              placeholderTextColor="#94A3B8"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              onPress={() => setShowPassword((prev) => !prev)}
              style={styles.eyeBtn}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={TEXT_MUTED}
              />
            </Pressable>
          </View>

          <Pressable onPress={handleForgotPassword} style={styles.forgotWrap}>
            <Text style={styles.forgotText}>{t('auth.forgotPassword')}</Text>
          </Pressable>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          {profileGateFailed ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('auth.retryProfileLoad')}
              onPress={() => void retryProfileAfterGateFailure()}
              disabled={checkingSession || isSubmitting}
              style={({ pressed }) => [
                styles.retryProfileBtn,
                pressed && styles.retryProfileBtnPressed,
                (checkingSession || isSubmitting) && styles.retryProfileBtnDisabled,
              ]}>
              <Text style={styles.retryProfileBtnText}>{t('auth.retryProfileLoad')}</Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('auth.login')}
            onPress={handleLogin}
            disabled={isSubmitting}
            style={({ pressed }) => [
              styles.loginButton,
              pressed && styles.loginButtonPressed,
              isSubmitting && styles.loginButtonDisabled,
            ]}>
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.loginButtonText}>{t('auth.login')}</Text>
            )}
          </Pressable>

          {showSignupLink ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={signupLinkLabel}
              onPress={() =>
                router.replace({
                  pathname: AppRoutes.signup,
                  params: { role: signupRoleParam },
                })
              }
              style={styles.signupWrap}>
              <Text style={styles.signupText}>{signupLinkLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  bootLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  navRowSpacer: {
    flex: 1,
    minWidth: 8,
  },
  backCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingRight: 12,
    gap: 4,
  },
  backRowPressed: {
    opacity: 0.65,
  },
  backText: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    marginBottom: 8,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 16,
    color: TEXT_MUTED,
    lineHeight: 24,
    marginBottom: 28,
  },
  formCard: {
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
  label: {
    color: BRAND_BLUE_DARK,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  passwordLabel: {
    marginTop: 14,
  },
  input: {
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 50,
    fontSize: 16,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  passwordWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 46,
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  forgotWrap: {
    alignSelf: 'flex-end',
    marginTop: 12,
  },
  forgotText: {
    color: BRAND_BLUE,
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    marginTop: 12,
    color: '#B91C1C',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
  },
  retryProfileBtn: {
    marginTop: 12,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BRAND_BLUE,
    backgroundColor: '#EFF6FF',
  },
  retryProfileBtnPressed: {
    opacity: 0.88,
  },
  retryProfileBtnDisabled: {
    opacity: 0.55,
  },
  retryProfileBtnText: {
    color: BRAND_BLUE,
    fontWeight: '800',
    fontSize: 14,
  },
  loginButton: {
    marginTop: 16,
    backgroundColor: BRAND_BLUE,
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  loginButtonPressed: {
    backgroundColor: BRAND_BLUE_DARK,
  },
  loginButtonDisabled: {
    opacity: 0.85,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  signupWrap: {
    alignSelf: 'center',
    marginTop: 16,
    paddingVertical: 4,
  },
  signupText: {
    color: BRAND_BLUE,
    fontSize: 14,
    fontWeight: '700',
  },
});
