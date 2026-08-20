import { Image } from 'expo-image';
import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ClassCardQrCode } from '@/src/components/parent/ClassCardQrCode';
import TeacherClassCardDefaultPreview, {
  TeacherClassCardQrZoneOverlay,
} from '@/src/components/teacher/TeacherClassCardDefaultPreview';
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  CARD_COL_GAP_MM,
  CARD_ROW_GAP_MM,
  CARDS_PER_SHEET,
  ID_CARD_HEIGHT_MM,
  ID_CARD_WIDTH_MM,
  SHEET_MARGIN_X_MM,
  SHEET_MARGIN_Y_MM,
} from '@/src/services/teacherClassCardSheetPdf';

const A4_RATIO = A4_WIDTH_MM / A4_HEIGHT_MM;

type Props = {
  frontUrl: string | null;
  backUrl: string | null;
  qrZoneLabel: string;
  qrUrls?: string[];
};

function MiniFace({
  side,
  uri,
  qrZoneLabel,
  qrUrl,
  width,
  height,
}: {
  side: 'front' | 'back';
  uri: string | null;
  qrZoneLabel: string;
  qrUrl?: string;
  width: number;
  height: number;
}) {
  return (
    <View style={{ width, height, borderRadius: 3, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: '#94A3B8' }}>
      {uri ? (
        <View style={{ flex: 1 }}>
          <Image source={{ uri }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          {side === 'back' ? (
            qrUrl ? (
              <View style={styles.qrLive}>
                <ClassCardQrCode value={qrUrl} size={Math.max(18, Math.round(height * 0.42))} />
              </View>
            ) : (
              <TeacherClassCardQrZoneOverlay label={qrZoneLabel} compact />
            )
          ) : null}
        </View>
      ) : (
        <TeacherClassCardDefaultPreview side={side} qrZoneLabel={qrZoneLabel} compact />
      )}
    </View>
  );
}

function TeacherClassCardA4SheetPreview({ frontUrl, backUrl, qrZoneLabel, qrUrls }: Props) {
  const [sheetW, setSheetW] = useState(0);
  const px = sheetW > 0 ? sheetW / A4_WIDTH_MM : 0;
  const cardW = ID_CARD_WIDTH_MM * px;
  const cardH = ID_CARD_HEIGHT_MM * px;

  return (
    <View style={styles.desk}>
      <View
        style={styles.sheet}
        accessibilityRole="image"
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          if (w > 0 && w !== sheetW) setSheetW(w);
        }}>
        {px > 0 ? (
          <View
            style={{
              flex: 1,
              paddingHorizontal: SHEET_MARGIN_X_MM * px,
              paddingVertical: SHEET_MARGIN_Y_MM * px,
            }}>
            {Array.from({ length: CARDS_PER_SHEET }, (_, i) => (
              <View
                key={`row-${i}`}
                style={{
                  flexDirection: 'row',
                  marginBottom: i === CARDS_PER_SHEET - 1 ? 0 : CARD_ROW_GAP_MM * px,
                }}>
                <MiniFace
                  side="front"
                  uri={frontUrl}
                  qrZoneLabel={qrZoneLabel}
                  width={cardW}
                  height={cardH}
                />
                <View style={{ width: CARD_COL_GAP_MM * px }} />
                <MiniFace
                  side="back"
                  uri={backUrl}
                  qrZoneLabel={qrZoneLabel}
                  qrUrl={qrUrls?.[i]}
                  width={cardW}
                  height={cardH}
                />
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default memo(TeacherClassCardA4SheetPreview);

const styles = StyleSheet.create({
  desk: { width: '100%' },
  sheet: {
    width: '100%',
    aspectRatio: A4_RATIO,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
  },
  qrLive: {
    position: 'absolute',
    left: '4%',
    top: '50%',
    marginTop: -18,
    backgroundColor: '#FFFFFF',
    padding: 2,
    borderRadius: 2,
  },
});
