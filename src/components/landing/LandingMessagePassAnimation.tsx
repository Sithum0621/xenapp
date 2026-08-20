import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { Text } from '@/src/theme/Text';
import {
  appBrandBlueDark,
  appBrandMy,
  appBrandRoyal,
  appSurface,
} from '@/src/theme/appBrandPalette';
import { FontFamily } from '@/src/theme/fonts';

type Props = {
  width?: number;
  /** 0 = message on teacher phone, 1 = arrived on parent phone. Driven by page scroll. */
  scrollProgress: SharedValue<number>;
  /** Extra fade for use as page background under copy. */
  dimmed?: boolean;
};

/**
 * Teacher → Parent message transfer, scrubbed by landing-page scroll.
 * Use `dimmed` when rendering as a full-page background under text.
 */
export default function LandingMessagePassAnimation({
  width = 420,
  scrollProgress,
  dimmed = false,
}: Props) {
  const phoneH = Math.round(width * (dimmed ? 0.52 : 0.44));
  const phoneW = Math.round(phoneH * 0.5);
  const travel = Math.max(48, width - phoneW * 2 - 20);

  const bubbleStyle = useAnimatedStyle(() => {
    const p = scrollProgress.value;
    const x = interpolate(p, [0, 0.08, 0.92, 1], [0, 0, travel, travel], 'clamp');
    const y = interpolate(p, [0, 0.5, 1], [0, -36, 0], 'clamp');
    const scale = interpolate(p, [0, 0.1, 0.9, 1], [0.9, 1, 1, 0.95], 'clamp');
    return {
      transform: [{ translateX: x }, { translateY: y }, { scale }],
      opacity: 1,
    };
  });

  const leftActive = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(scrollProgress.value, [0, 0.2, 1], [1.03, 1, 0.99], 'clamp'),
      },
    ],
  }));

  const rightActive = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(scrollProgress.value, [0, 0.7, 1], [0.99, 1, 1.03], 'clamp'),
      },
    ],
  }));

  const leftGlow = useAnimatedStyle(() => ({
    opacity: interpolate(scrollProgress.value, [0, 0.25, 0.55], [0.9, 0.45, 0.25], 'clamp'),
  }));

  const rightGlow = useAnimatedStyle(() => ({
    opacity: interpolate(scrollProgress.value, [0.45, 0.75, 1], [0.2, 0.55, 0.95], 'clamp'),
  }));

  const parentPreview = useAnimatedStyle(() => ({
    opacity: interpolate(scrollProgress.value, [0.65, 0.85, 1], [0.15, 0.7, 1], 'clamp'),
    transform: [
      {
        translateY: interpolate(scrollProgress.value, [0.65, 1], [6, 0], 'clamp'),
      },
    ],
  }));

  const teacherPreview = useAnimatedStyle(() => ({
    opacity: interpolate(scrollProgress.value, [0, 0.25, 0.55], [1, 0.9, 0.45], 'clamp'),
  }));

  const trailStyle = useAnimatedStyle(() => ({
    width: interpolate(scrollProgress.value, [0, 1], [8, travel], 'clamp'),
    opacity: interpolate(scrollProgress.value, [0, 0.08, 1], [0.35, 0.9, 0.9], 'clamp'),
  }));

  return (
    <View
      style={[styles.stage, { width, height: phoneH + 56 }, dimmed && styles.stageDimmed]}
      pointerEvents="none">
      <View style={[styles.blob, styles.blobA]} />
      <View style={[styles.blob, styles.blobB]} />
      <View style={[styles.blob, styles.blobC]} />

      <View style={styles.row}>
        <Animated.View style={[styles.phoneWrap, leftActive]}>
          <Animated.View style={[styles.phoneGlow, styles.glowAzure, leftGlow]} />
          <View style={[styles.phone, { width: phoneW, height: phoneH }]}>
            <View style={styles.phoneNotch} />
            <View style={styles.phoneScreen}>
              <View style={styles.chatHeader}>
                <Ionicons name="school" size={14} color={appBrandMy} />
                <Text style={styles.chatHeaderText}>Teacher</Text>
              </View>
              <Animated.View style={[styles.msgOut, teacherPreview]}>
                <Text style={styles.msgOutText}>Attendance marked</Text>
              </Animated.View>
              <View style={styles.msgPlaceholder} />
            </View>
          </View>
        </Animated.View>

        <View style={[styles.bridge, { width: travel, height: phoneH }]}>
          <View style={styles.dashLine} />
          <Animated.View style={[styles.trail, trailStyle]} />
          <Animated.View style={[styles.bubble, bubbleStyle]}>
            <Ionicons name="chatbubble-ellipses" size={16} color="#FFF" />
            <Text style={styles.bubbleText}>Present ✓</Text>
          </Animated.View>
        </View>

        <Animated.View style={[styles.phoneWrap, rightActive]}>
          <Animated.View style={[styles.phoneGlow, styles.glowRoyal, rightGlow]} />
          <View style={[styles.phone, styles.phoneParent, { width: phoneW, height: phoneH }]}>
            <View style={styles.phoneNotch} />
            <View style={styles.phoneScreen}>
              <View style={styles.chatHeader}>
                <Ionicons name="people" size={14} color={appBrandRoyal} />
                <Text style={styles.chatHeaderText}>Parent</Text>
              </View>
              <View style={styles.msgPlaceholder} />
              <Animated.View style={[styles.msgIn, parentPreview]}>
                <Text style={styles.msgInText}>Present ✓</Text>
              </Animated.View>
            </View>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  stageDimmed: {
    opacity: 0.28,
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blobA: {
    width: 180,
    height: 180,
    backgroundColor: 'rgba(30, 136, 229, 0.16)',
    top: -8,
    right: 8,
  },
  blobB: {
    width: 130,
    height: 130,
    backgroundColor: 'rgba(245, 197, 24, 0.28)',
    bottom: 0,
    left: 0,
  },
  blobC: {
    width: 72,
    height: 72,
    backgroundColor: 'rgba(30, 79, 214, 0.18)',
    top: 18,
    left: 48,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 2,
  },
  phoneWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneGlow: {
    position: 'absolute',
    width: '120%',
    height: '70%',
    borderRadius: 999,
  },
  glowAzure: {
    backgroundColor: 'rgba(30, 136, 229, 0.35)',
  },
  glowRoyal: {
    backgroundColor: 'rgba(30, 79, 214, 0.32)',
  },
  phone: {
    borderRadius: 20,
    backgroundColor: '#0B3A6E',
    padding: 7,
    borderWidth: 2.5,
    borderColor: appBrandMy,
    ...Platform.select({
      web: { boxShadow: '0 16px 36px rgba(4, 24, 48, 0.2)' },
      default: {
        shadowColor: appBrandBlueDark,
        shadowOpacity: 0.2,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 6,
      },
    }),
  },
  phoneParent: {
    backgroundColor: '#132A5C',
    borderColor: appBrandRoyal,
  },
  phoneNotch: {
    alignSelf: 'center',
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
    marginBottom: 5,
  },
  phoneScreen: {
    flex: 1,
    borderRadius: 13,
    backgroundColor: '#F0F7FF',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  chatHeaderText: {
    fontSize: 10,
    fontFamily: FontFamily.bold,
    color: appBrandBlueDark,
  },
  msgOut: {
    alignSelf: 'flex-end',
    backgroundColor: appBrandMy,
    borderRadius: 12,
    borderBottomRightRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    maxWidth: '96%',
  },
  msgOutText: {
    fontSize: 9,
    fontFamily: FontFamily.bold,
    color: '#FFF',
  },
  msgIn: {
    alignSelf: 'flex-start',
    backgroundColor: appSurface,
    borderWidth: 1.5,
    borderColor: appBrandRoyal,
    borderRadius: 12,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    maxWidth: '96%',
  },
  msgInText: {
    fontSize: 9,
    fontFamily: FontFamily.bold,
    color: appBrandRoyal,
  },
  msgPlaceholder: {
    flex: 1,
  },
  bridge: {
    justifyContent: 'center',
    overflow: 'visible',
  },
  dashLine: {
    position: 'absolute',
    left: 2,
    right: 2,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(30, 136, 229, 0.2)',
  },
  trail: {
    position: 'absolute',
    left: 2,
    height: 3,
    borderRadius: 2,
    backgroundColor: appBrandMy,
  },
  bubble: {
    position: 'absolute',
    left: 0,
    top: '42%',
    marginTop: -16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: appBrandRoyal,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    ...Platform.select({
      web: { boxShadow: '0 10px 24px rgba(30, 79, 214, 0.35)' },
      default: {
        shadowColor: appBrandRoyal,
        shadowOpacity: 0.3,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
      },
    }),
  },
  bubbleText: {
    fontSize: 11,
    fontFamily: FontFamily.bold,
    color: '#FFF',
  },
});
