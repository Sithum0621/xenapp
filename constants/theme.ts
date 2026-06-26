/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

/** Primary UI font — loaded via `@expo-google-fonts/lato` in `app/_layout.tsx`. */
export const Fonts = Platform.select({
  ios: {
    sans: 'Lato_400Regular',
    serif: 'Lato_400Regular',
    rounded: 'Lato_400Regular',
    mono: 'Courier',
  },
  default: {
    sans: 'Lato_400Regular',
    serif: 'Lato_400Regular',
    rounded: 'Lato_400Regular',
    mono: 'monospace',
  },
  web: {
    sans: 'Lato_400Regular, Lato, system-ui, sans-serif',
    serif: 'Lato_400Regular, Lato, system-ui, sans-serif',
    rounded: 'Lato_400Regular, Lato, system-ui, sans-serif',
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
  },
});
