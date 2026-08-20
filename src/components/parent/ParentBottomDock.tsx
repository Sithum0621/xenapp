import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BottomNavBar, {
  type BottomNavBarProps,
} from '@/src/components/navigation/BottomNavBar';
import NextPaymentBanner, {
  NEXT_PAYMENT_ROW_HEIGHT,
  type NextPaymentBannerProps,
} from '@/src/components/parent/NextPaymentBanner';

const SURFACE = '#FFFFFF';
const BORDER = '#E2E8F0';

/** Tab row height (icons + labels) excluding safe-area inset. */
export const PARENT_NAV_ROW_HEIGHT = 64;

export type ParentBottomDockProps<K extends string = string> = {
  nav: BottomNavBarProps<K>;
  payment: NextPaymentBannerProps | null;
};

/**
 * Fixed bottom bar: tabs + optional next-payment line in one white chrome block.
 */
export default function ParentBottomDock<K extends string = string>({
  nav,
  payment,
}: ParentBottomDockProps<K>) {
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom, 8);

  return (
    <View
      style={[
        styles.dock,
        Platform.OS === 'web' ? styles.dockWeb : null,
        { paddingBottom: safeBottom, pointerEvents: 'box-none' },
      ]}>
      <BottomNavBar
        {...nav}
        embedded
        topSlot={payment ? <NextPaymentBanner {...payment} /> : undefined}
      />
    </View>
  );
}

/** Scroll padding to clear the bottom bar (payment row + tabs + safe area). */
export function parentBottomDockReserve(
  showPayment: boolean,
  bottomInset: number,
): number {
  const safe = Math.max(bottomInset, 8);
  const payment = showPayment ? NEXT_PAYMENT_ROW_HEIGHT : 0;
  return payment + PARENT_NAV_ROW_HEIGHT + safe + 8;
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: SURFACE,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    zIndex: 20,
    ...Platform.select({
      android: { elevation: 12 },
      default: {
        shadowColor: '#00101F',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
    }),
  },
  dockWeb: Platform.select({
    web: {
      boxShadow: '0 -8px 24px rgba(14, 47, 99, 0.10)',
      position: 'fixed',
    },
    default: {},
  }) as object,
});
