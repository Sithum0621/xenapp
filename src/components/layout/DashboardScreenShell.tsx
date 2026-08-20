import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BrandHeader from '@/src/components/parent/BrandHeader';
import { useAppThemeColors } from '@/src/context/ThemePreferenceContext';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { PAGE_CONTENT_TOP, PAGE_EDGE_INSET } from '@/src/theme/pageLayout';
import { blurWebActiveElement } from '@/src/utils/webScrollTouchBootstrap';

export type DashboardScreenShellProps = {
  children: ReactNode;
  /** Show back row under BrandHeader (sub-screens). */
  showBack?: boolean;
  onBack?: () => void;
  /** Optional screen title under the back row. */
  title?: string;
  subtitle?: string;
  /** Safe area edges; default top/left/right like home stack screens. */
  edges?: ('top' | 'right' | 'bottom' | 'left')[];
  contentStyle?: StyleProp<ViewStyle>;
  /** When false, children manage their own horizontal padding. Default true. */
  padContent?: boolean;
};

/**
 * Home-matching chrome: BrandHeader + optional back/title + 16px page gutters.
 */
export default function DashboardScreenShell({
  children,
  showBack = false,
  onBack,
  title,
  subtitle,
  edges = ['top', 'left', 'right'],
  contentStyle,
  padContent = true,
}: DashboardScreenShellProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useAppThemeColors();

  const handleBack = () => {
    blurWebActiveElement();
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.page }]} edges={edges}>
      <BrandHeader />
      {showBack || title || subtitle ? (
        <View style={styles.subHeader}>
          {showBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('appLock.back')}
              onPress={handleBack}
              onPressIn={blurWebActiveElement}
              style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}>
              <Ionicons name="chevron-back" size={22} color={colors.brandBlueDark} />
              <Text style={[styles.backLabel, { color: colors.brandBlueDark }]}>
                {t('appLock.back')}
              </Text>
            </Pressable>
          ) : null}
          {title ? (
            <Text style={[styles.title, { color: colors.brandBlueDark }]} accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>
          ) : null}
        </View>
      ) : null}
      <View style={[padContent ? styles.contentPad : styles.contentFlex, contentStyle]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  subHeader: {
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 4,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  pressed: { opacity: 0.75 },
  backLabel: {
    fontSize: 16,
    fontFamily: FontFamily.bold,
  },
  title: {
    fontSize: 22,
    fontFamily: FontFamily.black,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    lineHeight: 20,
  },
  contentPad: {
    flex: 1,
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: PAGE_CONTENT_TOP,
  },
  contentFlex: { flex: 1 },
});
