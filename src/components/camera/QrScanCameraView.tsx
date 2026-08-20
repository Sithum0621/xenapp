import { CameraView } from 'expo-camera';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  style?: StyleProp<ViewStyle>;
  onBarcodeScanned: (result: { data: string }) => void;
};

/**
 * QR preview with forced autofocus.
 * expo-camera defaults autofocus to `off`, which leaves close card QRs soft/unreadable.
 * Native: periodically re-assert `on` so the lens re-locks while scanning.
 */
export default function QrScanCameraView({ style, onBarcodeScanned }: Props) {
  const [autofocus, setAutofocus] = useState<'on' | 'off'>('on');

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    let pulseTimer: ReturnType<typeof setTimeout> | undefined;
    const id = setInterval(() => {
      setAutofocus('off');
      pulseTimer = setTimeout(() => setAutofocus('on'), 120);
    }, 2800);
    return () => {
      clearInterval(id);
      if (pulseTimer) clearTimeout(pulseTimer);
    };
  }, []);

  return (
    <CameraView
      style={style ?? StyleSheet.absoluteFill}
      facing="back"
      autofocus={autofocus}
      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      onBarcodeScanned={onBarcodeScanned}
    />
  );
}
