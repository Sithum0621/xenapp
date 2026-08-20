import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { ActivityIndicator, Image, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLoadingScreen } from '@/src/components/BrandLoader';
import MyTuitionLogo from '@/src/components/brand/MyTuitionLogo';
import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import { WebPhoneShell } from '@/src/components/layout/WebPhoneShell';

import { LanguageLnToggle } from '@/src/components/LanguageLnToggle';
import { SriLankaMobileInput } from '@/src/components/auth/SriLankaMobileInput';
import { BrandAssets, WOVELLO_WEBSITE_URL } from '@/src/constants/brand';
import { useAppThemeColors } from '@/src/context/ThemePreferenceContext';
import { DESIGNATED_SUPERADMIN_EMAIL, isDesignatedSuperadminMfaEmail } from '@/src/constants/superadminMfa';
import { AppRoutes, appHref, dashboardRouteForProfileRole, type ProfileRole } from '@/src/navigation/AppNavigator';
import { finalizeAuthenticatedLogin } from '@/src/navigation/completeAuthenticatedLogin';
import { getStoredLanguagePreference } from '@/src/services/languagePreference';
import { superadminMfaStart } from '@/src/services/superadminMfaApi';
import { supabase } from '@/src/services/supabaseClient';
import { fetchTempPasswordStatus } from '@/src/services/tempPasswordApi';
import { roleUsesTempPassword } from '@/src/utils/tempPasswordPolicy';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';
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

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const PAGE_BG = '#FFFFFF';
const TEXT_MUTED = '#64748B';
const SUBTLE_BORDER = '#E2E8F0';

const WOVELLO_LOGO = BrandAssets.poweredByWovello;

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

export type LoginScreenProps = {
  /**
   * Branded welcome entry (logo + tagline + powered by).
   * No back button — this is the app’s main sign-in screen.
   */
  asWelcome?: boolean;
};

