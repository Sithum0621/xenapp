import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/theme/Text';
import {
  parseClassCardScan,
  type ClassCardScanPayload,
} from '@/src/utils/xenQrPayload';

type Props = {
  onScanned: (payload: ClassCardScanPayload) => void;
  onCancel: () => void;
};

const BRAND_BLUE = '#041830';
const BORDER = '#D6E2F0';
const TEXT_MUTED = '#64748B';

export default function ParentClassCardQrScanner({ onScanned, onCancel }: Props) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const scanLocked = useRef(false);

  const handleBarcode = useCallback(
    ({ data }: { data: string }) => {
      if (scanLocked.current) return;
      const payload = parseClassCardScan(data);
      if (!payload) return;
      scanLocked.current = true;
      onScanned(payload);
    },
    [onScanned],
  );

  if (permission === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND_BLUE} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionCard}>
        <Ionicons name="camera-outline" size={32} color={TEXT_MUTED} />
        <Text style={styles.permissionText}>
          {t('parentDashboard.myClassCardScanPermission')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void requestPermission()}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>
            {t('parentDashboard.myClassCardAllowCamera')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
          <Text style={styles.cancelButtonText}>{t('appLock.back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>{t('parentDashboard.myClassCardScanHint')}</Text>
      <View style={styles.cameraFrame}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handleBarcode}
        />
        <View pointerEvents="none" style={styles.scanGuide}>
          <View style={styles.guideCorner} />
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onCancel}
        style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
        <Text style={styles.cancelButtonText}>{t('parentDashboard.myClassCardCancelScan')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  centered: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    color: TEXT_MUTED,
    textAlign: 'center',
  },
  cameraFrame: {
    height: Platform.OS === 'web' ? 280 : 320,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: BORDER,
  },
  scanGuide: {
    position: 'absolute',
    width: 190,
    height: 190,
    alignSelf: 'center',
    top: '18%',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  guideCorner: {
    position: 'absolute',
    top: 8,
    right: 8,
    bottom: 8,
    left: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  permissionCard: {
    alignItems: 'center',
    gap: 12,
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
  },
  permissionText: {
    fontSize: 14,
    lineHeight: 20,
    color: TEXT_MUTED,
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: 46,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
    paddingHorizontal: 16,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  cancelButton: {
    minHeight: 44,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
  },
  cancelButtonText: { color: BRAND_BLUE, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.82 },
});
