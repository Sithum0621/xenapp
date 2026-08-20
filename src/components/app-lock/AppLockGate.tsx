import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppLock } from '@/src/context/AppLockContext';
import { appLockVerifyPin } from '@/src/services/appLockApi';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const TEXT_MUTED = '#64748B';

export default function AppLockGate() {
  const { t } = useTranslation();
  const { gateRequiresUnlock, dismissGate } = useAppLock();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    const clean = pin.replace(/\D/g, '').slice(0, 4);
    if (clean.length !== 4) {
      setErr(t('appLock.invalidPin'));
      return;
    }
    setBusy(true);
    setErr(null);
    const { ok, error } = await appLockVerifyPin(clean);
    setBusy(false);
    if (error) {
      setErr(error);
      return;
    }
    if (!ok) {
      setErr(t('appLock.wrongPin'));
      setPin('');
      return;
    }
    setPin('');
    dismissGate();
  };

  return (
    <Modal visible={gateRequiresUnlock} animationType="fade" transparent={false}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}>
          <View style={styles.inner}>
            <View style={styles.iconCircle}>
              <Ionicons name="lock-closed" size={36} color={BRAND_BLUE} />
            </View>
            <Text style={styles.title}>{t('appLock.gateTitle')}</Text>
            <Text style={styles.sub}>{t('appLock.gateSubtitle')}</Text>

            <TextInput
              value={pin}
              onChangeText={(x) => setPin(x.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              placeholder="••••"
              placeholderTextColor={TEXT_MUTED}
              style={styles.input}
              editable={!busy}
              onSubmitEditing={() => void onSubmit()}
            />

            {err ? <Text style={styles.err}>{err}</Text> : null}

            <Pressable
              accessibilityRole="button"
              disabled={busy || pin.length !== 4}
              onPress={() => void onSubmit()}
              style={({ pressed }) => [
                styles.btn,
                (busy || pin.length !== 4) && styles.btnDisabled,
                pressed && !busy && pin.length === 4 && styles.btnPressed,
              ]}>
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.btnLabel}>{t('appLock.unlock')}</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'stretch',
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: '#E3F2FD',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    textAlign: 'center',
    marginBottom: 8,
  },
  sub: {
    fontSize: 15,
    color: TEXT_MUTED,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
    minHeight: 52,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: 'center',
    color: BRAND_BLUE_DARK,
    backgroundColor: '#F8FAFC',
  },
  err: {
    marginTop: 12,
    fontSize: 14,
    color: '#B91C1C',
    textAlign: 'center',
  },
  btn: {
    marginTop: 22,
    backgroundColor: BRAND_BLUE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.92 },
  btnDisabled: { opacity: 0.55 },
  btnLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
