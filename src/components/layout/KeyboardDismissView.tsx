import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export type KeyboardDismissViewProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** @deprecated Root TouchableWithoutFeedback stole scroll gestures; use keyboardDismissMode on scroll views. */
  dismissOnPressOutside?: boolean;
};

/** Flex shell for stack screens. Keyboard dismiss is handled by scroll views (`keyboardDismissMode: on-drag`). */
export function KeyboardDismissView({ children, style }: KeyboardDismissViewProps) {
  return <View style={[styles.flex, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
