import {
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import { useKeyboardBottomInset } from '@/src/hooks/useKeyboardBottomInset';

const KeyboardAwareActiveContext = createContext(false);

export type KeyboardAwareScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  dismissOnPressOutside?: boolean;
  /** iOS: KeyboardAvoidingView. Android: bottom inset while keyboard is open. */
  avoidKeyboard?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
};

/**
 * Optional keyboard shell for explicit screens (modals, admin shell).
 * Stack navigators should use `globalStackScreenLayout` instead (no avoiding view).
 */
export function KeyboardAwareScreen({
  children,
  scroll = false,
  dismissOnPressOutside = true,
  avoidKeyboard = true,
  style,
  contentContainerStyle,
  keyboardVerticalOffset,
}: KeyboardAwareScreenProps) {
  const insets = useSafeAreaInsets();
  const parentActive = useContext(KeyboardAwareActiveContext);

  if (parentActive) {
    return <>{children}</>;
  }

  const offset = keyboardVerticalOffset ?? insets.top;
  const androidKeyboardInset = useKeyboardBottomInset({
    includeSafeAreaWhenKeyboardHidden: false,
  });
  const useIosAvoiding = avoidKeyboard && Platform.OS === 'ios';
  const useAndroidInset = avoidKeyboard && Platform.OS === 'android' && androidKeyboardInset > 0;

  const body = scroll ? (
    <KeyboardAwareScrollView
      style={[styles.flex, style]}
      contentContainerStyle={contentContainerStyle}>
      {children}
    </KeyboardAwareScrollView>
  ) : (
    <View style={[styles.flex, style]}>{children}</View>
  );

  const dismissible =
    dismissOnPressOutside && Platform.OS !== 'web' ? (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.flex}>{body}</View>
      </TouchableWithoutFeedback>
    ) : (
      body
    );

  if (!useIosAvoiding) {
    return (
      <View
        style={[
          styles.flex,
          style,
          useAndroidInset ? { paddingBottom: androidKeyboardInset } : null,
        ]}>
        {dismissible}
      </View>
    );
  }

  return (
    <KeyboardAwareActiveContext.Provider value>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={offset}>
        {dismissible}
      </KeyboardAvoidingView>
    </KeyboardAwareActiveContext.Provider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
