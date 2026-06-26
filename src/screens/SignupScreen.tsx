import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import { LanguageLnToggle } from '@/src/components/LanguageLnToggle';
import { isDesignatedSuperadminMfaEmail } from '@/src/constants/superadminMfa';
import { AppRoutes, appHref, dashboardRouteForProfileRole, type ProfileRole } from '@/src/navigation/AppNavigator';
import { recordLoginSessionSecurity } from '@/src/services/loginSessionSecurityApi';
import { getStoredLanguagePreference } from '@/src/services/languagePreference';
import { signupPublic } from '@/src/services/signupPublicApi';
import { supabase } from '@/src/services/supabaseClient';
import { normalizeNicInput } from '@/src/utils/nic';
import { normalizeValidEmail } from '@/src/utils/emailValidation';
import { SriLankaMobileInput } from '@/src/components/auth/SriLankaMobileInput';
import { parseSriLankaMobile, syntheticEmailFromPhoneE164 } from '@/src/utils/loginIdentifier';
import {
  firstSignupFieldError,
  sanitizeNicInput,
  type SignupFieldErrors,
  type SignupFieldKey,
  validateParentSignupFields,
  validateTeacherSignupFields,
} from '@/src/utils/signupValidation';
import { showLoginSecurityAlert } from '@/src/utils/showLoginSecurityAlert';
import { maybeShowAppLockRegistrationPrompt } from '@/src/utils/appLockRegistrationPrompt';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';
import {
  appBorder,
  appBrandBlue,
  appBrandBlueDark,
  appPageSurface,
  appSurface,
  appTextMuted,
} from '@/src/theme/appBrandPalette';

const BRAND_BLUE = appBrandBlue;
const BRAND_BLUE_DARK = appBrandBlueDark;
const PAGE_BG = appSurface;
const TEXT_MUTED = appTextMuted;
const SUBTLE_BORDER = appBorder;

function signupRoleLabelKey(role: string | undefined): string {
  return role === 'teacher' ? 'roleSelect.roles.teacher' : 'roleSelect.roles.parentStudent';
}

function FieldInlineError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <Text style={styles.fieldErrorText}>{message}</Text>;
}

