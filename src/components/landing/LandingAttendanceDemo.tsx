import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect } from "react";
import {
    Platform,
    StyleSheet,
    View,
    type StyleProp,
    type ViewStyle,
} from "react-native";

import {
    appBrandBlue,
    appBrandBlueDark,
    appBrandMy,
    appBrandRoyal,
} from "@/src/theme/appBrandPalette";

export const attendanceMarkVideo = require("@/assets/landing/attendance-mark.mp4");

/** Warm accent (reference-style pop) — not brand orange; pairs with azure/navy. */
const ACCENT_GOLD = "#F5C518";
const CIRCLE_WASH = "#EEF2F6";

type Props = {
  style?: StyleProp<ViewStyle>;
  /** Diameter of the main video circle. */
  size?: number;
};

/**
 * Looping muted attendance demo cropped inside a large circle,
 * with overlapping accent discs (reference-style composition).
 */
export default function LandingAttendanceDemo({ style, size = 320 }: Props) {
  const player = useVideoPlayer(attendanceMarkVideo, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    player.muted = true;
    player.loop = true;
    try {
      player.play();
    } catch {
      /* ignore */
    }
  }, [player]);

  const gold = Math.round(size * 0.42);
  const blueDot = Math.round(size * 0.16);
  const ring = Math.round(size * 0.22);

  return (
    <View
      style={[
        styles.stage,
        { width: size + gold * 0.35, height: size + gold * 0.2 },
        style,
      ]}
    >
      {/* Soft wash disc behind (like light grey circle in reference) */}
      <View
        style={[
          styles.wash,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      />

      {/* Brand blue accent discs */}
      <View
        style={[
          styles.accentBlue,
          {
            width: ring,
            height: ring,
            borderRadius: ring / 2,
            top: size * 0.08,
            right: gold * 0.15,
          },
        ]}
      />
      <View
        style={[
          styles.accentRoyal,
          {
            width: blueDot,
            height: blueDot,
            borderRadius: blueDot / 2,
            top: size * 0.42,
            left: 4,
          },
        ]}
      />

      {/* Gold overlapping circle (bottom-left pop) */}
      <View
        style={[
          styles.accentGold,
          {
            width: gold,
            height: gold,
            borderRadius: gold / 2,
            bottom: 0,
            left: 0,
          },
        ]}
      />

      {/* Video circle */}
      <View
        style={[
          styles.videoCircle,
          {
            width: size * 0.88,
            height: size * 0.88,
            borderRadius: (size * 0.88) / 2,
            top: size * 0.06,
            left: (size + gold * 0.35 - size * 0.88) / 2,
          },
        ]}
      >
        <VideoView
          player={player}
          style={styles.video}
          contentFit="cover"
          nativeControls={false}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    position: "relative",
  },
  wash: {
    position: "absolute",
    right: 0,
    top: 0,
    backgroundColor: CIRCLE_WASH,
    ...Platform.select({
      web: {
        boxShadow: "0 18px 50px rgba(4, 24, 48, 0.1)",
      },
      default: {
        shadowColor: appBrandBlueDark,
        shadowOpacity: 0.12,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
        elevation: 6,
      },
    }),
  },
  accentGold: {
    position: "absolute",
    backgroundColor: ACCENT_GOLD,
    zIndex: 1,
  },
  accentBlue: {
    position: "absolute",
    backgroundColor: appBrandMy,
    opacity: 0.95,
    zIndex: 1,
  },
  accentRoyal: {
    position: "absolute",
    backgroundColor: appBrandRoyal,
    zIndex: 1,
  },
  videoCircle: {
    position: "absolute",
    overflow: "hidden",
    backgroundColor: appBrandBlue,
    zIndex: 2,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    ...Platform.select({
      web: {
        boxShadow: "0 22px 40px rgba(4, 24, 48, 0.18)",
      },
      default: {
        shadowColor: appBrandBlueDark,
        shadowOpacity: 0.2,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 10 },
        elevation: 8,
      },
    }),
  },
  video: {
    width: "100%",
    height: "100%",
  },
});
