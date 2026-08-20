import {
  Lato_300Light,
  Lato_400Regular,
  Lato_400Regular_Italic,
  Lato_700Bold,
  Lato_700Bold_Italic,
  Lato_900Black,
  Lato_900Black_Italic,
  useFonts,
} from "@expo-google-fonts/lato";
import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, usePathname, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import AppLockGate from "@/src/components/app-lock/AppLockGate";
import AuthRouteGuard from "@/src/components/auth/AuthRouteGuard";
import SessionTimeoutGuard from "@/src/components/auth/SessionTimeoutGuard";
import TempPasswordGuard from "@/src/components/auth/TempPasswordGuard";
import FcmBootstrap from "@/src/components/push/FcmBootstrap";
import { AppAlertProvider } from "@/src/context/AppAlertContext";
import { AppLockProvider } from "@/src/context/AppLockContext";
import {
  ThemePreferenceProvider,
  useAppThemeColors,
} from "@/src/context/ThemePreferenceContext";
import {
  globalStackScreenLayout,
  globalStackScreenOptions,
} from "@/src/navigation/globalStackKeyboardLayout";
import { supabase } from "@/src/services/supabaseClient";
import { FontFamily } from "@/src/theme/fonts";
import { isStaleAuthSessionError } from "@/src/utils/authSessionErrors";
import {
  blurWebActiveElement,
  installWebScrollTouchBootstrap,
} from "@/src/utils/webScrollTouchBootstrap";

/** Stable segment for Expo Router reload behavior; XEN entry is `index` → role/login/dashboard. */
export const unstable_settings = {
  anchor: "index",
};

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootLayoutNav() {
  const colors = useAppThemeColors();
  const appRouter = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (Platform.OS !== "web") return;
    return installWebScrollTouchBootstrap();
  }, []);

  useEffect(() => {
    blurWebActiveElement();
  }, [pathname]);

  useEffect(() => {
    let signOutInProgress = false;

    const forceLogout = async () => {
      if (signOutInProgress) return;
      signOutInProgress = true;
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        await supabase.auth.signOut().catch(() => {});
      }
      appRouter.replace("/login");
      signOutInProgress = false;
    };

    void supabase.auth.getSession().then(({ error }) => {
      if (isStaleAuthSessionError(error)) {
        void forceLogout();
      }
    });

    return () => {
      signOutInProgress = false;
    };
  }, [appRouter]);

  const navigationFonts = {
    regular: {
      fontFamily: FontFamily.regular,
      fontWeight: "400" as const,
    },
    medium: {
      fontFamily: FontFamily.bold,
      fontWeight: "500" as const,
    },
    bold: {
      fontFamily: FontFamily.bold,
      fontWeight: "700" as const,
    },
    heavy: {
      fontFamily: FontFamily.black,
      fontWeight: "800" as const,
    },
  };

  const theme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: colors.page,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      primary: colors.brandRoyal,
    },
    fonts: {
      ...DefaultTheme.fonts,
      ...navigationFonts,
    },
  };

  return (
    <ThemeProvider value={theme}>
      <AppAlertProvider>
        <AppLockProvider>
          {/*
            Do not enumerate every route here: explicit Stack.Screen entries limit the navigator to only
            those names and break nested URLs (e.g. teacher-dashboard/group-detail). Undeclared routes are
            auto-registered from the file system; keep Stack.Screen only where options differ from defaults.
          */}
          <Stack
            initialRouteName="index"
            screenLayout={globalStackScreenLayout}
            screenOptions={{
              headerShown: false,
              ...globalStackScreenOptions,
              contentStyle: { backgroundColor: colors.page },
            }}
          >
            <Stack.Screen
              name="modal"
              options={{
                presentation: "modal",
                title: "Modal",
                headerShown: true,
              }}
            />
          </Stack>
          <AppLockGate />
          <AuthRouteGuard />
          <SessionTimeoutGuard />
          <TempPasswordGuard />
          <FcmBootstrap />
          <StatusBar style={colors.statusBarStyle} />
        </AppLockProvider>
      </AppAlertProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Lato_300Light,
    Lato_400Regular,
    Lato_400Regular_Italic,
    Lato_700Bold,
    Lato_700Bold_Italic,
    Lato_900Black,
    Lato_900Black_Italic,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemePreferenceProvider>
        <RootLayoutNav />
      </ThemePreferenceProvider>
    </GestureHandlerRootView>
  );
}
