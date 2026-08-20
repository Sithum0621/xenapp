import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/src/theme/Text';
import { type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  parentBorder,
  parentInk,
  parentInkSoft,
  parentNavActive,
  parentNavActiveTint,
  parentSurface,
} from '@/src/theme/parentDashboardPalette';

const TEXT_MUTED = parentInkSoft;
const BORDER = parentBorder;
const SURFACE = parentSurface;

export type BottomNavItem<K extends string = string> = {
  key: K;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
};

export type BottomNavBarProps<K extends string = string> = {
  items: ReadonlyArray<BottomNavItem<K>>;
  activeKey: K;
  onSelect: (key: K) => void;
  /** Optional row above tabs (e.g. next-payment countdown), same bar background. */
  topSlot?: ReactNode;
  /** When true, omits absolute positioning and safe-area padding (parent dock supplies both). */
  embedded?: boolean;
};

export default function BottomNavBar<K extends string = string>({
  items,
  activeKey,
  onSelect,
  topSlot,
  embedded = false,
}: BottomNavBarProps<K>) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.shell,
        topSlot ? styles.shellWithTop : null,
        embedded ? styles.shellEmbedded : null,
        !embedded && Platform.OS === 'web' ? styles.shellWeb : null,
        !embedded ? { paddingBottom: Math.max(insets.bottom, 8) } : null,
      ]}>
      {topSlot ? <View style={styles.topSlot}>{topSlot}</View> : null}
      <View style={styles.tabRow} accessibilityRole="tablist">
        {items.map((item) => {
          const isActive = item.key === activeKey;
          const iconName = isActive && item.activeIcon ? item.activeIcon : item.icon;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={item.accessibilityLabel ?? item.label}
              onPress={() => onSelect(item.key)}
              style={({ pressed }) => [
                styles.item,
                isActive && styles.itemActive,
                pressed && styles.itemPressed,
              ]}
              hitSlop={6}>
              <View style={styles.iconWrap}>
                <Ionicons
                  name={iconName}
                  size={22}
                  color={isActive ? parentInk : TEXT_MUTED}
                />
              </View>
              <Text
                numberOfLines={1}
                style={[styles.label, isActive ? styles.labelActive : styles.labelInactive]}>
                {item.label}
              </Text>
              {isActive ? <View style={styles.activeIndicator} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: SURFACE,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    paddingHorizontal: 8,
    paddingTop: 10,
  },
  shellWithTop: {
    paddingTop: 0,
  },
  shellWeb: Platform.select({
    web: {
      boxShadow: '0 -6px 18px rgba(14, 47, 99, 0.06)',
      position: 'fixed',
    },
    default: {},
  }) as object,
  shellEmbedded: {
    position: 'relative',
    left: undefined,
    right: undefined,
    bottom: undefined,
    borderTopWidth: 0,
    backgroundColor: 'transparent',
  },
  topSlot: {
    width: '100%',
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    width: '100%',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 6,
    gap: 4,
    borderRadius: 14,
    minHeight: 56,
  },
  itemActive: {
    backgroundColor: parentNavActiveTint,
  },
  itemPressed: { opacity: 0.7 },
  iconWrap: {
    width: 44,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  labelActive: { color: parentInk },
  labelInactive: { color: TEXT_MUTED },
  activeIndicator: {
    width: 20,
    height: 2.5,
    borderRadius: 999,
    backgroundColor: parentNavActive,
    marginTop: 2,
    opacity: 0.85,
  },
});