export default function SignupScreen() {
  const { t, i18n } = useTranslation();
  const { role: roleRaw } = useLocalSearchParams<{ role?: string | string[] }>();
  const role = Array.isArray(roleRaw) ? roleRaw[0] : roleRaw;
  const blockedAdminSignup = role === 'admin';
  const isTeacherSignup = role === 'teacher';
  const isParentStudentSignup = role === 'parent' || role === 'parent_student';
  const isSignupAllowed = isTeacherSignup || isParentStudentSignup;
  const loginRoleParam = isTeacherSignup ? 'teacher' : 'parent_student';

  useEffect(() => {
    void (async () => {
      const lang = await getStoredLanguagePreference();
      if (lang) await i18n.changeLanguage(lang);
    })();
  }, [i18n]);

  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [nicNumber, setNicNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const validate = () => {
    const errors = isParentStudentSignup
      ? validateParentSignupFields({
          fullName,
          mobileNumber,
          nicNumber,
          email,
          password,
          acceptTerms,
        })
      : validateTeacherSignupFields({
          fullName,
          nicNumber,
          email,
          password,
          acceptTerms,
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

  const handleForgotPassword = async () => {
    setErrorMessage(null);
    const resetEmail = normalizeValidEmail(email);
    if (!resetEmail) {
      setFieldErrors((prev) => ({ ...prev, email: 'signup.errors.emailInvalid' }));
      setErrorMessage(t('auth.errors.forgotNeedsEmail'));
      return;
    }

    clearFieldError('email');
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail);
    if (error) {
      setErrorMessage(error.message || t('auth.errors.forgotFailed'));
      return;
    }

    appAlert(t('auth.forgotPassword'), t('auth.resetSent'));
  };

  const handleSignup = async () => {
    setErrorMessage(null);
    if (!validate()) return;

    setIsSubmitting(true);
    const roleForDb: ProfileRole = isTeacherSignup ? 'teacher' : 'parent_student';

    const exemptFromNic =
      !isParentStudentSignup && isDesignatedSuperadminMfaEmail(email.trim());
    const normalizedNic = exemptFromNic ? null : normalizeNicInput(nicNumber);
    const phoneE164 = isParentStudentSignup ? parseSriLankaMobile(mobileNumber) : null;

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

    const contactEmail = normalizeValidEmail(email);

    const created = await signupPublic(
      isParentStudentSignup
        ? {
            mobile_number: phoneE164 ?? mobileNumber.trim(),
            ...(contactEmail ? { email: contactEmail } : {}),
            password,
            full_name: fullName.trim(),
            role: roleForDb,
            nic_number: normalizedNic ?? '',
          }
        : {
            email: contactEmail ?? email.trim(),
            password,
            full_name: fullName.trim(),
            role: roleForDb,
            nic_number: normalizedNic ?? '',
          },
    );

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
              : err === 'invalid_email'
                ? t('signup.errors.emailInvalid')
                : err === 'email_required'
                  ? t('signup.errors.emailRequired')
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

    const authEmail =
      created.authEmail ??
      (phoneE164 ? syntheticEmailFromPhoneE164(phoneE164) : contactEmail ?? '');

    if (!authEmail) {
      setIsSubmitting(false);
      setErrorMessage(t('signup.errors.signupFailed'));
      return;
    }

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password,
    });

    if (signInError || !signInData.session) {
      setIsSubmitting(false);
      const rawMsg = (signInError?.message ?? '').toLowerCase();
      const rateLimited =
        rawMsg.includes('rate limit') || signInError?.code === 'over_email_send_rate_limit';
      setErrorMessage(
        rateLimited ? t('signup.errors.emailRateLimited') : signInError?.message || t('auth.errors.loginFailed'),
      );
      return;
    }

    setIsSubmitting(false);
    const securityResult = await recordLoginSessionSecurity();
    showLoginSecurityAlert(t, securityResult);
    router.replace(appHref(dashboardRouteForProfileRole(roleForDb)));
    if (isParentStudentSignup && role === 'parent_student') {
      void maybeShowAppLockRegistrationPrompt(router, t);
    }
  };

  if (blockedAdminSignup) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <KeyboardAwareScrollView
          style={styles.scroll}
          contentContainerStyle={styles.contentBlocked}
          keyboardShouldPersistTaps="handled">
          <View style={styles.navRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('auth.back')}
              onPress={() => router.replace(AppRoutes.roleSelect)}
              style={({ pressed }) => [styles.backCompact, pressed && styles.backRowPressed]}>
              <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
              <Text style={styles.backText}>{t('auth.back')}</Text>
            </Pressable>
            <View style={styles.navRowSpacer} />
            <LanguageLnToggle />
          </View>
          <Text style={styles.heading}>{t('signup.adminSignupBlockedTitle')}</Text>
          <Text style={styles.subtitle}>{t('signup.adminSignupBlockedBody')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('signup.adminSignupGoToLogin')}
            onPress={() => router.replace({ pathname: AppRoutes.login, params: { role: 'admin' } })}
            style={({ pressed }) => [styles.signupButton, pressed && styles.signupButtonPressed]}>
            <Text style={styles.signupButtonText}>{t('signup.adminSignupGoToLogin')}</Text>
          </Pressable>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    );
  }

  if (!isSignupAllowed) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <KeyboardAwareScrollView
          style={styles.scroll}
          contentContainerStyle={styles.contentBlocked}
          keyboardShouldPersistTaps="handled">
          <View style={styles.navRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('auth.back')}
              onPress={() => router.replace(AppRoutes.roleSelect)}
              style={({ pressed }) => [styles.backCompact, pressed && styles.backRowPressed]}>
              <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
              <Text style={styles.backText}>{t('auth.back')}</Text>
            </Pressable>
            <View style={styles.navRowSpacer} />
            <LanguageLnToggle />
          </View>
          <Text style={styles.heading}>{t('signup.nonTeacherSignupBlockedTitle')}</Text>
          <Text style={styles.subtitle}>{t('signup.nonTeacherSignupBlockedBody')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('signup.nonTeacherSignupGoToLogin')}
            onPress={() => router.replace(AppRoutes.roleSelect)}
            style={({ pressed }) => [styles.signupButton, pressed && styles.signupButtonPressed]}>
            <Text style={styles.signupButtonText}>{t('signup.nonTeacherSignupChooseRole')}</Text>
          </Pressable>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <View style={styles.navRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('auth.back')}
            onPress={() =>
              routerBackOrReplace(router, {
                pathname: AppRoutes.login,
                params: { role: loginRoleParam },
              })
            }
            style={({ pressed }) => [styles.backCompact, pressed && styles.backRowPressed]}>
            <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
            <Text style={styles.backText}>{t('auth.back')}</Text>
          </Pressable>
          <View style={styles.navRowSpacer} />
          <LanguageLnToggle />
        </View>

        <Text style={styles.heading}>
          {isParentStudentSignup ? t('signup.parentTitle') : t('signup.title')}
        </Text>
        <Text style={styles.subtitle}>{t('signup.roleContext', { role: t(signupRoleLabelKey(role)) })}</Text>

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

          {isParentStudentSignup ? (
            <>
              <SriLankaMobileInput
                value={mobileNumber}
                onChangeText={(value) => {
                  setMobileNumber(value);
                  clearFieldError('mobileNumber');
                }}
                label={t('signup.username')}
                errorMessage={fieldErrorMessage('mobileNumber')}
                labelStyle={[styles.label, styles.fieldTop]}
                inputStyle={[styles.input, fieldErrors.mobileNumber && styles.inputError]}
                showHint={!fieldErrors.mobileNumber}
              />

              <Text style={[styles.label, styles.fieldTop]}>{t('signup.idNumber')}</Text>
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
                keyboardType="default"
                style={[styles.input, fieldErrors.nicNumber && styles.inputError]}
                placeholderTextColor="#94A3B8"
              />
              <FieldInlineError message={fieldErrorMessage('nicNumber')} />
              {!fieldErrors.nicNumber ? (
                <Text style={styles.nicHint}>{t('signup.nicHint')}</Text>
              ) : null}

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
            </>
          ) : (
            <>
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
                    keyboardType="default"
                    style={[styles.input, fieldErrors.nicNumber && styles.inputError]}
                    placeholderTextColor="#94A3B8"
                  />
                  <FieldInlineError message={fieldErrorMessage('nicNumber')} />
                  {!fieldErrors.nicNumber ? (
                    <Text style={styles.nicHint}>{t('signup.nicHint')}</Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.exemptHint}>{t('signup.superadminNicExempt')}</Text>
              )}

              <Text style={[styles.label, styles.fieldTop]}>{t('signup.identifier')}</Text>
              <TextInput
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  clearFieldError('email');
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder={t('signup.identifierPlaceholder')}
                style={[styles.input, fieldErrors.email && styles.inputError]}
                placeholderTextColor="#94A3B8"
                maxLength={254}
              />
              <FieldInlineError message={fieldErrorMessage('email')} />
            </>
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
              style={[styles.input, styles.passwordInput, fieldErrors.password && styles.inputError]}
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

          <Pressable onPress={() => void handleForgotPassword()} style={styles.forgotWrap}>
            <Text style={styles.forgotText}>{t('auth.forgotPassword')}</Text>
          </Pressable>

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
            accessibilityLabel={t(isTeacherSignup ? 'signup.createAccountTeacher' : 'signup.createAccount')}
            onPress={handleSignup}
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
                params: { role: loginRoleParam },
              })
            }
            style={styles.loginLinkWrap}>
            <Text style={styles.loginLinkText}>{t('auth.login')}</Text>
          </Pressable>
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
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
  },
  contentBlocked: {
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
  secondaryLinkWrap: {
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 4,
  },
  secondaryLinkText: {
    color: BRAND_BLUE,
    fontSize: 14,
    fontWeight: '700',
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
  fieldTop: {
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
  inputError: {
    borderColor: '#DC2626',
  },
  fieldErrorText: {
    marginTop: 6,
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
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
    marginTop: 10,
    paddingVertical: 4,
  },
  forgotText: {
    color: BRAND_BLUE,
    fontSize: 13,
    fontWeight: '700',
  },
  termsRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  termsCheckboxBtn: {
    paddingTop: 1,
  },
  termsText: {
    flex: 1,
    color: TEXT_MUTED,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  termsLink: {
    color: BRAND_BLUE,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  errorText: {
    marginTop: 12,
    color: '#B91C1C',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
  },
  signupButton: {
    marginTop: 16,
    backgroundColor: BRAND_BLUE,
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  signupButtonPressed: {
    backgroundColor: BRAND_BLUE_DARK,
  },
  signupButtonDisabled: {
    opacity: 0.85,
  },
  signupButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
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
  nicHint: {
    marginTop: 6,
    fontSize: 12,
    color: TEXT_MUTED,
    fontWeight: '500',
    lineHeight: 17,
  },
  exemptHint: {
    marginTop: 14,
    fontSize: 13,
    color: TEXT_MUTED,
    fontWeight: '600',
    lineHeight: 19,
  },
});
