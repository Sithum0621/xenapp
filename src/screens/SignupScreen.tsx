import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SriLankaMobileInput } from '@/src/components/auth/SriLankaMobileInput';
import MyTuitionLogo from '@/src/components/brand/MyTuitionLogo';
import { LanguageLnToggle } from '@/src/components/LanguageLnToggle';
import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import { WebPhoneShell } from '@/src/components/layout/WebPhoneShell';
import { BrandAssets, WOVELLO_WEBSITE_URL } from '@/src/constants/brand';
import { isDesignatedSuperadminMfaEmail } from '@/src/constants/superadminMfa';
import { useAppThemeColors } from '@/src/context/ThemePreferenceContext';
import {
  AppRoutes,
  appHref,
  dashboardRouteForProfileRole,
  type ProfileRole,
} from '@/src/navigation/AppNavigator';
import { recordLoginSessionSecurity } from '@/src/services/loginSessionSecurityApi';
import { getStoredLanguagePreference } from '@/src/services/languagePreference';
import { signupMobileOtpSend, signupMobileOtpVerify } from '@/src/services/signupMobileOtpApi';
import { signupPublic } from '@/src/services/signupPublicApi';
import { supabase } from '@/src/services/supabaseClient';
import {
  appBorder,
  appBrandBlue,
  appBrandBlueDark,
  appBrandMy,
  appPageSurface,
  appTextMuted,
} from '@/src/theme/appBrandPalette';
import { maybeShowAppLockRegistrationPrompt } from '@/src/utils/appLockRegistrationPrompt';
import { normalizeValidEmail } from '@/src/utils/emailValidation';
import { parseSriLankaMobile, syntheticEmailFromPhoneE164 } from '@/src/utils/loginIdentifier';
import { normalizeNicInput } from '@/src/utils/nic';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';
import { showLoginSecurityAlert } from '@/src/utils/showLoginSecurityAlert';
import { isValidSriLankaMobile } from '@/src/utils/sriLankaMobile';
import {
  firstSignupFieldError,
  sanitizeNicInput,
  type SignupFieldErrors,
  type SignupFieldKey,
  validateSignupFields,
} from '@/src/utils/signupValidation';

const BRAND_BLUE = appBrandBlue;
const BRAND_BLUE_DARK = appBrandBlueDark;
const BRAND_MY = appBrandMy;
const PAGE_BG = '#FFFFFF';
const TEXT_MUTED = appTextMuted;
const SUBTLE_BORDER = appBorder;

const WOVELLO_LOGO = BrandAssets.poweredByWovello;

type SignupSelectableRole = 'teacher' | 'parent';

const SIGNUP_ROLE_OPTIONS: { id: SignupSelectableRole; labelKey: string }[] = [
  { id: 'teacher', labelKey: 'roleSelect.roles.teacher' },
  { id: 'parent', labelKey: 'roleSelect.roles.parentStudent' },
];

function parseInitialSignupRole(roleRaw: string | undefined): SignupSelectableRole | null {
  if (roleRaw === 'teacher') return 'teacher';
  if (roleRaw === 'parent' || roleRaw === 'parent_student') return 'parent';
  return null;
}

function FieldInlineError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <Text style={styles.fieldErrorText}>{message}</Text>;
}