export default function LoginScreen({ asWelcome = false }: LoginScreenProps) {
  const { t, i18n } = useTranslation();
  const colors = useAppThemeColors();
  const insets = useSafeAreaInsets();
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
  const [secretTapCount, setSecretTapCount] = useState(0);
  /** Hidden 7-tap fills designated superadmin email — switch field to email mode. */
  const [emailLoginOverride, setEmailLoginOverride] = useState(false);

  const hasRoleContext = role === 'admin' || role === 'teacher' || role === 'parent' || role === 'parent_student';
  const isAdminLogin = role === 'admin';
  const useMobileLoginField = !isAdminLogin && !emailLoginOverride;
  const showSignupLink = role !== 'admin';
  const signupRoleParam = role === 'teacher' ? 'teacher' : role === 'parent' || role === 'parent_student' ? 'parent_student' : undefined;
  const signupLinkLabel = t('auth.createAccount');
  const useLoginOnlyHeading = asWelcome || role === 'admin' || !hasRoleContext;
  const roleLabel = useMemo(() => t(roleLabelKey(role)), [role, t]);
  const identifierLabel = isAdminLogin || emailLoginOverride ? t('auth.identifierEmail') : t('auth.identifier');
  const identifierPlaceholder =
    isAdminLogin || emailLoginOverride
      ? t('auth.identifierEmailPlaceholder')
      : t('auth.identifierPlaceholder');

  const wovelloLogo = WOVELLO_LOGO;

  const handleHiddenSuperadminAccess = useCallback(() => {
    setSecretTapCount((prev) => {
      const next = prev + 1;
      if (next >= 7) {
        setEmailLoginOverride(true);
        setIdentifier(DESIGNATED_SUPERADMIN_EMAIL);
        return 0;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    void (async () => {
      const lang = await getStoredLanguagePreference();
      if (lang) await i18n.changeLanguage(lang);
    })();
  }, [i18n]);

  useEffect(() => {
    if (superadmin_hint === '1') {
      setEmailLoginOverride(true);
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

    if (useMobileLoginField) {
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
    if (useMobileLoginField) {
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
    return <BrandLoadingScreen accessibilityLabel="Loading" />;
  }

  return (
    <WebPhoneShell backdropColor={colors.page} contentStyle={{ backgroundColor: colors.page }}>
      <SafeAreaView
        style={[styles.safe, { backgroundColor: asWelcome ? colors.brandSurface : colors.page }]}
        edges={asWelcome ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']}>
        <View style={[styles.pageCol, { backgroundColor: colors.page, flex: 1 }]}>
          {asWelcome ? (
            <LinearGradient
              colors={[...colors.brandSurfaceGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.welcomeHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.appName')}
                onPress={handleHiddenSuperadminAccess}
                style={styles.brandTitleTapZone}>
                <MyTuitionLogo variant="full" showWordmark style={styles.fullLogo} />
              </Pressable>
              <Text style={[styles.brandTagline, { color: colors.brandBlueDark }]}>
                {t('languageSelect.tagline')}
              </Text>
            </LinearGradient>
          ) : null}

          <KeyboardAwareScrollView
            style={[styles.scroll, { backgroundColor: colors.page }]}
            contentContainerStyle={styles.content}
            keyboardExtraPadding={32}>
            <View style={styles.navRow}>
              {!asWelcome ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('auth.back')}
                  onPress={() => routerBackOrReplace(router, appHref(AppRoutes.roleSelect))}
                  style={({ pressed }) => [styles.backCompact, pressed && styles.backRowPressed]}>
                  <Ionicons name="chevron-back" size={22} color={colors.brandBlueDark} />
                  <Text style={[styles.backText, { color: colors.brandBlueDark }]}>{t('auth.back')}</Text>
                </Pressable>
              ) : null}
              <View style={styles.navRowSpacer} />
              <LanguageLnToggle />
            </View>

          <Pressable
            accessibilityRole="header"
            accessibilityLabel={
              asWelcome
                ? t('roleSelect.welcome')
                : useLoginOnlyHeading
                  ? t('auth.titleLoginOnly')
                  : t('auth.title')
            }
            onPress={handleHiddenSuperadminAccess}
            style={styles.headingTapZone}>
            <Text style={[styles.heading, { color: colors.brandBlueDark }]}>
              {asWelcome
                ? t('roleSelect.welcome')
                : useLoginOnlyHeading
                  ? t('auth.titleLoginOnly')
                  : t('auth.title')}
            </Text>
          </Pressable>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {asWelcome
              ? t('auth.subtitleNoRole')
              : hasRoleContext
                ? t('auth.subtitle', { role: roleLabel })
                : t('auth.subtitleNoRole')}
          </Text>

          <View style={styles.formCard}>
            {useMobileLoginField ? (
              <SriLankaMobileInput
                value={mobileNumber}
                onChangeText={(value) => {
                  setMobileNumber(value);
                  setErrorMessage(null);
                }}
                label={t('auth.identifier')}
                placeholder={t('auth.identifierPlaceholder')}
                labelStyle={styles.label}
                inputStyle={styles.input}
                showHint={false}
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
                    ...(signupRoleParam ? { params: { role: signupRoleParam } } : {}),
                  })
                }
                style={styles.signupWrap}>
                <Text style={styles.signupText}>{signupLinkLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </KeyboardAwareScrollView>

        {asWelcome ? (
          <LinearGradient
            colors={[...colors.brandSurfaceGradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.poweredFooter,
              {
                paddingBottom: Math.max(insets.bottom, 12),
                borderTopColor: colors.border,
              },
            ]}>
            <Text style={[styles.poweredLabel, { color: colors.textMuted }]}>
              {t('roleSelect.poweredBy')}
            </Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Wovello"
              onPress={() => {
                void Linking.openURL(WOVELLO_WEBSITE_URL).catch(() => undefined);
              }}
              hitSlop={8}>
              <Image
                source={wovelloLogo}
                style={styles.wovelloLogo}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
            </Pressable>
          </LinearGradient>
        ) : null}
        </View>
      </SafeAreaView>
    </WebPhoneShell>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  pageCol: {
    flex: 1,
  },
  welcomeHeader: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 8,
    alignItems: 'center',
  },
  brandTitleTapZone: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignItems: 'center',
  },
  fullLogo: {
    marginBottom: 8,
  },
  brandTagline: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  poweredFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 14,
    paddingHorizontal: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  poweredLabel: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  wovelloLogo: {
    height: 15,
    width: 73,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
  },
  headingTapZone: {
    alignSelf: 'flex-start',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
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
        shadowColor: '#041830',
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
    backgroundColor: '#E3F2FD',
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
