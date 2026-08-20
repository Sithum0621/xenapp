import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import QrScanCameraView from '@/src/components/camera/QrScanCameraView';
import { parseClassCardScan, parseXenIdFromScan } from '@/src/utils/xenQrPayload';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const BORDER = '#E2E8F0';
const PAGE_SURFACE = '#F8FAFC';
const TEXT_MUTED = '#64748B';

type Props = {
  onParsedId: (studentUserId: string) => void;
  /** Teacher-issued class card (`mtc1_` / welcome?card=). */
  onParsedIssuedCard?: (token: string) => void;
  /** Hide the default scan title/hint (parent screen already explains the step). */
  hideIntro?: boolean;
  /** Only accept teacher-issued class card QRs (not student UUID IDs). */
  issuedCardsOnly?: boolean;
  onClose?: () => void;
  /** Minimal camera-only UI for embedded attendance sessions. */
  compact?: boolean;
};

export default function TeacherStudentQrScanner({
  onParsedId,
  onParsedIssuedCard,
  onClose,
  compact = false,
  hideIntro = false,
  issuedCardsOnly = false,
}: Props) {
  const { t } = useTranslation();
  const gd = (k: string) => t(`teacherDashboard.groupDetail.${k}`);
  const [permission, requestPermission] = useCameraPermissions();
  const [pasteValue, setPasteValue] = useState('');
  const [webCamAvailable, setWebCamAvailable] = useState<boolean | null>(null);
  const [showWebCam, setShowWebCam] = useState(false);
  const lockRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      void CameraView.isAvailableAsync().then(setWebCamAvailable);
    }
  }, []);

  const fireIfValid = useCallback(
    (raw: string) => {
      if (lockRef.current) return;
      if (!compact) {
        const card = parseClassCardScan(raw);
        if (card?.issuedCardToken) {
          if (!onParsedIssuedCard) return;
          lockRef.current = true;
          onParsedIssuedCard(card.issuedCardToken);
          return;
        }
        if (issuedCardsOnly) return;
        if (card?.studentUserId) {
          lockRef.current = true;
          onParsedId(card.studentUserId);
          return;
        }
        return;
      }
      const compactCard = parseClassCardScan(raw);
      if (compactCard?.issuedCardToken) {
        lockRef.current = true;
        if (onParsedIssuedCard) onParsedIssuedCard(compactCard.issuedCardToken);
        else onParsedId(compactCard.issuedCardToken);
        return;
      }
      const id = compactCard?.studentUserId ?? parseXenIdFromScan(raw);
      if (!id) return;
      lockRef.current = true;
      onParsedId(id);
    },
    [compact, onParsedId, onParsedIssuedCard, issuedCardsOnly],
  );

  const onBarcodeScanned = useCallback(
    (result: { data: string }) => {
      fireIfValid(result.data);
    },
    [fireIfValid],
  );

  const handlePasteSubmit = () => {
    if (lockRef.current) return;
    if (!compact) {
      const card = parseClassCardScan(pasteValue);
      if (card?.issuedCardToken) {
        if (!onParsedIssuedCard) {
          appAlert(gd('scanInvalidTitle'), gd(issuedCardsOnly ? 'scanInvalidBodyIssued' : 'scanInvalidBody'));
          return;
        }
        lockRef.current = true;
        onParsedIssuedCard(card.issuedCardToken);
        return;
      }
      if (issuedCardsOnly) {
        appAlert(gd('scanInvalidTitle'), gd(issuedCardsOnly ? 'scanInvalidBodyIssued' : 'scanInvalidBody'));
        return;
      }
      if (card?.studentUserId) {
        lockRef.current = true;
        onParsedId(card.studentUserId);
        return;
      }
      appAlert(gd('scanInvalidTitle'), gd('scanInvalidBody'));
      return;
    }
    const id = parseXenIdFromScan(pasteValue);
    if (!id) {
      appAlert(gd('scanInvalidTitle'), gd('scanInvalidBody'));
      return;
    }
    lockRef.current = true;
    onParsedId(id);
  };

  const camDenied = permission && !permission.granted;

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {!compact && !hideIntro ? (
        <>
          <Text style={styles.title}>{gd('scanXenTitle')}</Text>
          <Text style={styles.hint}>{gd('scanXenHint')}</Text>
        </>
      ) : null}

      {permission === null ? (
        <ActivityIndicator color={BRAND_BLUE} style={{ marginVertical: compact ? 8 : 16 }} />
      ) : camDenied ? (
        <View style={[styles.card, compact && styles.cardCompact]}>
          {compact ? (
            <View style={styles.compactCamPrompt}>
              <Ionicons name="camera-outline" size={28} color={TEXT_MUTED} />
              <Text style={styles.compactCamText}>{gd('scanCameraDenied')}</Text>
            </View>
          ) : (
            <Text style={styles.cardText}>{gd('scanCameraDenied')}</Text>
          )}
          <Pressable
            onPress={() => void requestPermission()}
            style={[styles.primaryBtn, compact && styles.primaryBtnCompact]}>
            <Ionicons name="camera-outline" size={18} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>{gd('scanCameraAllow')}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {Platform.OS !== 'web' || showWebCam ? (
            <View style={[styles.cameraBox, compact && styles.cameraBoxCompact]}>
              <QrScanCameraView onBarcodeScanned={onBarcodeScanned} />
              <View pointerEvents="none" style={styles.scanGuide}>
                <View style={styles.guideInner} />
              </View>
            </View>
          ) : null}

          {Platform.OS === 'web' && webCamAvailable && !showWebCam ? (
            <Pressable onPress={() => setShowWebCam(true)} style={styles.secondaryBtn}>
              <Ionicons name="videocam-outline" size={20} color={BRAND_BLUE} />
              <Text style={styles.secondaryBtnText}>{gd('scanWebcamStart')}</Text>
            </Pressable>
          ) : null}

          {Platform.OS === 'web' && webCamAvailable === false ? (
            <Text style={styles.webFallback}>{gd('scanWebNoCamera')}</Text>
          ) : null}
        </>
      )}

      {!compact ? (
        <>
          <Text style={styles.pasteLabel}>{gd('scanPasteLabel')}</Text>
          <TextInput
            value={pasteValue}
            onChangeText={setPasteValue}
            placeholder={gd(issuedCardsOnly ? 'scanPastePlaceholderIssued' : 'scanPastePlaceholder')}
            placeholderTextColor={TEXT_MUTED}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            onSubmitEditing={handlePasteSubmit}
            returnKeyType="done"
          />
          <Text style={styles.usbHint}>{gd('scanUsbScannerHint')}</Text>

          <View style={styles.actions}>
            {onClose ? (
              <Pressable onPress={onClose} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>{t('teacherDashboard.groupsCancel')}</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={handlePasteSubmit} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>{gd('scanPasteConfirm')}</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  wrapCompact: { gap: 8 },
  title: { fontSize: 17, fontWeight: '800', color: BRAND_BLUE_DARK },
  hint: { fontSize: 13, color: TEXT_MUTED, fontWeight: '600', lineHeight: 18 },
  cameraBox: {
    height: Platform.OS === 'web' ? 280 : 320,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: BORDER,
  },
  cameraBoxCompact: {
    height: Platform.OS === 'web' ? 220 : 260,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  scanGuide: {
    position: 'absolute',
    width: 200,
    height: 200,
    alignSelf: 'center',
    top: '18%',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  guideInner: {
    position: 'absolute',
    top: 10,
    right: 10,
    bottom: 10,
    left: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  card: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: PAGE_SURFACE,
    gap: 12,
  },
  cardCompact: {
    padding: 10,
    gap: 8,
  },
  primaryBtnCompact: {
    flex: 0,
    alignSelf: 'stretch',
  },
  compactCamPrompt: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  compactCamText: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 18,
  },
  cardText: { fontSize: 14, fontWeight: '600', color: BRAND_BLUE_DARK },
  pasteLabel: { marginTop: 8, fontSize: 12, fontWeight: '700', color: '#475569' },
  input: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: PAGE_SURFACE,
    color: BRAND_BLUE_DARK,
  },
  usbHint: { fontSize: 12, color: TEXT_MUTED, fontWeight: '600' },
  webFallback: { fontSize: 13, color: TEXT_MUTED, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
  },
  primaryBtnText: { fontWeight: '800', color: '#FFFFFF' },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: PAGE_SURFACE,
  },
  secondaryBtnText: { fontWeight: '800', color: BRAND_BLUE_DARK },
});
