import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';

import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';

import {
  parentInkSoft,
  parentSurface,
  parentTileAccentFamily,
  parentTileBrandIconBg,
  parentTileBrandIconBorder,
  parentTileBrandPrimary,
  parentTileGlows,
  parentTileRestShadow,
} from '@/src/theme/parentDashboardPalette';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';

export type DashboardTileAccent = 'games' | 'exams' | 'wallet' | 'attendance';

type ThemeConfig = {
  family: 'teal' | 'purple';
  icon: keyof typeof Ionicons.glyphMap;
};

const THEMES: Record<DashboardTileAccent, ThemeConfig> = {
  games: { family: 'purple', icon: 'game-controller' },
  exams: { family: 'teal', icon: 'school' },
  wallet: { family: 'purple', icon: 'wallet' },
  attendance: { family: 'teal', icon: 'calendar' },
};

const WEB_TILE_TRANSITION = Platform.select({
  web: {
    // @ts-expect-error — web-only CSS
    transitionProperty: 'box-shadow',
    // @ts-expect-error
    transitionDuration: '0.3s',
    // @ts-expect-error
    transitionTimingFunction: 'ease',
  },
  default: {},
}) as ViewStyle;

function tileShadowStyle(accent: DashboardTileAccent, active: boolean): ViewStyle {
  const glow = parentTileGlows[accent];

  if (Platform.OS === 'web') {
    return {
      // @ts-expect-error — web-only CSS
      boxShadow: active ? `0 0 36px ${glow}` : parentTileRestShadow,
      ...WEB_TILE_TRANSITION,
    } as ViewStyle;
  }

  if (active) {
    const glowColor = parentTileAccentFamily[accent] === 'teal' ? '#2A9D8F' : '#B57ED8';
    return {
      shadowColor: glowColor,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.42,
      shadowRadius: 22,
      elevation: 6,
    };
  }

  return {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  };
}

export type DashboardPremiumTileProps = {
  accent: DashboardTileAccent;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  footer?: ReactNode;
  style?: ViewStyle;
  /** Hides the inner panel — children sit directly on the white card body. */
  minimal?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  /** Hover / press glow. Defaults to true. */
  interactive?: boolean;
};

export default function DashboardPremiumTile({
  accent,
  title,
  subtitle,
  children,
  footer,
  style,
  minimal = false,
  onPress,
  disabled = false,
  accessibilityLabel,
  interactive = true,
}: DashboardPremiumTileProps) {
  const theme = THEMES[accent];
  const brandColor = parentTileBrandPrimary[theme.family];
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const body = (
    <>
      <View style={styles.header}>
        <View
          style={[
            styles.iconBadge,
            {
              backgroundColor: parentTileBrandIconBg[theme.family],
              borderColor: parentTileBrandIconBorder[theme.family],
            },
          ]}>
          <Ionicons name={theme.icon} size={22} color={brandColor} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: brandColor }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {children != null ? (
        minimal ? (
          <View style={styles.minimalBody}>{children}</View>
        ) : (
          <View style={styles.contentCard}>{children}</View>
        )
      ) : null}

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </>
  );

  if (!interactive && !onPress) {
    return <View style={[styles.card, tileShadowStyle(accent, false), style]}>{body}</View>;
  }

  return (
    <ScrollFriendlyPressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? title}
      enabled={!disabled}
      onPress={disabled ? undefined : onPress}
      onActiveStateChange={(active) => setPressed(active)}
      // @ts-expect-error — web hover glow on dashboard tiles
      onHoverIn={() => setHovered(true)}
      // @ts-expect-error
      onHoverOut={() => setHovered(false)}
      style={style}
      innerStyle={[
        styles.card,
        tileShadowStyle(
          accent,
          interactive && !disabled && (hovered || pressed),
        ),
      ]}>
      <View pointerEvents="none">{body}</View>
    </ScrollFriendlyPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
    minHeight: 196,
    backgroundColor: parentSurface,
    borderRadius: 22,
    padding: 14,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226, 232, 240, 0.9)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    lineHeight: 23,
    fontFamily: FontFamily.black,
    letterSpacing: -0.35,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
  },
  contentCard: {
    flex: 1,
    width: '100%',
    minHeight: 108,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#EEF2F6',
  },
  footer: {},
  minimalBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
});
