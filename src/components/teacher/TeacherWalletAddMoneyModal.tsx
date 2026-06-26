import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { KeyboardAwareModalFrame, KeyboardAwareScrollView } from '@/src/components/layout/scroll';

import { initPayhereTeacherWalletTopUp } from '@/src/services/payhereTeacherWalletApi';
import { supabase } from '@/src/services/supabaseClient';
import {
  parseRupeeInputToCents,
  teacherWalletSubmitManualTopUp,
} from '@/src/services/teacherWalletApi';
import { uploadTeacherWalletSlip } from '@/src/services/teacherWalletSlipApi';
import {
  teacherWalletPayhereRedirectUrl,
  teacherWalletPayhereReturnUrl,
} from '@/src/utils/teacherWalletPayhereUrls';
import { isPayhereEnabled } from '@/src/utils/payhereConfig';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const AMBER_BG = '#FFFBEB';
const AMBER_BORDER = '#FDE68A';

type AddMoneyTab = 'payhere' | 'manual';

export type TeacherWalletAddMoneyModalProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function TeacherWalletAddMoneyModal({
  visible,
  onClose,
  onSuccess,
}: TeacherWalletAddMoneyModalProps) {
  const { t } = useTranslation();
  const w = (k: string, o?: Record<string, unknown>) => t(`teacherDashboard.wallet.${k}`, o);
  const payhereReady = isPayhereEnabled();

  const [tab, setTab] = useState<AddMoneyTab>('manual');
  const [amountInput, setAmountInput] = useState('');
  const [depositorNameInput, setDepositorNameInput] = useState('');
  const [depositorIdInput, setDepositorIdInput] = useState('');
  const [slipUri, setSlipUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setTab('manual');
    setAmountInput('');
    setDepositorNameInput('');
    setDepositorIdInput('');
    setSlipUri(null);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) return;
    reset();
    onClose();
  }, [submitting, reset, onClose]);

  const pickSlip = useCallback(async () => {
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!lib.granted) {
      setError(w('slipPermissionDenied'));
      return;
    }
    const launched = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (!launched.canceled && launched.assets[0]?.uri) {
      setSlipUri(launched.assets[0].uri);
      setError(null);
    }
  }, [w]);

  const handlePayhere = useCallback(async () => {
    const cents = parseRupeeInputToCents(amountInput);
    if (!cents) {
      setError(w('invalidAmount'));
      return;
    }

    setSubmitting(true);
    setError(null);

    const init = await initPayhereTeacherWalletTopUp(cents, {
      returnUrl: teacherWalletPayhereReturnUrl('success'),
      cancelUrl: teacherWalletPayhereReturnUrl('cancel'),
    });
    if (!init.ok) {
      setSubmitting(false);
      if (init.error === 'network_error') {
        setError(w('payhereNetworkError'));
      } else if (init.error === 'payhere_not_configured') {
        setError(w('payhereNotConfigured'));
      } else {
        setError(init.error);
      }
      return;
    }

    try {
      if (Platform.OS === 'web') {
        window.open(init.checkoutUrl, '_blank', 'noopener,noreferrer');
      } else {
        await WebBrowser.openAuthSessionAsync(
          init.checkoutUrl,
          teacherWalletPayhereRedirectUrl(),
        );
      }
      reset();
      onClose();
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : w('payhereOpenFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [amountInput, w, reset, onClose, onSuccess]);

  const handleManual = useCallback(async () => {
    const cents = parseRupeeInputToCents(amountInput);
    if (!cents) {
      setError(w('invalidAmount'));
      return;
    }
    const depositorName = depositorNameInput.trim();
    if (depositorName.length < 2) {
      setError(w('depositorNameRequired'));
      return;
    }
    const depositorId = depositorIdInput.trim();
    if (depositorId.length < 4) {
      setError(w('depositorIdRequired'));
      return;
    }
    if (!slipUri) {
      setError(w('slipRequired'));
      return;
    }

    setSubmitting(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      setSubmitting(false);
      setError(w('notSignedIn'));
      return;
    }

    const requestId = newRequestId();
    const uploaded = await uploadTeacherWalletSlip(slipUri, user.id, requestId);
    if (!uploaded.ok) {
      setSubmitting(false);
      setError(uploaded.error);
      return;
    }

    const submitted = await teacherWalletSubmitManualTopUp(
      cents,
      uploaded.path,
      depositorName,
      depositorId,
    );

    setSubmitting(false);

    if (!submitted.ok) {
      setError(submitted.error);
      return;
    }

    reset();
    onClose();
    onSuccess();
  }, [amountInput, depositorNameInput, depositorIdInput, slipUri, w, reset, onClose, onSuccess]);

  const handleSubmit = () => {
    if (tab === 'payhere') {
      if (!payhereReady) return;
      void handlePayhere();
      return;
    }
    void handleManual();
  };

  const onlineTabActive = tab === 'payhere';
  const submitDisabled =
    submitting || (onlineTabActive && !payhereReady);

  const submitLabel = onlineTabActive
    ? payhereReady
      ? w('payherePay')
      : w('payhereComingSoonBtn')
    : w('manualSubmit');

  return (
    <KeyboardAwareModalFrame
      visible={visible}
      onRequestClose={handleClose}
      overlayStyle={styles.root}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <View style={styles.card}>
          <Text style={styles.title}>{w('addMoneyTitle')}</Text>

          <View style={styles.tabs}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setTab('payhere');
                setError(null);
              }}
              style={[styles.tab, onlineTabActive && styles.tabActive]}>
              <Text style={[styles.tabText, onlineTabActive && styles.tabTextActive]}>
                {w('tabOnlinePay')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setTab('manual');
                setError(null);
              }}
              style={[styles.tab, tab === 'manual' && styles.tabActive]}>
              <Text style={[styles.tabText, tab === 'manual' && styles.tabTextActive]}>
                {w('tabManual')}
              </Text>
            </Pressable>
          </View>

          <KeyboardAwareScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.formScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {onlineTabActive && !payhereReady ? (
              <View style={styles.comingSoonBox}>
                <Ionicons name="time-outline" size={22} color={BRAND_BLUE} />
                <Text style={styles.comingSoonText}>{w('payhereComingSoon')}</Text>
              </View>
            ) : (
              <Text style={styles.hint}>
                {onlineTabActive ? w('addMoneyPayhereHint') : w('addMoneyManualHint')}
              </Text>
            )}

            {!(onlineTabActive && !payhereReady) ? (
              <>
                <Text style={styles.fieldLabel}>{w('amountLabel')}</Text>
                <TextInput
                  value={amountInput}
                  onChangeText={setAmountInput}
                  placeholder={w('amountPlaceholder')}
                  keyboardType="decimal-pad"
                  style={styles.fieldInput}
                />
              </>
            ) : null}

            {tab === 'manual' ? (
              <>
                <Text style={styles.fieldLabel}>{w('depositorNameLabel')}</Text>
                <TextInput
                  value={depositorNameInput}
                  onChangeText={setDepositorNameInput}
                  placeholder={w('depositorNamePlaceholder')}
                  autoCapitalize="words"
                  style={styles.fieldInput}
                />

                <Text style={styles.fieldLabel}>{w('depositorIdLabel')}</Text>
                <TextInput
                  value={depositorIdInput}
                  onChangeText={setDepositorIdInput}
                  placeholder={w('depositorIdPlaceholder')}
                  autoCapitalize="characters"
                  style={styles.fieldInput}
                />

                <Text style={styles.fieldLabel}>{w('slipLabel')}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void pickSlip()}
                  style={({ pressed }) => [styles.slipBtn, pressed && styles.pressed]}>
                  <Ionicons name="cloud-upload-outline" size={20} color={BRAND_BLUE} />
                  <Text style={styles.slipBtnText}>
                    {slipUri ? w('slipChange') : w('slipUpload')}
                  </Text>
                </Pressable>
                {slipUri ? (
                  <Image source={{ uri: slipUri }} style={styles.slipPreview} resizeMode="cover" />
                ) : null}
              </>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </KeyboardAwareScrollView>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={handleClose}
              disabled={submitting}
              style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}>
              <Text style={styles.cancelText}>{w('cancel')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={handleSubmit}
              disabled={submitDisabled}
              style={({ pressed }) => [
                styles.submitBtn,
                pressed && styles.pressed,
                submitDisabled && styles.submitDisabled,
              ]}>
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitText}>{submitLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
    </KeyboardAwareModalFrame>
  );
}

const styles = StyleSheet.create({
  root: { justifyContent: 'center', paddingHorizontal: 20 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    gap: 8,
    zIndex: 1,
    maxHeight: '90%',
  },
  title: { fontSize: 18, fontWeight: '800', color: BRAND_BLUE_DARK },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: 'rgba(18, 59, 122, 0.08)',
    borderColor: BRAND_BLUE,
  },
  tabText: { fontSize: 13, fontWeight: '700', color: TEXT_MUTED },
  tabTextActive: { color: BRAND_BLUE_DARK },
  formScroll: { flexGrow: 0, flexShrink: 1 },
  formScrollContent: { gap: 8, paddingBottom: 4 },
  comingSoonBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: AMBER_BG,
    borderWidth: 1,
    borderColor: AMBER_BORDER,
    borderRadius: 10,
    padding: 12,
  },
  comingSoonText: { flex: 1, fontSize: 13, color: BRAND_BLUE_DARK, lineHeight: 18 },
  hint: { fontSize: 13, color: TEXT_MUTED, lineHeight: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: BRAND_BLUE_DARK, marginTop: 4 },
  fieldInput: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  slipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderStyle: 'dashed',
  },
  slipBtnText: { fontSize: 14, fontWeight: '700', color: BRAND_BLUE },
  slipPreview: {
    width: '100%',
    height: 120,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  error: { fontSize: 13, color: '#B42318', fontWeight: '600', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  cancelBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: { fontWeight: '700', color: TEXT_MUTED },
  submitBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: BRAND_BLUE,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.55 },
  submitText: { fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },
  pressed: { opacity: 0.85 },
});
