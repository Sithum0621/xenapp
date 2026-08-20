import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { APP_BRAND_NAME, BrandAssets } from '@/src/constants/brand';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';

type Side = 'front' | 'back';

type Props = {
  side: Side;
  qrZoneLabel: string;
  compact?: boolean;
};

function TeacherClassCardDefaultPreview({ side, qrZoneLabel, compact }: Props) {
  const markSource = Platform.OS === 'web' ? BrandAssets.fullWebp : BrandAssets.fullPng;

  return (
    <LinearGradient
      colors={['#F7FAFF', '#E8F1FF', '#D6E8FF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
      accessibilityRole="image"
      accessibilityLabel={APP_BRAND_NAME}>
      <View style={[styles.topBar, compact && styles.topBarCompact]} />
      {side === 'front' ? (
        <View style={styles.frontBody}>
          <Image source={markSource} style={styles.mark} contentFit="contain" />
          <Text style={[styles.wordMy, compact && styles.wordCompact]}>
            My<Text style={styles.wordTuition}>Tuition</Text>
          </Text>
        </View>
      ) : (
        <View style={styles.backBody}>
          <TeacherClassCardQrZoneOverlay label={qrZoneLabel} compact={compact} />
          <View style={styles.backCopy}>
            <Text style={[styles.backTitle, compact && styles.wordCompact]}>{APP_BRAND_NAME}</Text>
            <Text style={styles.backHint}>{qrZoneLabel}</Text>
          </View>
        </View>
      )}
    </LinearGradient>
  );
}

export function TeacherClassCardQrZoneOverlay({
  label,
  compact,
}: {
  label: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.qrZone, compact && styles.qrZoneCompact]} accessibilityLabel={label}>
      <View style={styles.qrDashed} />
    </View>
  );
}

export default memo(TeacherClassCardDefaultPreview);

const styles = StyleSheet.create({
  card: { flex: 1, overflow: 'hidden' },
  topBar: { height: 8, backgroundColor: '#041830' },
  topBarCompact: { height: 4 },
  frontBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10 },
  mark: { width: '42%', height: '42%' },
  wordMy: { fontSize: 18, fontFamily: FontFamily.black, color: '#38BDF8' },
  wordTuition: { color: '#041830', fontFamily: FontFamily.black },
  wordCompact: { fontSize: 10 },
  backBody: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 8 },
  qrZone: { width: '28%', aspectRatio: 1, justifyContent: 'center' },
  qrZoneCompact: { width: '26%' },
  qrDashed: {
    flex: 1,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#94A3B8',
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  backCopy: { flex: 1, gap: 4 },
  backTitle: { fontSize: 14, fontFamily: FontFamily.bold, color: '#041830' },
  backHint: { fontSize: 10, fontFamily: FontFamily.regular, color: '#64748B' },
});
