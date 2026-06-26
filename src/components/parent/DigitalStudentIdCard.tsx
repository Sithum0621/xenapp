import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Image,
  ImageBackground,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ClassCardQrCode } from '@/src/components/parent/ClassCardQrCode';
import { buildClassCardQrPayload } from '@/src/utils/xenQrPayload';
import {
  formatContactNumber,
  formatStudentDisplayName,
  type StudentClassCardData,
} from '@/src/services/studentClassCardApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';

const CARD_FRONT = require('@/assets/images/class-card/card-front.png');
const CARD_BACK = require('@/assets/images/class-card/card-back.png');

const CARD_ASPECT = 1.72;
const HORIZONTAL_GUTTER = 16;
const MAX_CARD_WIDTH = 400;
const FLIP_MS = 480;

export type DigitalStudentIdCardProps = {
  card: StudentClassCardData;
};

type CardMetrics = {
  width: number;
  height: number;
  qrSize: number;
  labelSize: number;
  valueSize: number;
  nameValueSize: number;
  contentTop: number;
  contentBottom: number;
};

function useCardMetrics(): CardMetrics {
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.min(screenWidth - HORIZONTAL_GUTTER * 2, MAX_CARD_WIDTH);
  const height = width / CARD_ASPECT;
  return {
    width,
    height,
    qrSize: Math.round(width * 0.3),
    labelSize: Math.max(10, Math.round(width * 0.028)),
    valueSize: Math.max(12, Math.round(width * 0.033)),
    nameValueSize: Math.max(13, Math.round(width * 0.036)),
    contentTop: Math.round(height * 0.1),
    contentBottom: Math.round(height * 0.27),
  };
}

function DetailField({
  label,
  value,
  metrics,
  emphasize,
}: {
  label: string;
  value: string;
  metrics: CardMetrics;
  emphasize?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { fontSize: metrics.labelSize }]}>{label}</Text>
      <Text
        style={[
          styles.fieldValue,
          emphasize ? styles.fieldValueName : null,
          {
            fontSize: emphasize ? metrics.nameValueSize : metrics.valueSize,
            lineHeight: (emphasize ? metrics.nameValueSize : metrics.valueSize) + 4,
          },
        ]}
        numberOfLines={emphasize ? 4 : 2}
        adjustsFontSizeToFit={!emphasize}
        minimumFontScale={0.75}>
        {value}
      </Text>
    </View>
  );
}

function CardFrontFace({ width, height }: { width: number; height: number }) {
  return (
    <Image
      source={CARD_FRONT}
      resizeMode="cover"
      style={{ width, height, borderRadius: 14 }}
      accessibilityIgnoresInvertColors
    />
  );
}

function CardBackFace({
  card,
  metrics,
}: {
  card: StudentClassCardData;
  metrics: CardMetrics;
}) {
  const { t } = useTranslation();
  const { width, height, qrSize, contentTop, contentBottom } = metrics;

  const displayName = useMemo(() => formatStudentDisplayName(card.fullName), [card.fullName]);
  const displayContact = useMemo(
    () => formatContactNumber(card.mobileNumber),
    [card.mobileNumber],
  );

  return (
    <ImageBackground
      source={CARD_BACK}
      resizeMode="cover"
      style={{ width, height, borderRadius: 14 }}
      imageStyle={styles.faceImageRadius}>
      <View
        style={[
          styles.backOverlay,
          { paddingTop: contentTop, paddingBottom: contentBottom },
        ]}
        pointerEvents="none">
        <View style={styles.backContentRow}>
          <View style={styles.qrColumn}>
            <View style={styles.qrWhite}>
              <ClassCardQrCode
                value={buildClassCardQrPayload(card.studentUserId)}
                size={qrSize}
              />
            </View>
          </View>

          <View style={styles.detailsColumn}>
            <DetailField
              label={t('parentDashboard.myClassCardLabelName')}
              value={displayName}
              metrics={metrics}
              emphasize
            />
            <DetailField
              label={t('parentDashboard.myClassCardLabelStudentId')}
              value={card.xenStudentId}
              metrics={metrics}
            />
            <DetailField
              label={t('parentDashboard.myClassCardLabelContact')}
              value={displayContact}
              metrics={metrics}
            />
          </View>
        </View>
      </View>
    </ImageBackground>
  );
}

/**
 * Two-sided digital student ID: tap the card to flip front ↔ back (details + QR).
 */
