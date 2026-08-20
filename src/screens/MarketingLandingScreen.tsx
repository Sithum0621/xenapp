import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
    Linking,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    useWindowDimensions,
    View,
} from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import MyTuitionLogo from "@/src/components/brand/MyTuitionLogo";
import LandingAttendanceDemo from "@/src/components/landing/LandingAttendanceDemo";
import LandingHeroCarousel from "@/src/components/landing/LandingHeroCarousel";
import LandingMessagePassAnimation from "@/src/components/landing/LandingMessagePassAnimation";
import AppScrollView from "@/src/components/layout/AppScrollView";
import { POLICY_LIST_ITEMS } from "@/src/components/policies/PoliciesList";
import {
    APP_BRAND_NAME,
    APP_BRAND_TAGLINE,
    BrandAssets,
    WOVELLO_WEBSITE_URL,
} from "@/src/constants/brand";
import { appHref, AppRoutes } from "@/src/navigation/AppNavigator";
import { Text } from "@/src/theme/Text";
import {
    appBrandBlueDark,
    appBrandMy,
    appBrandRoyal,
    appBrandSurfaceGradient,
    appPageSurface,
    appSurface,
    appTextMuted
} from "@/src/theme/appBrandPalette";
import { FontFamily } from "@/src/theme/fonts";
import { PAGE_EDGE_INSET } from "@/src/theme/pageLayout";

type SectionKey = "home" | "features" | "pricing" | "updates" | "footer";

/**
 * Public web marketing landing — header nav, carousel, sections, Wovello footer.
 */
