import { LinearGradient } from 'expo-linear-gradient';
import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import MyTuitionLogo from '@/src/components/brand/MyTuitionLogo';
import { useAppThemeColors } from '@/src/context/ThemePreferenceContext';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { PAGE_EDGE_INSET } from '@/src/theme/pageLayout';

export type BrandHeaderProps = {
  helloPrefix?: string;
  userName?: string | null;
  trailing?: ReactNode;
};

/** Brand strip: MyTuition logo (left), optional compact greeting (right). */
function BrandHeader({ helloPrefix, userName, trailing }: BrandHeaderProps) {
  const colors = useAppThemeColors();
  const showGreeting = Boolean(helloPrefix?.trim() && userName?.trim());
  const showTrailing = Boolean(trailing);

  return (
    <LinearGradient
      colors={[...colors.brandSurfaceGradient]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.strip}>
      <View style={styles.logoCol}>
        <MyTuitionLogo variant="mark" showWordmark />
      </View>

      {showGreeting || showTrailing ? (
        <View style={styles.trailingCol}>
          {showGreeting ? (
            <Text style={styles.greeting} numberOfLines={1} accessibilityRole="header">
              <Text style={[styles.greetingPrefix, { color: colors.brandBlueDark }]}>
                {helloPrefix},{' '}
              </Text>
              <Text style={[styles.greetingName, { color: colors.brandOrange }]}>{userName}</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: 14,
    paddingBottom: 12,
    width: '100%',
    minHeight: 64,
    gap: 12,
  },
  logoCol: {
    justifyContent: 'center',
    alignItems: 'flex-start',
    flexShrink: 1,
    minWidth: 0,
  },
  trailingCol: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    flexShrink: 0,
    maxWidth: '58%',
  },
  greeting: {
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'right',
    flexShrink: 1,
  },
  greetingPrefix: {
    fontFamily: FontFamily.regular,
  },
  greetingName: {
    fontFamily: FontFamily.bold,
  },
});

export default memo(BrandHeader);
