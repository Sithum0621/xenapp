import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  View,
  type ModalProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardBottomInset } from '@/src/hooks/useKeyboardBottomInset';

export type KeyboardAwareModalFrameProps = {
  visible: boolean;
  onRequestClose: () => void;
  children: ReactNode;
  animationType?: ModalProps['animationType'];
  transparent?: boolean;
  overlayStyle?: StyleProp<ViewStyle>;
};

/**
 * Modal shell that keeps form fields and actions visible while the keyboard is open.
 * Use for centered cards and bottom sheets with TextInputs.
 */
export function KeyboardAwareModalFrame({
  visible,
  onRequestClose,
  children,
  animationType = 'fade',
  transparent = true,
  overlayStyle,
}: KeyboardAwareModalFrameProps) {
  const insets = useSafeAreaInsets();
  const androidKeyboardInset = useKeyboardBottomInset({
    includeSafeAreaWhenKeyboardHidden: false,
  });

  const overlayBottomPad =
    Platform.OS === 'android' && androidKeyboardInset > 0
      ? androidKeyboardInset
      : insets.bottom;

  return (
    <Modal
      visible={visible}
      transparent={transparent}
      animationType={animationType}
      onRequestClose={onRequestClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
        <View style={[styles.overlay, overlayStyle, { paddingBottom: overlayBottomPad }]}>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 16,
  },
});
