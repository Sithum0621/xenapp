import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAwareModalFrame, KeyboardAwareScrollView } from '@/src/components/layout/scroll';

import { confirmPasswordReset } from '@/src/services/tempPasswordApi';
import { supabase } from '@/src/services/supabaseClient';
import {
  appBorder,
  appBrandBlue,
  appBrandBlueDark,
  appSurface,
  appTextMuted,
} from '@/src/theme/appBrandPalette';

const BRAND_BLUE_DARK = appBrandBlueDark;
const BRAND_BLUE = appBrandBlue;
const BORDER = appBorder;
const TEXT_MUTED = appTextMuted;
const SURFACE = appSurface;
const ERR = '#B42318';
const OK = '#0F7A4F';
const COMPACT_BREAKPOINT = 640;

const MIN_PASSWORD = 6;

export type ChangePasswordModalProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export default function ChangePasswordModal({
  visible,
  onClose,
  onSuccess,
}: ChangePasswordModalProps) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompact = width < COMPACT_BREAKPOINT;

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [okText, setOkText] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswords(false);
      setSubmitting(false);
      setErrorText(null);
      setOkText(null);
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (submitting) return;
    setErrorText(null);
    setOkText(null);

    const trimmedNew = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (trimmedNew.length < MIN_PASSWORD) {
      setErrorText(t('changePassword.errMinLength', { min: MIN_PASSWORD }));
      return;
    }
    if (trimmedNew !== trimmedConfirm) {
      setErrorText(t('changePassword.errMismatch'));
      return;
    }

    setSubmitting(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password: trimmedNew });
    if (updateErr) {
      setSubmitting(false);
      setErrorText(updateErr.message || t('changePassword.errUpdateFailed'));
      return;
    }

    const reset = await confirmPasswordReset();
    setSubmitting(false);
    if (!reset.ok) {
      setErrorText(reset.error ?? t('changePassword.errConfirmFailed'));
      return;
    }

    setOkText(t('changePassword.success'));
    onSuccess?.();
  };

  const disabled = submitting || newPassword.length === 0 || confirmPassword.length === 0;
  const horizontalPad = isCompact ? 16 : 24;
  const maxCardHeight = Math.max(320, height - insets.top - insets.bottom - 48);

  return (
    <KeyboardAwareModalFrame
      visible={visible}
      onRequestClose={onClose}
      overlayStyle={[styles.overlay, { paddingHorizontal: horizontalPad }]}>
      <Pressable
        accessibilityLabel={t('changePassword.dismiss')}
        onPress={() => (submitting ? undefined : onClose())}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        bounces={false}
        contentContainerStyle={styles.scrollContent}
        style={[styles.scroll, { maxHeight: maxCardHeight }]}>
            <View style={styles.card}>
              <View style={[styles.headerRow, isCompact && styles.headerRowCompact]}>
                <View style={styles.headerIconWrap}>
                  <Ionicons name="key-outline" size={20} color={BRAND_BLUE} />
                </View>
                <View style={styles.headerText}>
                  <Text style={styles.title}>{t('changePassword.title')}</Text>
                  <Text style={styles.subtitle}>{t('changePassword.subtitle')}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('changePassword.dismiss')}
                  onPress={() => (submitting ? undefined : onClose())}
                  style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}>
                  <Ionicons name="close" size={20} color={TEXT_MUTED} />
                </Pressable>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>{t('changePassword.newLabel')}</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showPasswords}
                    placeholder={t('changePassword.newPlaceholder')}
                    placeholderTextColor={TEXT_MUTED}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    style={styles.input}
                    editable={!submitting}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      showPasswords ? t('changePassword.hide') : t('changePassword.show')
                    }
                    onPress={() => setShowPasswords((v) => !v)}
                    style={({ pressed }) => [styles.eyeBtn, pressed && styles.btnPressed]}>
                    <Ionicons
                      name={showPasswords ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={TEXT_MUTED}
                    />
                  </Pressable>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>{t('changePassword.confirmLabel')}</Text>
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPasswords}
                  placeholder={t('changePassword.confirmPlaceholder')}
                  placeholderTextColor={TEXT_MUTED}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  style={[styles.input, styles.inputBare]}
                  editable={!submitting}
                />
              </View>

              {errorText ? <Text style={styles.errText}>{errorText}</Text> : null}
              {okText ? <Text style={styles.okText}>{okText}</Text> : null}

              <View style={[styles.actionsRow, isCompact && styles.actionsRowCompact]}>
                <Pressable
                  accessibilityRole="button"
                  disabled={submitting}
                  onPress={onClose}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    isCompact && styles.actionBtnFull,
                    pressed && styles.btnPressed,
                    submitting && styles.btnDisabled,
                  ]}>
                  <Text style={styles.secondaryText}>{t('changePassword.cancel')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={disabled}
                  onPress={() => void handleSubmit()}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    isCompact && styles.actionBtnFull,
                    pressed && !disabled && styles.primaryBtnPressed,
                    disabled && styles.btnDisabled,
                  ]}>
                  {submitting ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
                  <Text style={styles.primaryText}>
                    {submitting ? t('changePassword.saving') : t('changePassword.save')}
                  </Text>
                </Pressable>
              </View>
            </View>
      </KeyboardAwareScrollView>
    </KeyboardAwareModalFrame>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(7, 22, 53, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
  },
  scroll: {
    width: '100%',
    maxWidth: 460,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: SURFACE,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerRowCompact: {
    alignItems: 'flex-start',
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(18, 59, 122, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
  },
  subtitle: {
    fontSize: 13,
    color: TEXT_MUTED,
    lineHeight: 18,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 10,
    flexShrink: 0,
  },
  btnPressed: { opacity: 0.7 },
  field: { gap: 6 },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    borderRadius: 12,
    paddingRight: 6,
    minWidth: 0,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14.5,
    color: BRAND_BLUE_DARK,
  },
  inputBare: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    borderRadius: 12,
    width: '100%',
  },
  eyeBtn: { padding: 8, borderRadius: 10 },
  errText: { fontSize: 13, color: ERR, fontWeight: '600' },
  okText: { fontSize: 13, color: OK, fontWeight: '700' },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  actionsRowCompact: {
    flexDirection: 'column-reverse',
    alignItems: 'stretch',
  },
  actionBtnFull: {
    width: '100%',
    justifyContent: 'center',
  },
  secondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    alignItems: 'center',
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
  },
  primaryBtnPressed: { opacity: 0.9 },
  primaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: SURFACE,
    letterSpacing: 0.2,
  },
  btnDisabled: { opacity: 0.55 },
});
