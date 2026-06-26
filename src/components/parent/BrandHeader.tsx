import { LinearGradient } from "expo-linear-gradient";
import { memo, type ReactNode } from "react";
import { Image, StyleSheet, View } from "react-native";

import { Text } from "@/src/theme/Text";
import { FontFamily } from "@/src/theme/fonts";

const STRIP_START = "#E3EEFF";
const STRIP_END = "#F1F6FF";
const BRAND_BLUE = "#123B7A";
const BRAND_BLUE_DARK = "#0E2F63";

const LOGO_HEIGHT = 60;

/** Equal inset from screen left/right edges. */
const EDGE_INSET = 16;

export type BrandHeaderProps = {
  helloPrefix?: string;
  userName?: string | null;
  trailing?: ReactNode;
};

/** Pale-blue brand strip: XEN logo (left), optional compact greeting (right). */
function BrandHeader({ helloPrefix, userName, trailing }: BrandHeaderProps) {
  const showGreeting = Boolean(helloPrefix?.trim() && userName?.trim());
  const showTrailing = Boolean(trailing);

  return (
    <LinearGradient
      colors={[STRIP_START, STRIP_END]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.strip}
    >
      <View style={styles.logoCol}>
        <Image
          source={require("@/assets/images/brand/xen-logo.png")}
          style={styles.xenLogo}
          resizeMode="contain"
          fadeDuration={0}
          accessibilityIgnoresInvertColors
          accessibilityLabel="XEN — Future of Tuition"
        />
      </View>

      {showGreeting || showTrailing ? (
        <View style={styles.trailingCol}>
          {showGreeting ? (
            <Text style={styles.greeting} numberOfLines={1} accessibilityRole="header">
              <Text style={styles.greetingPrefix}>{helloPrefix}, </Text>
              <Text style={styles.greetingName}>{userName}</Text>
            </Text>
          ) : null}
          {trailing}
        </View>
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: EDGE_INSET,
    paddingTop: 6,
    paddingBottom: 6,
    width: "100%",
    minHeight: LOGO_HEIGHT + 12,
    gap: 12,
  },
  logoCol: {
    height: LOGO_HEIGHT,
    justifyContent: "center",
    alignItems: "flex-start",
    flexShrink: 1,
    minWidth: 0,
  },
  xenLogo: {
    height: LOGO_HEIGHT,
    width: 105,
    maxWidth: "100%",
  },
  trailingCol: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    flexShrink: 0,
    maxWidth: "58%",
  },
  greeting: {
    fontSize: 14,
    lineHeight: 18,
    textAlign: "right",
    flexShrink: 1,
  },
  greetingPrefix: {
    fontFamily: FontFamily.regular,
    color: BRAND_BLUE_DARK,
  },
  greetingName: {
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE,
  },
});

export default memo(BrandHeader);