export default function SignupScreen() {
  const { t, i18n } = useTranslation();
  const colors = useAppThemeColors();
  const insets = useSafeAreaInsets();
  const { role: roleRaw } = useLocalSearchParams<{ role?: string | string[] }>();
  const roleParam = Array.isArray(roleRaw) ? roleRaw[0] : roleRaw;
  const blockedAdminSignup = roleParam === 'admin';

  const [signupRole, setSignupRole] = useState<SignupSelectableRole | null>(() =>
    parseInitialSignupRole(roleParam),
  );
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);

  const isTeacherSignup = signupRole === 'teacher';
  const isParentStudentSignup = signupRole === 'parent';
  const loginRoleParam = isTeacherSignup ? 'teacher' : 'parent_student';

  useEffect(() => {
    void (async () => {
      const lang = await getStoredLanguagePreference();
      if (lang) await i18n.changeLanguage(lang);
    })();
  }, [i18n]);

  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpChallenge, setOtpChallenge] = useState<string | null>(null);
  const [mobileOtpToken, setMobileOtpToken] = useState<string | null>(null);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpInfo, setOtpInfo] = useState<string | null>(null);
  /** Seconds left before Resend is allowed (2 min after successful send). */
  const [otpResendInSec, setOtpResendInSec] = useState(0);
  const [nicNumber, setNicNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mobileVerified = Boolean(mobileOtpToken);
  const showOtpEntry = Boolean(otpChallenge) && !mobileVerified;
  const canResendOtp = otpResendInSec <= 0 && !otpSending && !mobileVerified;
  const wovelloLogo = WOVELLO_LOGO;

  const selectedRoleLabel = useMemo(() => {
    if (!signupRole) return t('signup.rolePlaceholder');
    const opt = SIGNUP_ROLE_OPTIONS.find((o) => o.id === signupRole);
    return opt ? t(opt.labelKey) : t('signup.rolePlaceholder');
  }, [signupRole, t]);

  const otpCountdownLabel = useMemo(() => {
    if (otpResendInSec <= 0) return null;
    const m = Math.floor(otpResendInSec / 60);
    const s = otpResendInSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }, [otpResendInSec]);

  useEffect(() => {
    if (otpResendInSec <= 0) return undefined;
    const id = setTimeout(() => {
      setOtpResendInSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearTimeout(id);
  }, [otpResendInSec]);

  const clearFieldError = (field: SignupFieldKey) => {
    setErrorMessage(null);
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const fieldErrorMessage = (field: SignupFieldKey): string | null => {
    const key = fieldErrors[field];
    return key ? t(key) : null;
  };

  const resetMobileVerification = () => {
    setOtpChallenge(null);
    setMobileOtpToken(null);
    setOtpCode('');
    setOtpInfo(null);
    setOtpResendInSec(0);
    clearFieldError('otp');
  };

  const handleSendOtp = async () => {
    setErrorMessage(null);
    clearFieldError('mobileNumber');
    clearFieldError('otp');
    clearFieldError('email');

    if (!isValidSriLankaMobile(mobileNumber)) {
      setFieldErrors((prev) => ({ ...prev, mobileNumber: 'signup.errors.mobileInvalid' }));
      setErrorMessage(t('signup.errors.mobileInvalid'));
      return;
    }
    const emailNorm = email.trim() ? normalizeValidEmail(email) : null;
    if (email.trim() && !emailNorm) {
      setFieldErrors((prev) => ({ ...prev, email: 'signup.errors.emailInvalid' }));
      setErrorMessage(t('signup.errors.emailInvalid'));
      return;
    }

    setOtpSending(true);
    setMobileOtpToken(null);
    const result = await signupMobileOtpSend({
      mobileNumber: mobileNumber.trim(),
      email: emailNorm ?? undefined,
    });
    setOtpSending(false);

    if (!result.ok || !result.otpChallenge) {
      const msg =
        result.error === 'invalid_mobile'
          ? t('signup.errors.mobileInvalid')
          : result.error === 'otp_cooldown' || result.error === 'otp_rate_limited'
            ? t('signup.errors.otpSendFailed')
            : result.error === 'otp_delivery_failed'
              ? t('signup.errors.otpSendFailed')
              : t('signup.errors.otpSendFailed');
      setErrorMessage(msg);
      return;
    }

    setOtpChallenge(result.otpChallenge);
    setOtpCode('');
    setOtpResendInSec(120);
    setOtpInfo(
      result.delivery === 'sms'
        ? t('signup.otpSentSms')
        : result.delivery === 'email'
          ? t('signup.otpSentEmail')
          : t('signup.otpSentDev'),
    );
  };

  const handleVerifyOtp = async () => {
    setErrorMessage(null);
    clearFieldError('otp');
    if (!otpChallenge) {
      setErrorMessage(t('signup.errors.otpSendFirst'));
      return;
    }
    if (!/^\d{6}$/.test(otpCode.trim())) {
      setFieldErrors((prev) => ({ ...prev, otp: 'signup.errors.otpInvalid' }));
      setErrorMessage(t('signup.errors.otpInvalid'));
      return;
    }

    setOtpVerifying(true);
    const result = await signupMobileOtpVerify({
      otpChallenge,
      code: otpCode.trim(),
    });
    setOtpVerifying(false);

    if (!result.ok || !result.verifiedToken) {
      const msg =
        result.error === 'wrong_code' || result.error === 'invalid_code'
          ? t('signup.errors.otpWrong')
          : result.error === 'challenge_expired'
            ? t('signup.errors.otpExpired')
            : t('signup.errors.otpVerifyFailed');
      setErrorMessage(msg);
      setMobileOtpToken(null);
      return;
    }

    setMobileOtpToken(result.verifiedToken);
    setOtpResendInSec(0);
    setOtpInfo(t('signup.otpVerified'));
    clearFieldError('otp');
  };

  const validate = () => {
    if (!signupRole) {
      setErrorMessage(t('signup.errors.roleRequired'));
      return false;
    }

    const errors = validateSignupFields({
      fullName,
      mobileNumber,
      nicNumber,
      email,
      password,
      acceptTerms,
      mobileVerified,
      exemptFromNic: isDesignatedSuperadminMfaEmail(email.trim()),
    });

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstKey = firstSignupFieldError(errors);
      setErrorMessage(firstKey ? t(firstKey) : t('signup.errors.required'));
      return false;
    }

    setFieldErrors({});
    setErrorMessage(null);
    return true;
  };

  const handleSignup = async () => {
    setErrorMessage(null);
    if (!validate()) return;
    if (!mobileOtpToken) {
      setErrorMessage(t('signup.errors.mobileOtpRequired'));
      return;
    }

    setIsSubmitting(true);
    const roleForDb: ProfileRole = isTeacherSignup ? 'teacher' : 'parent_student';
    const exemptFromNic = isDesignatedSuperadminMfaEmail(email.trim());
    const normalizedNic = exemptFromNic ? null : normalizeNicInput(nicNumber);
    const phoneE164 = parseSriLankaMobile(mobileNumber);
    const contactEmail = email.trim() ? normalizeValidEmail(email) : null;
    if (email.trim() && !contactEmail) {
      setIsSubmitting(false);
      setErrorMessage(t('signup.errors.emailInvalid'));
      return;
    }

    if (!phoneE164) {
      setIsSubmitting(false);
      setErrorMessage(t('signup.errors.required'));
      return;
    }

    if (!exemptFromNic && normalizedNic) {
      const { data: nicAvailable, error: nicErr } = await supabase.rpc('signup_nic_available', {
        p_nic: normalizedNic,
      });

      if (nicErr) {
        setIsSubmitting(false);
        setErrorMessage(nicErr.message || t('signup.errors.nicCheckFailed'));
        return;
      }

      if (nicAvailable !== true) {
        setIsSubmitting(false);
        setErrorMessage(t('signup.errors.nicTaken'));
        return;
      }
    }

    const created = await signupPublic({
      mobile_number: phoneE164,
      mobile_otp_token: mobileOtpToken,
      email: contactEmail ?? undefined,
      password,
      full_name: fullName.trim(),
      role: roleForDb,
      nic_number: normalizedNic ?? '',
    });

    if (!created.ok) {
      setIsSubmitting(false);
      const err = created.error;
      const fallbackDetail = created.detail?.trim();
      const message =
        err === 'nic_taken'
          ? t('signup.errors.nicTaken')
          : err === 'invalid_nic'
            ? t('signup.errors.nicInvalid')
            : err === 'invalid_mobile'
              ? t('signup.errors.mobileInvalid')
              : err === 'mobile_not_verified'
                ? t('signup.errors.mobileOtpRequired')
                : err === 'invalid_email'
                  ? t('signup.errors.emailInvalid')
                  : err === 'email_exists'
                    ? t('signup.errors.mobileOrEmailExists')
                    : err === 'validation_failed'
                      ? fallbackDetail === 'password'
                        ? t('signup.errors.passwordMin')
                        : fallbackDetail === 'full_name'
                          ? t('signup.errors.fullNameRequired')
                          : t('signup.errors.required')
                      : err === 'network_error' || err === 'invoke_failed' || err === 'edge_http_error'
                        ? t('signup.errors.edgeSignupUnavailable')
                        : fallbackDetail || t('signup.errors.signupFailed');
      setErrorMessage(message);
      return;
    }

    const authEmail = created.authEmail ?? syntheticEmailFromPhoneE164(phoneE164);

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password,
    });

    if (signInError || !signInData.session) {
      setIsSubmitting(false);
      setErrorMessage(signInError?.message || t('auth.errors.loginFailed'));
      return;
    }

    setIsSubmitting(false);
    const securityResult = await recordLoginSessionSecurity();
    showLoginSecurityAlert(t, securityResult);
    router.replace(appHref(dashboardRouteForProfileRole(roleForDb)));
    if (isParentStudentSignup) {
      void maybeShowAppLockRegistrationPrompt(router, t);
    }
  };

  if (blockedAdminSignup) {
    return (
      <WebPhoneShell backdropColor={colors.page} contentStyle={{ backgroundColor: colors.page }}>
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.page }]} edges={['top', 'left', 'right', 'bottom']}>
          <KeyboardAwareScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled">
            <View style={styles.navRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('auth.back')}
                onPress={() => router.replace(AppRoutes.roleSelect)}
                style={({ pressed }) => [styles.backCompact, pressed && styles.backRowPressed]}>
                <Ionicons name="chevron-back" size={22} color={colors.brandBlueDark} />
                <Text style={[styles.backText, { color: colors.brandBlueDark }]}>{t('auth.back')}</Text>
              </Pressable>
              <View style={styles.navRowSpacer} />
              <LanguageLnToggle />
            </View>
            <Text style={[styles.heading, { color: colors.brandBlueDark }]}>
              {t('signup.adminSignupBlockedTitle')}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {t('signup.adminSignupBlockedBody')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('signup.adminSignupGoToLogin')}
              onPress={() => router.replace({ pathname: AppRoutes.login, params: { role: 'admin' } })}
              style={({ pressed }) => [styles.signupButton, pressed && styles.signupButtonPressed]}>
              <Text style={styles.signupButtonText}>{t('signup.adminSignupGoToLogin')}</Text>
            </Pressable>
          </KeyboardAwareScrollView>
        </SafeAreaView>
      </WebPhoneShell>
    );
  }

  return (
    <WebPhoneShell backdropColor={colors.page} contentStyle={{ backgroundColor: colors.page }}>
      <SafeAreaView
        style={[styles.safe, { backgroundColor: colors.brandSurface }]}
        edges={['top', 'left', 'right']}>
        <View style={[styles.pageCol, { backgroundColor: colors.page, flex: 1 }]}>
          <LinearGradient
            colors={[...colors.brandSurfaceGradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.welcomeHeader}>
            <MyTuitionLogo variant="full" showWordmark style={styles.fullLogo} />
            <Text style={[styles.brandTagline, { color: colors.brandBlueDark }]}>
              {t('languageSelect.tagline')}
            </Text>
          </LinearGradient>

          <KeyboardAwareScrollView
            style={[styles.scroll, { backgroundColor: colors.page }]}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardExtraPadding={32}>
            <View style={styles.navRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('auth.back')}
                onPress={() => routerBackOrReplace(router, AppRoutes.roleSelect)}
                style={({ pressed }) => [styles.backCompact, pressed && styles.backRowPressed]}>
                <Ionicons name="chevron-back" size={22} color={colors.brandBlueDark} />
                <Text style={[styles.backText, { color: colors.brandBlueDark }]}>{t('auth.back')}</Text>
              </Pressable>
              <View style={styles.navRowSpacer} />
              <LanguageLnToggle />
            </View>

            <Text style={[styles.heading, { color: colors.brandBlueDark }]} accessibilityRole="header">
              {t('signup.title')}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {t('auth.subtitleNoRole')}
            </Text>

            <View style={styles.formCard}>
              <Text style={styles.label}>{t('signup.fullName')}</Text>
              <TextInput
                value={fullName}
                onChangeText={(value) => {
                  setFullName(value);
                  clearFieldError('fullName');
                }}
                placeholder={t('signup.fullNamePlaceholder')}
                style={[styles.input, fieldErrors.fullName && styles.inputError]}
                placeholderTextColor="#94A3B8"
                maxLength={120}
                autoCapitalize="words"
                autoCorrect={false}
              />
              <FieldInlineError message={fieldErrorMessage('fullName')} />

              <Text style={[styles.label, styles.fieldTop]}>{t('signup.roleLabel')}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('signup.roleLabel')}
                accessibilityState={{ expanded: roleMenuOpen }}
                onPress={() => setRoleMenuOpen(true)}
                style={({ pressed }) => [
                  styles.roleDropdown,
                  signupRole && styles.roleDropdownSelected,
                  pressed && styles.roleDropdownPressed,
                ]}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.roleDropdownText,
                    !signupRole && styles.roleDropdownPlaceholder,
                  ]}>
                  {selectedRoleLabel}
                </Text>
                <Ionicons name="chevron-down" size={20} color={BRAND_BLUE_DARK} />
              </Pressable>

              <Modal
                visible={roleMenuOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setRoleMenuOpen(false)}>
                <View style={styles.roleModalRoot}>
                  <Pressable
                    style={styles.roleModalBackdrop}
                    onPress={() => setRoleMenuOpen(false)}
                    accessibilityLabel={t('auth.languageMenuDismiss')}
                  />
                  <View style={styles.roleModalCard}>
                    <Text style={styles.roleModalTitle}>{t('signup.roleLabel')}</Text>
                    {SIGNUP_ROLE_OPTIONS.map(({ id, labelKey }) => {
                      const active = signupRole === id;
                      return (
                        <Pressable
                          key={id}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          onPress={() => {
                            setSignupRole(id);
                            setRoleMenuOpen(false);
                            setErrorMessage(null);
                          }}
                          style={({ pressed }) => [
                            styles.roleOption,
                            active && styles.roleOptionActive,
                            pressed && styles.roleDropdownPressed,
                          ]}>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.roleOptionText,
                              active && styles.roleOptionTextActive,
                            ]}>
                            {t(labelKey)}
                          </Text>
                          {active ? (
                            <Ionicons name="checkmark-circle" size={22} color={BRAND_MY} />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </Modal>

              <Text style={[styles.label, styles.fieldTop]}>{t('signup.emailOptional')}</Text>
              <TextInput
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  clearFieldError('email');
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder={t('signup.emailOptionalPlaceholder')}
                style={[styles.input, fieldErrors.email && styles.inputError]}
                placeholderTextColor="#94A3B8"
                maxLength={254}
              />
              <FieldInlineError message={fieldErrorMessage('email')} />

              <SriLankaMobileInput
                value={mobileNumber}
                onChangeText={(value) => {
                  setMobileNumber(value);
                  clearFieldError('mobileNumber');
                  if (mobileVerified || otpChallenge) resetMobileVerification();
                }}
                label={t('signup.mobileNumber')}
                errorMessage={fieldErrorMessage('mobileNumber')}
                labelStyle={[styles.label, styles.fieldTop]}
                inputStyle={[styles.input, fieldErrors.mobileNumber && styles.inputError]}
                showHint={false}
              />

              <View style={styles.otpRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    !canResendOtp && otpCountdownLabel
                      ? t('signup.resendOtpIn', { time: otpCountdownLabel })
                      : t('signup.sendOtp')
                  }
                  disabled={!canResendOtp || mobileVerified}
                  onPress={() => void handleSendOtp()}
                  style={({ pressed }) => [
                    styles.otpSecondaryBtn,
                    (!canResendOtp || mobileVerified) && styles.otpBtnDisabled,
                    pressed && styles.signupButtonPressed,
                  ]}>
                  {otpSending ? (
                    <ActivityIndicator color={BRAND_BLUE} />
                  ) : (
                    <Text style={styles.otpSecondaryBtnText}>
                      {otpChallenge && !mobileVerified
                        ? otpCountdownLabel
                          ? t('signup.resendOtpIn', { time: otpCountdownLabel })
                          : t('signup.resendOtp')
                        : t('signup.sendOtp')}
                    </Text>
                  )}
                </Pressable>
                {mobileVerified ? (
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="checkmark-circle" size={18} color="#15803D" />
                    <Text style={styles.verifiedText}>{t('signup.mobileVerified')}</Text>
                  </View>
                ) : null}
              </View>

              {showOtpEntry ? (
                <>
                  <Text style={[styles.label, styles.fieldTop]}>{t('signup.otpCode')}</Text>
                  <View style={styles.otpVerifyRow}>
                    <TextInput
                      value={otpCode}
                      onChangeText={(value) => {
                        setOtpCode(value.replace(/\D/g, '').slice(0, 6));
                        clearFieldError('otp');
                      }}
                      placeholder={t('signup.otpCodePlaceholder')}
                      keyboardType="number-pad"
                      maxLength={6}
                      style={[styles.input, styles.otpInput, fieldErrors.otp && styles.inputError]}
                      placeholderTextColor="#94A3B8"
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('signup.verifyOtp')}
                      disabled={otpVerifying}
                      onPress={() => void handleVerifyOtp()}
                      style={({ pressed }) => [
                        styles.otpPrimaryBtn,
                        otpVerifying && styles.otpBtnDisabled,
                        pressed && styles.signupButtonPressed,
                      ]}>
                      {otpVerifying ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.otpPrimaryBtnText}>{t('signup.verifyOtp')}</Text>
                      )}
                    </Pressable>
                  </View>
                  {otpCountdownLabel ? (
                    <Text style={styles.otpCountdown}>
                      {t('signup.otpCountdown', { time: otpCountdownLabel })}
                    </Text>
                  ) : null}
                  <FieldInlineError message={fieldErrorMessage('otp')} />
                </>
              ) : null}

              {otpInfo ? <Text style={styles.otpInfo}>{otpInfo}</Text> : null}

              {!isDesignatedSuperadminMfaEmail(email.trim()) ? (
                <>
                  <Text style={[styles.label, styles.fieldTop]}>{t('signup.nicNumber')}</Text>
                  <TextInput
                    value={nicNumber}
                    onChangeText={(value) => {
                      setNicNumber(sanitizeNicInput(value));
                      clearFieldError('nicNumber');
                    }}
                    placeholder={t('signup.nicPlaceholder')}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={14}
                    style={[styles.input, fieldErrors.nicNumber && styles.inputError]}
                    placeholderTextColor="#94A3B8"
                  />
                  <FieldInlineError message={fieldErrorMessage('nicNumber')} />
                </>
              ) : (
                <Text style={styles.exemptHint}>{t('signup.superadminNicExempt')}</Text>
              )}

              <Text style={[styles.label, styles.fieldTop]}>{t('signup.password')}</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    clearFieldError('password');
                  }}
                  secureTextEntry={!showPassword}
                  placeholder={t('signup.passwordPlaceholder')}
                  style={[
                    styles.input,
                    styles.passwordInput,
                    fieldErrors.password && styles.inputError,
                  ]}
                  placeholderTextColor="#94A3B8"
                  maxLength={128}
                  autoCapitalize="none"
                  autoCorrect={false}
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
              <FieldInlineError message={fieldErrorMessage('password')} />

              <View style={styles.termsRow}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: acceptTerms }}
                  onPress={() => {
                    setAcceptTerms((prev) => !prev);
                    clearFieldError('terms');
                  }}
                  style={styles.termsCheckboxBtn}>
                  <Ionicons
                    name={acceptTerms ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={acceptTerms ? BRAND_BLUE : TEXT_MUTED}
                  />
                </Pressable>
                <Text style={styles.termsText}>
                  {t(isTeacherSignup ? 'signup.termsTeacherPrefix' : 'signup.termsPrefix')}{' '}
                  <Text
                    accessibilityRole="link"
                    style={styles.termsLink}
                    onPress={() =>
                      router.push({
                        pathname: AppRoutes.termsAndConditions,
                        params: { variant: isTeacherSignup ? 'teacher' : 'parent' },
                      })
                    }>
                    {t(isTeacherSignup ? 'signup.termsTeacherLink' : 'signup.termsLink')}
                  </Text>
                  .
                </Text>
              </View>
              <FieldInlineError message={fieldErrorMessage('terms')} />

              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(
                  isTeacherSignup ? 'signup.createAccountTeacher' : 'signup.createAccount',
                )}
                onPress={() => void handleSignup()}
                disabled={isSubmitting}
                style={({ pressed }) => [
                  styles.signupButton,
                  pressed && styles.signupButtonPressed,
                  isSubmitting && styles.signupButtonDisabled,
                ]}>
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.signupButtonText}>
                    {t(isTeacherSignup ? 'signup.createAccountTeacher' : 'signup.createAccount')}
                  </Text>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('auth.login')}
                onPress={() =>
                  router.replace({
                    pathname: AppRoutes.login,
                    params: signupRole ? { role: loginRoleParam } : {},
                  })
                }
                style={styles.loginLinkWrap}>
                <Text style={styles.loginLinkText}>{t('auth.login')}</Text>
              </Pressable>
            </View>
          </KeyboardAwareScrollView>

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
    marginBottom: 16,
  },
  formCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: appPageSurface,
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
    fontSize: 14,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    marginBottom: 8,
  },
  fieldTop: {
    marginTop: 14,
  },
  input: {
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: BRAND_BLUE_DARK,
    backgroundColor: '#FFFFFF',
  },
  inputError: {
    borderColor: '#DC2626',
  },
  fieldErrorText: {
    marginTop: 6,
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '600',
  },
  roleDropdown: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  roleDropdownSelected: {
    borderColor: BRAND_MY,
  },
  roleDropdownPressed: {
    opacity: 0.92,
  },
  roleDropdownText: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
  roleDropdownPlaceholder: {
    color: TEXT_MUTED,
    fontWeight: '500',
  },
  roleModalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  roleModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  roleModalCard: {
    width: '100%',
    maxWidth: 472,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    padding: 16,
    gap: 8,
  },
  roleModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    marginBottom: 6,
  },
  roleOption: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: appPageSurface,
  },
  roleOptionActive: {
    borderColor: BRAND_MY,
    backgroundColor: 'rgba(30, 136, 229, 0.06)',
  },
  roleOptionText: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
  roleOptionTextActive: {
    color: BRAND_MY,
  },
  otpRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  otpVerifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  otpInput: {
    flex: 1,
  },
  otpSecondaryBtn: {
    borderWidth: 1.5,
    borderColor: BRAND_BLUE,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 42,
    justifyContent: 'center',
  },
  otpSecondaryBtnText: {
    color: BRAND_BLUE,
    fontWeight: '700',
    fontSize: 14,
  },
  otpPrimaryBtn: {
    backgroundColor: BRAND_BLUE,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  otpPrimaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  otpBtnDisabled: {
    opacity: 0.5,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  verifiedText: {
    color: '#15803D',
    fontSize: 13,
    fontWeight: '700',
  },
  otpInfo: {
    marginTop: 8,
    fontSize: 12,
    color: TEXT_MUTED,
    fontWeight: '500',
  },
  otpCountdown: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  exemptHint: {
    marginTop: 12,
    fontSize: 12,
    color: TEXT_MUTED,
  },
  passwordWrap: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 44,
  },
  eyeBtn: {
    position: 'absolute',
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    padding: 6,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 16,
  },
  termsCheckboxBtn: {
    paddingTop: 2,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    color: TEXT_MUTED,
    lineHeight: 19,
  },
  termsLink: {
    color: BRAND_BLUE,
    fontWeight: '700',
  },
  errorText: {
    marginTop: 12,
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '600',
  },
  signupButton: {
    marginTop: 18,
    backgroundColor: BRAND_BLUE,
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signupButtonPressed: {
    opacity: 0.9,
  },
  signupButtonDisabled: {
    opacity: 0.6,
  },
  signupButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  loginLinkWrap: {
    alignSelf: 'center',
    marginTop: 16,
    paddingVertical: 4,
  },
  loginLinkText: {
    color: BRAND_BLUE,
    fontSize: 14,
    fontWeight: '700',
  },
});