export default function DigitalStudentIdCard({ card }: DigitalStudentIdCardProps) {
  const { t } = useTranslation();
  const metrics = useCardMetrics();
  const { width, height } = metrics;

  const [showingBack, setShowingBack] = useState(false);
  const flip = useSharedValue(0);

  const toggleSide = () => {
    const nextBack = !showingBack;
    setShowingBack(nextBack);
    flip.value = withTiming(nextBack ? 1 : 0, { duration: FLIP_MS });
  };

  const frontFaceStyle = useAnimatedStyle(() => {
    const progress = flip.value;
    const rotateY = interpolate(progress, [0, 1], [0, 180], Extrapolation.CLAMP);
    const opacity = interpolate(progress, [0, 0.48, 0.52, 1], [1, 1, 0, 0], Extrapolation.CLAMP);
    return {
      opacity,
      zIndex: progress < 0.5 ? 2 : 0,
      transform: [
        { perspective: 1400 },
        { rotateY: `${rotateY}deg` },
      ],
    };
  });

  const backFaceStyle = useAnimatedStyle(() => {
    const progress = flip.value;
    const rotateY = interpolate(progress, [0, 1], [180, 360], Extrapolation.CLAMP);
    const opacity = interpolate(progress, [0, 0.48, 0.52, 1], [0, 0, 1, 1], Extrapolation.CLAMP);
    return {
      opacity,
      zIndex: progress >= 0.5 ? 2 : 0,
      transform: [
        { perspective: 1400 },
        { rotateY: `${rotateY}deg` },
      ],
    };
  });

  const a11yLabel = showingBack
    ? t('parentDashboard.myClassCardShowFront')
    : t('parentDashboard.myClassCardShowBack');

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityState={{ expanded: showingBack }}
        onPress={toggleSide}
        style={({ pressed }) => [
          styles.cardPressable,
          { width, height },
          pressed && styles.cardPressablePressed,
        ]}>
        <View style={[styles.shadowWrap, { width, height }]}>
          <View style={[styles.flipRoot, { width, height }]}>
            <Animated.View
              style={[styles.faceLayer, { width, height }, frontFaceStyle]}
              pointerEvents={showingBack ? 'none' : 'auto'}
              collapsable={false}>
              <CardFrontFace width={width} height={height} />
            </Animated.View>

            <Animated.View
              style={[styles.faceLayer, { width, height }, backFaceStyle]}
              pointerEvents={showingBack ? 'auto' : 'none'}
              collapsable={false}>
              <CardBackFace card={card} metrics={metrics} />
            </Animated.View>
          </View>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        onPress={toggleSide}
        style={styles.hintPressable}>
        <Text style={styles.sideBadge}>
          {showingBack
            ? t('parentDashboard.myClassCardSideBack')
            : t('parentDashboard.myClassCardSideFront')}
        </Text>
        <Text style={styles.hintText}>
          {showingBack
            ? t('parentDashboard.myClassCardTapFront')
            : t('parentDashboard.myClassCardTapBack')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 12,
  },
  cardPressable: {
    borderRadius: 14,
    alignSelf: 'center',
  },
  cardPressablePressed: {
    opacity: 0.97,
  },
  shadowWrap: {
    borderRadius: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#0E2F63',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.22,
        shadowRadius: 20,
      },
      android: { elevation: 10 },
      default: {},
    }),
  },
  flipRoot: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  faceLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: 14,
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
  },
  faceImageRadius: {
    borderRadius: 14,
  },
  backOverlay: {
    flex: 1,
    paddingLeft: '4%',
    paddingRight: '3%',
  },
  backContentRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qrColumn: {
    width: '38%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrWhite: {
    backgroundColor: '#FFFFFF',
    padding: 6,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  detailsColumn: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
    paddingLeft: 4,
    paddingRight: 2,
    minWidth: 0,
  },
  field: {
    gap: 3,
    alignSelf: 'stretch',
  },
  fieldLabel: {
    fontFamily: FontFamily.regular,
    color: 'rgba(255, 255, 255, 0.9)',
    letterSpacing: 0.15,
  },
  fieldValue: {
    fontFamily: FontFamily.bold,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  fieldValueName: {
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  hintPressable: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sideBadge: {
    fontSize: 12,
    fontFamily: FontFamily.bold,
    color: '#123B7A',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  hintText: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: '#64748B',
    textAlign: 'center',
  },
});
