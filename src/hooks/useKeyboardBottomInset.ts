import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Options = {
  /** When the keyboard is hidden, include bottom safe-area inset (chat composer, modals). */
  includeSafeAreaWhenKeyboardHidden?: boolean;
};

/**
 * Bottom spacing for fixed footers and modal overlays.
 * Android: lifts content above the software keyboard (same pattern as chat composer).
 * iOS: safe-area only — pair with KeyboardAvoidingView for the keyboard height.
 */
export function useKeyboardBottomInset(options?: Options): number {
  const { includeSafeAreaWhenKeyboardHidden = true } = options ?? {};
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (keyboardHeight > 0) {
    return keyboardHeight;
  }

  return includeSafeAreaWhenKeyboardHidden ? insets.bottom : 0;
}
