import {
  Platform,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextStyle,
} from 'react-native';

import { FontFamily } from '@/src/theme/fonts';

/**
 * App-wide `TextInput` using Lato Regular. Use instead of RN `TextInput` for
 * consistent typography with labels and buttons.
 */
export function TextInput({ style, ...rest }: TextInputProps) {
  const flat = (Array.isArray(style) ? Object.assign({}, ...style) : style) as
    | TextStyle
    | undefined;
  const fontFamily = flat?.fontFamily ?? FontFamily.regular;

  return (
    <RNTextInput
      {...rest}
      {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
      style={[
        { fontFamily, fontSize: 16, lineHeight: 22 },
        style,
        Platform.OS === 'android' ? { fontWeight: undefined } : null,
      ]}
    />
  );
}
