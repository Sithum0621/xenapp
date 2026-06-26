import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Extra bottom padding for ScrollView content while the software keyboard is open.
 * No-op on web (browser handles viewport).
 */
export function useKeyboardScrollInset(extraPadding = 24): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setInset(event.endCoordinates.height + extraPadding);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setInset(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [extraPadding]);

  return inset;
}
