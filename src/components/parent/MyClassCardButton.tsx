import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform, StyleSheet, View } from "react-native";

import ScrollFriendlyPressable from "@/src/components/layout/ScrollFriendlyPressable";
import { Text } from "@/src/theme/Text";
import { FontFamily } from "@/src/theme/fonts";
import {
    parentBorder,
    parentBrandBlue,
    parentBrandBlueDark,
    parentSurface,
} from "@/src/theme/parentDashboardPalette";

const BRAND_BLUE_DARK = parentBrandBlueDark;
const BRAND_BLUE = parentBrandBlue;
const BORDER = parentBorder;
const SURFACE = parentSurface;

/**
 * Opens My Class Cards to scan teacher-issued card QRs and keep soft copies.
 */
export default function MyClassCardButton() {
  const { t } = useTranslation();

  return (
    <ScrollFriendlyPressable
      accessibilityRole="button"
      accessibilityLabel={t("parentDashboard.myClassCardTitle")}
      onPress={() => router.push("/parent-dashboard/class-card")}
      innerStyle={styles.button}
    >
      <View style={styles.iconTile}>
        <Ionicons name="card-outline" size={22} color={BRAND_BLUE} />
      </View>
      <Text style={styles.label}>
        {t("parentDashboard.myClassCardTitle")}
      </Text>
      <View style={styles.scanTile}>
        <Ionicons name="qr-code-outline" size={22} color={BRAND_BLUE} />
      </View>
    </ScrollFriendlyPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    paddingVertical: 14,
    paddingHorizontal: 16,
    width: "100%",
    ...Platform.select({
      android: { elevation: 3 },
      web: {
        boxShadow: "0 8px 18px rgba(0, 16, 31, 0.08)",
      },
      default: {
        shadowColor: "#00101F",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
      },
    }),
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(46, 84, 148, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  scanTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  label: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    letterSpacing: -0.2,
    pointerEvents: "none",
  },
});
