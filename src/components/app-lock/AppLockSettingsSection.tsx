import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';

import { KeyboardAwareModalFrame } from '@/src/components/layout/scroll';

import { useAppLock } from '@/src/context/AppLockContext';
import {
  appLockChangePin,
  appLockSetEnabled,
  appLockSetPin,
  appLockVerifyPin,
} from '@/src/services/appLockApi';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const TEXT_MUTED = '#64748B';
const SUBTLE_BORDER = '#E2E8F0';
const PAGE_SURFACE = '#F8FAFC';

type Flow =
  | null
  | 'set_enter'
  | 'set_confirm'
  | 'change_current'
  | 'change_new'
  | 'change_confirm';

export default function AppLockSettingsSection() {
  const { t } = useTranslation();
  const { status, statusError, loading: ctxLoading, refresh } = useAppLock();

  const [toggleBusy, setToggleBusy] = useState(false);
  const [toggleErr, setToggleErr] = useState<string | null>(null);
  /** User turned the switch ON before a PIN existed — enable lock automatically after PIN is saved. */
  const [pendingEnableAfterPinSet, setPendingEnableAfterPinSet] = useState(false);

  const [flow, setFlow] = useState<Flow>(null);
  const [pinA, setPinA] = useState('');
  const [pinB, setPinB] = useState('');
  const [pinCurrent, setPinCurrent] = useState('');
  const [modalBusy, setModalBusy] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);

  useEffect(() => {
    if (!flow) {
      setPinA('');
      setPinB('');
      setPinCurrent('');
      setModalErr(null);
      setModalBusy(false);
    }
  }, [flow]);

  const dismissPinModal = () => {
    if (!modalBusy) {
      setPendingEnableAfterPinSet(false);
      setFlow(null);
    }
  };

  const onToggle = async (next: boolean) => {
    setToggleErr(null);
    setToggleBusy(true);
    const { error } = await appLockSetEnabled(next);
    setToggleBusy(false);
    if (error) {
      setToggleErr(mapRpcErr(error, t));
      return;
    }
    await refresh();
  };

  const openSetPin = (opts?: { enableAfter?: boolean }) => {
    setPendingEnableAfterPinSet(Boolean(opts?.enableAfter));
    setFlow('set_enter');
    setPinA('');
    setPinB('');
    setModalErr(null);
  };

  const openChangePin = () => {
    setPendingEnableAfterPinSet(false);
    setFlow('change_current');
    setPinCurrent('');
    setPinA('');
    setPinB('');
    setModalErr(null);
  };

  const normalizePin = (s: string) => s.replace(/\D/g, '').slice(0, 4);

  const submitSetEnter = () => {
    const p = normalizePin(pinA);
    if (p.length !== 4) {
      setModalErr(t('appLock.invalidPin'));
      return;
    }
    setPinB('');
    setFlow('set_confirm');
    setModalErr(null);
  };

  const submitSetConfirm = async () => {
    const a = normalizePin(pinA);
    const b = normalizePin(pinB);
    if (b.length !== 4) {
      setModalErr(t('appLock.invalidPin'));
      return;
    }
    if (a !== b) {
      setModalErr(t('appLock.pinMismatch'));
      return;
    }
    setModalBusy(true);
    setModalErr(null);
    const { error } = await appLockSetPin(a);
    setModalBusy(false);
    if (error) {
      setModalErr(mapRpcErr(error, t));
      return;
    }
    const shouldEnableLock = pendingEnableAfterPinSet;
    setPendingEnableAfterPinSet(false);
    setFlow(null);
    if (shouldEnableLock) {
      setToggleBusy(true);
      const { error: enErr } = await appLockSetEnabled(true);
      setToggleBusy(false);
      if (enErr) {
        setToggleErr(mapRpcErr(enErr, t));
      }
    }
    await refresh();
  };

  const submitChangeCurrent = async () => {
    const p = normalizePin(pinCurrent);
    if (p.length !== 4) {
      setModalErr(t('appLock.invalidPin'));
      return;
    }
    setModalBusy(true);
    setModalErr(null);
    const { ok, error } = await appLockVerifyPin(p);
    setModalBusy(false);
    if (error) {
      setModalErr(error);
      return;
    }
    if (!ok) {
      setModalErr(t('appLock.wrongPin'));
      setPinCurrent('');
      return;
    }
    setPinA('');
    setPinB('');
    setFlow('change_new');
    setModalErr(null);
  };

  const submitChangeNew = () => {
    const p = normalizePin(pinA);
    if (p.length !== 4) {
      setModalErr(t('appLock.invalidPin'));
      return;
    }
    setPinB('');
    setFlow('change_confirm');
    setModalErr(null);
  };

  const submitChangeConfirm = async () => {
    const cur = normalizePin(pinCurrent);
    const neu = normalizePin(pinA);
    const conf = normalizePin(pinB);
    if (conf.length !== 4) {
      setModalErr(t('appLock.invalidPin'));
      return;
    }
    if (neu !== conf) {
      setModalErr(t('appLock.pinMismatch'));
      return;
    }
    setModalBusy(true);
    setModalErr(null);
    const { error } = await appLockChangePin(cur, neu);
    setModalBusy(false);
    if (error) {
      setModalErr(mapRpcErr(error, t));
      return;
    }
    dismissPinModal();
    await refresh();
  };

  const modalTitle = useCallback(() => {
    switch (flow) {
      case 'set_enter':
        return t('appLock.modalSetTitle');
      case 'set_confirm':
        return t('appLock.modalConfirmTitle');
      case 'change_current':
        return t('appLock.modalCurrentTitle');
      case 'change_new':
        return t('appLock.modalNewTitle');
      case 'change_confirm':
        return t('appLock.modalConfirmNewTitle');
      default:
        return '';
    }
  }, [flow, t]);

  const pinIsSet = Boolean(status?.pinIsSet);
  const enabled = Boolean(status?.enabled);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('appLock.sectionTitle')}</Text>
      <Text style={styles.cardHint}>{t('appLock.sectionHint')}</Text>

      {statusError ? (
        <View style={styles.statusBanner}>
          <Text style={styles.statusBannerTitle}>{t('appLock.statusLoadTitle')}</Text>
          <Text style={styles.statusBannerDetail}>{friendlyStatusError(statusError, t)}</Text>
        </View>
      ) : null}

      {ctxLoading ? (
        <ActivityIndicator style={styles.loader} color={BRAND_BLUE} />
      ) : (
        <>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{t('appLock.enableLabel')}</Text>
              <Text style={styles.rowSub}>{t('appLock.enableHint')}</Text>
            </View>
            {toggleBusy ? (
              <ActivityIndicator color={BRAND_BLUE} />
            ) : (
              <Switch
                value={enabled}
                disabled={toggleBusy || Boolean(statusError)}
                onValueChange={(v) => {
                  setToggleErr(null);
                  if (v && !pinIsSet) {
                    openSetPin({ enableAfter: true });
                    return;
                  }
                  void onToggle(v);
                }}
                trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                thumbColor={enabled ? BRAND_BLUE : '#F4F4F5'}
              />
            )}
          </View>
          {!pinIsSet && !statusError ? (
            <Text style={styles.inlineWarn}>{t('appLock.mustSetPinFirst')}</Text>
          ) : null}
          {toggleErr ? <Text style={styles.err}>{toggleErr}</Text> : null}

          <Pressable
            accessibilityRole="button"
            disabled={Boolean(statusError)}
            onPress={pinIsSet ? openChangePin : () => openSetPin()}
            style={({ pressed }) => [
              styles.pinBtn,
              Boolean(statusError) && styles.pinBtnDisabled,
              pressed && !statusError && styles.pinBtnPressed,
            ]}>
            <Ionicons name="keypad-outline" size={22} color={BRAND_BLUE_DARK} />
            <Text style={styles.pinBtnLabel}>{pinIsSet ? t('appLock.changePin') : t('appLock.setPin')}</Text>
            <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
          </Pressable>
        </>
      )}

      <KeyboardAwareModalFrame
        visible={flow != null}
        animationType="slide"
        onRequestClose={dismissPinModal}
        overlayStyle={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={() => !modalBusy && dismissPinModal()} />
        <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{modalTitle()}</Text>
            <Text style={styles.modalSub}>{t('appLock.pinDigitsHint')}</Text>

            {flow === 'change_current' ? (
              <TextInput
                value={pinCurrent}
                onChangeText={(x) => setPinCurrent(normalizePin(x))}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                placeholder="••••"
                placeholderTextColor={TEXT_MUTED}
                style={styles.pinInput}
                editable={!modalBusy}
              />
            ) : null}

            {(flow === 'set_enter' || flow === 'change_new') ? (
              <TextInput
                value={pinA}
                onChangeText={(x) => setPinA(normalizePin(x))}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                placeholder="••••"
                placeholderTextColor={TEXT_MUTED}
                style={styles.pinInput}
                editable={!modalBusy}
              />
            ) : null}

            {(flow === 'set_confirm' || flow === 'change_confirm') ? (
              <TextInput
                value={pinB}
                onChangeText={(x) => setPinB(normalizePin(x))}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                placeholder="••••"
                placeholderTextColor={TEXT_MUTED}
                style={styles.pinInput}
                editable={!modalBusy}
              />
            ) : null}

            {modalErr ? <Text style={styles.modalErr}>{modalErr}</Text> : null}

            <View style={styles.modalActions}>
              <Pressable
                disabled={modalBusy}
                onPress={dismissPinModal}
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}>
                <Text style={styles.secondaryBtnText}>{t('appLock.cancel')}</Text>
              </Pressable>
              <Pressable
                disabled={modalBusy}
                onPress={() => {
                  if (flow === 'set_enter') submitSetEnter();
                  else if (flow === 'set_confirm') void submitSetConfirm();
                  else if (flow === 'change_current') void submitChangeCurrent();
                  else if (flow === 'change_new') submitChangeNew();
                  else if (flow === 'change_confirm') void submitChangeConfirm();
                }}
                style={({ pressed }) => [styles.primaryBtn, pressed && !modalBusy && styles.primaryBtnPressed]}>
                {modalBusy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>{t('appLock.continue')}</Text>
                )}
              </Pressable>
            </View>
          </View>
      </KeyboardAwareModalFrame>
    </View>
  );
}