export default function MarketingLandingScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Partial<Record<SectionKey, number>>>({});
  const contentHeight = useRef(1200);
  const viewportHeight = useRef(800);
  const msgScrollProgress = useSharedValue(0);

  const onLandingScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const layoutH =
        e.nativeEvent.layoutMeasurement.height || viewportHeight.current;
      viewportHeight.current = layoutH;
      const maxScroll = Math.max(1, contentHeight.current - layoutH);
      msgScrollProgress.value = Math.min(1, Math.max(0, y / maxScroll));
    },
    [msgScrollProgress],
  );

  const onContentSizeChange = useCallback((_w: number, h: number) => {
    contentHeight.current = Math.max(h, 1);
  }, []);

  const scrollToSection = useCallback((key: SectionKey) => {
    const y = sectionY.current[key];
    if (y == null) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  }, []);

  const openWovello = useCallback(() => {
    void Linking.openURL(WOVELLO_WEBSITE_URL).catch(() => undefined);
  }, []);

  const navItems: { key: SectionKey; label: string; onPress: () => void }[] = [
    {
      key: "home",
      label: t("landing.navHome"),
      onPress: () => scrollToSection("home"),
    },
    {
      key: "features",
      label: t("landing.navFeatures"),
      onPress: () => scrollToSection("features"),
    },
    {
      key: "pricing",
      label: t("landing.navPricing"),
      onPress: () => scrollToSection("pricing"),
    },
    {
      key: "updates",
      label: t("landing.navUpdates"),
      onPress: () => scrollToSection("updates"),
    },
    {
      key: "footer",
      label: t("landing.navPolicies"),
      onPress: () => scrollToSection("footer"),
    },
  ];

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[...appBrandSurfaceGradient, appPageSurface]}
        locations={[0, 0.4, 1]}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Full-page faint animation — stays visible while scrolling; text sits above. */}
      <View style={styles.bgAnimationLayer} pointerEvents="none">
        <LandingMessagePassAnimation
          width={Math.min(wide ? 820 : 480, width * 0.98)}
          scrollProgress={msgScrollProgress}
          dimmed
        />
      </View>

      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={[styles.header, wide && styles.headerWide]}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={APP_BRAND_NAME}
            onPress={() => scrollToSection("home")}
            style={styles.logoPress}
          >
            <MyTuitionLogo variant="mark" showWordmark />
          </Pressable>

          <View style={[styles.nav, !wide && styles.navWrap]}>
            {navItems.map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                onPress={item.onPress}
                style={({ pressed }) => [
                  styles.navItem,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.navItemText}>{item.label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("landing.signUp")}
            onPress={() => router.push(appHref(AppRoutes.signup))}
            style={({ pressed }) => [
              styles.signUpBtnWrap,
              pressed && styles.pressed,
            ]}
          >
            <LinearGradient
              colors={[appBrandMy, appBrandRoyal]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.signUpBtn}
            >
              <Text style={styles.signUpBtnText}>{t("landing.signUp")}</Text>
            </LinearGradient>
          </Pressable>
        </View>

        <AppScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={onLandingScroll}
          onContentSizeChange={onContentSizeChange}
        >
          <View style={[styles.main, wide && styles.mainWide]}>
            <View style={styles.carouselBlock}>
              <LandingHeroCarousel compact={width < 640} />
            </View>

            <View
              onLayout={(e) => {
                sectionY.current.home = e.nativeEvent.layout.y;
              }}
              style={[styles.hero, wide && styles.heroWide]}
            >
              <View style={[styles.copyCol, wide && styles.copyColWide]}>
                <View style={styles.heroAccentBar} />
                <Text style={styles.brandEyebrow}>{APP_BRAND_NAME}</Text>
                <Text style={styles.headline}>{t("landing.headline")}</Text>
                <Text style={styles.subhead}>{t("landing.subhead")}</Text>
                <Text style={styles.tagline}>{APP_BRAND_TAGLINE}</Text>
                <View style={styles.ctaRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push(appHref(AppRoutes.signup))}
                    style={({ pressed }) => [
                      styles.ctaPrimaryWrap,
                      pressed && styles.pressed,
                    ]}
                  >
                    <LinearGradient
                      colors={["#42A5F5", appBrandMy, appBrandRoyal]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.ctaPrimary}
                    >
                      <Text style={styles.ctaPrimaryText}>
                        {t("landing.getStarted")}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push(appHref(AppRoutes.roleSelect))}
                    style={({ pressed }) => [
                      styles.ctaSecondary,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.ctaSecondaryText}>
                      {t("landing.signIn")}
                    </Text>
                  </Pressable>
                </View>
              </View>
              <View
                style={[styles.heroArtWrap, wide && styles.heroArtWrapWide]}
              >
                <Image
                  source={BrandAssets.landingLiveClass}
                  style={styles.heroArt}
                  contentFit="contain"
                  accessibilityLabel="MyTuition live class"
                />
              </View>
            </View>

            <View
              onLayout={(e) => {
                sectionY.current.features = e.nativeEvent.layout.y;
              }}
              style={styles.section}
            >
              <Text style={styles.sectionTitle}>
                {t("landing.featuresTitle")}
              </Text>
              <Text style={styles.sectionBody}>
                {t("landing.featuresBody")}
              </Text>

              <View
                style={[styles.attendanceRow, wide && styles.attendanceRowWide]}
              >
                <View
                  style={[
                    styles.attendanceCopy,
                    wide && styles.attendanceCopyWide,
                  ]}
                >
                  <View style={styles.attendanceAccentBar} />
                  <Text style={styles.attendanceTitle}>
                    {t("landing.features.f1Title")}
                  </Text>
                  <Text style={styles.attendanceBody}>
                    {t("landing.features.f1Body")}
                  </Text>
                </View>
                <View
                  style={[
                    styles.attendanceMedia,
                    wide && styles.attendanceMediaWide,
                  ]}
                >
                  <LandingAttendanceDemo
                    size={wide ? 360 : Math.min(280, width * 0.72)}
                  />
                </View>
              </View>

              <View style={styles.featureGrid}>
                {(["f2", "f3"] as const).map((k) => (
                  <View
                    key={k}
                    style={[styles.featureCard, wide && styles.featureCardWide]}
                  >
                    <Text style={styles.featureCardTitle}>
                      {t(`landing.features.${k}Title`)}
                    </Text>
                    <Text style={styles.featureCardBody}>
                      {t(`landing.features.${k}Body`)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View
              onLayout={(e) => {
                sectionY.current.pricing = e.nativeEvent.layout.y;
              }}
              style={styles.section}
            >
              <Text style={styles.sectionTitle}>
                {t("landing.pricingTitle")}
              </Text>
              <Text style={styles.sectionBody}>{t("landing.pricingBody")}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(appHref(AppRoutes.signup))}
                style={({ pressed }) => [
                  styles.ctaPrimaryWrap,
                  pressed && styles.pressed,
                  { alignSelf: "flex-start" },
                ]}
              >
                <LinearGradient
                  colors={["#42A5F5", appBrandMy, appBrandRoyal]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.ctaPrimary}
                >
                  <Text style={styles.ctaPrimaryText}>
                    {t("landing.pricingCta")}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>

            <View
              onLayout={(e) => {
                sectionY.current.updates = e.nativeEvent.layout.y;
              }}
              style={styles.section}
            >
              <Text style={styles.sectionTitle}>
                {t("landing.updatesTitle")}
              </Text>
              <Text style={styles.sectionBody}>{t("landing.updatesBody")}</Text>
            </View>
          </View>

          <View
            onLayout={(e) => {
              sectionY.current.footer = e.nativeEvent.layout.y;
            }}
            style={styles.footer}
          >
            <View style={[styles.footerInner, wide && styles.mainWide]}>
              <View style={styles.poweredCol}>
                <Text style={styles.poweredLabel}>
                  {t("landing.poweredBy")}
                </Text>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Wovello"
                  onPress={openWovello}
                  style={({ pressed }) => [
                    styles.poweredLogoPlate,
                    pressed && styles.pressed,
                  ]}
                >
                  <Image
                    source={BrandAssets.poweredByWovello}
                    style={styles.poweredLogo}
                    contentFit="contain"
                  />
                </Pressable>
              </View>

              <View style={styles.quickLinksCol}>
                <Text style={styles.quickLinksTitle}>
                  {t("landing.quickLinks")}
                </Text>
                {POLICY_LIST_ITEMS.map((item) => (
                  <Pressable
                    key={item.key}
                    accessibilityRole="link"
                    accessibilityLabel={t(item.titleKey)}
                    onPress={() => router.push(appHref(item.href))}
                    style={({ pressed }) => [
                      styles.quickLinkItem,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.footerLink}>{t(item.titleKey)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </AppScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: appPageSurface },
  bgAnimationLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  safe: { flex: 1, zIndex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(4, 24, 48, 0.1)",
    backgroundColor: "rgba(247, 250, 255, 0.92)",
    zIndex: 2,
  },
  headerWide: {
    paddingHorizontal: 24,
  },
  logoPress: { marginRight: 4 },
  nav: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 0,
  },
  navWrap: {
    flexBasis: "100%",
    justifyContent: "flex-start",
    flexWrap: "wrap",
  },
  navItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  navItemText: {
    fontSize: 14,
    fontFamily: FontFamily.bold,
    color: appBrandBlueDark,
  },
  signUpBtnWrap: {
    marginLeft: "auto",
    borderRadius: 10,
    overflow: "hidden",
  },
  signUpBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  signUpBtnText: {
    color: "#FFFFFF",
    fontFamily: FontFamily.bold,
    fontSize: 14,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 0,
  },
  main: {
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: 12,
    gap: 8,
  },
  mainWide: {
    maxWidth: 1480,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 20,
  },
  carouselBlock: {
    marginBottom: 4,
  },
  hero: {
    paddingVertical: 36,
    gap: 28,
    alignItems: "center",
  },
  heroWide: {
    paddingVertical: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 40,
  },
  copyCol: { gap: 12, width: "100%" },
  copyColWide: {
    flex: 1,
    maxWidth: 560,
    width: undefined,
    minWidth: 0,
  },
  heroArtWrap: {
    width: "100%",
    maxWidth: 520,
    alignItems: "center",
  },
  heroArtWrapWide: {
    flex: 1.15,
    maxWidth: 640,
  },
  heroArt: {
    width: "100%",
    aspectRatio: 16 / 10,
    maxHeight: 420,
  },
  heroAccentBar: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: appBrandMy,
    marginBottom: 2,
  },
  brandEyebrow: {
    fontSize: 15,
    fontFamily: FontFamily.black,
    color: appBrandMy,
    letterSpacing: 0.4,
  },
  headline: {
    fontSize: Platform.OS === "web" ? 48 : 34,
    fontFamily: FontFamily.black,
    color: appBrandBlueDark,
    lineHeight: Platform.OS === "web" ? 56 : 42,
  },
  subhead: {
    fontSize: 17,
    color: "#475569",
    lineHeight: 27,
    maxWidth: 520,
  },
  tagline: {
    fontSize: 15,
    fontFamily: FontFamily.bold,
    color: appTextMuted,
  },
  ctaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 14,
  },
  ctaPrimaryWrap: {
    borderRadius: 12,
    overflow: "hidden",
  },
  ctaPrimary: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 22,
    minWidth: 148,
    alignItems: "center",
  },
  ctaPrimaryText: {
    fontSize: 16,
    fontFamily: FontFamily.bold,
    color: "#FFFFFF",
  },
  ctaSecondary: {
    backgroundColor: "#E3F2FD",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: appBrandMy,
    paddingVertical: 14,
    paddingHorizontal: 22,
    minWidth: 120,
    alignItems: "center",
  },
  ctaSecondaryText: {
    fontSize: 16,
    fontFamily: FontFamily.bold,
    color: appBrandRoyal,
  },
  section: {
    paddingVertical: 40,
    gap: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(4, 24, 48, 0.1)",
  },
  sectionTitle: {
    fontSize: 28,
    fontFamily: FontFamily.black,
    color: appBrandBlueDark,
  },
  sectionBody: {
    fontSize: 16,
    color: "#64748B",
    lineHeight: 24,
    maxWidth: 720,
  },
  attendanceRow: {
    marginTop: 16,
    gap: 28,
    alignItems: "center",
  },
  attendanceRowWide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 40,
  },
  attendanceCopy: {
    gap: 14,
    width: "100%",
  },
  attendanceCopyWide: {
    flex: 1,
    width: undefined,
    minWidth: 0,
    paddingRight: 8,
  },
  attendanceAccentBar: {
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: appBrandBlueDark,
    marginBottom: 4,
  },
  attendanceTitle: {
    fontSize: Platform.OS === "web" ? 42 : 30,
    fontFamily: FontFamily.black,
    color: appBrandBlueDark,
    lineHeight: Platform.OS === "web" ? 50 : 36,
  },
  attendanceBody: {
    fontSize: 16,
    fontFamily: FontFamily.regular,
    color: "#64748B",
    lineHeight: 26,
    maxWidth: 480,
  },
  attendanceMedia: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  attendanceMediaWide: {
    flex: 1,
    alignItems: "center",
  },
  featureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 8,
  },
  featureCard: {
    flexGrow: 1,
    flexBasis: 260,
    backgroundColor: appSurface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(30, 136, 229, 0.22)",
    padding: 18,
    gap: 8,
    borderTopWidth: 4,
    borderTopColor: appBrandMy,
  },
  featureCardWide: {
    flexBasis: 420,
    maxWidth: 640,
  },
  featureCardTitle: {
    fontSize: 17,
    fontFamily: FontFamily.bold,
    color: appBrandBlueDark,
  },
  featureCardBody: {
    fontSize: 14,
    color: appTextMuted,
    lineHeight: 21,
  },
  footer: {
    marginTop: 24,
    backgroundColor: "#041830",
    paddingVertical: 28,
    paddingHorizontal: PAGE_EDGE_INSET,
  },
  footerInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 28,
  },
  poweredCol: {
    gap: 10,
  },
  poweredLabel: {
    fontSize: 13,
    fontFamily: FontFamily.bold,
    color: "rgba(255,255,255,0.75)",
  },
  poweredLogoPlate: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  poweredLogo: {
    width: 140,
    height: 28,
  },
  quickLinksCol: {
    gap: 8,
    minWidth: 160,
  },
  quickLinksTitle: {
    fontSize: 13,
    fontFamily: FontFamily.bold,
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  quickLinkItem: {
    paddingVertical: 2,
  },
  footerLink: {
    fontSize: 14,
    fontFamily: FontFamily.bold,
    color: "#93C5FD",
  },
  pressed: { opacity: 0.82 },
});