function mapRpcErr(raw: string, t: (k: string) => string): string {
  const low = raw.toLowerCase();
  if (low.includes('pin_required_before_enable')) return t('appLock.errPinRequiredEnable');
  if (low.includes('invalid_pin_format')) return t('appLock.invalidPin');
  if (low.includes('wrong_current_pin')) return t('appLock.wrongPin');
  if (low.includes('pin_already_set')) return t('appLock.errPinAlreadySet');
  return raw;
}

function friendlyStatusError(raw: string, t: (k: string) => string): string {
  const low = raw.toLowerCase();
  if (low.includes('could not find the function') || low.includes('schema cache')) {
    return t('appLock.errBackendUnavailable');
  }
  return raw;
}

const styles = StyleSheet.create({
  card: {
    marginTop: 20,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  cardTitle: { fontSize: 17, fontWeight: '800', color: BRAND_BLUE_DARK, marginBottom: 6 },
  cardHint: { fontSize: 14, color: TEXT_MUTED, lineHeight: 20, marginBottom: 14 },
  statusBanner: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  statusBannerTitle: { fontSize: 14, fontWeight: '800', color: '#991B1B', marginBottom: 6 },
  statusBannerDetail: { fontSize: 13, color: '#7F1D1D', lineHeight: 18 },
  loader: { marginVertical: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 16, fontWeight: '700', color: BRAND_BLUE_DARK },
  rowSub: { marginTop: 2, fontSize: 13, color: TEXT_MUTED },
  inlineWarn: { fontSize: 13, color: '#B45309', marginBottom: 8 },
  err: { fontSize: 13, color: '#B45309', marginBottom: 8 },
  pinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PAGE_SURFACE,
  },
  pinBtnPressed: { opacity: 0.92 },
  pinBtnDisabled: { opacity: 0.45 },
  pinBtnLabel: { flex: 1, fontSize: 16, fontWeight: '700', color: BRAND_BLUE_DARK },
  modalRoot: {
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 28,
    borderTopWidth: 1.5,
    borderColor: SUBTLE_BORDER,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: BRAND_BLUE_DARK, marginBottom: 8 },
  modalSub: { fontSize: 14, color: TEXT_MUTED, marginBottom: 16 },
  pinInput: {
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 14,
    minHeight: 52,
    fontSize: 22,
    letterSpacing: 10,
    textAlign: 'center',
    marginBottom: 12,
    backgroundColor: PAGE_SURFACE,
    color: BRAND_BLUE_DARK,
  },
  modalErr: { fontSize: 14, color: '#B91C1C', marginBottom: 8 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PAGE_SURFACE,
  },
  secondaryBtnPressed: { opacity: 0.88 },
  secondaryBtnText: { fontSize: 16, fontWeight: '700', color: BRAND_BLUE_DARK },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: BRAND_BLUE,
  },
  primaryBtnPressed: { opacity: 0.92 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
