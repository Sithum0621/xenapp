/**
 * Prefer these over raw react-native ScrollView / Pressable inside scrollable content.
 *
 * ## Architecture (WhatsApp-style)
 * 1. One primary scroller per screen: NativeFluidFlatList or AppScrollView
 * 2. Native: react-native-gesture-handler FlatList/ScrollView (not RN core)
 * 3. Buttons/cards in scroll: ScrollFriendlyPressable (RectButton exclusive=false)
 * 4. Web: touch-action pan-y on interactive nodes (+ app/+html.tsx global CSS)
 *
 * ## Do not
 * - Nest ScrollView inside ScrollView
 * - Use raw RN Pressable on full-width rows inside lists
 * - Call preventDefault on touch events during scroll
 */
export { AppScrollView, default as ScrollView } from '@/src/components/layout/AppScrollView';
export { KeyboardAwareModalFrame } from '@/src/components/layout/KeyboardAwareModalFrame';
export { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
export { default as ScrollFriendlyPressable } from '@/src/components/layout/ScrollFriendlyPressable';
export { NativeFluidFlatList } from '@/src/components/layout/NativeFluidFlatList';
export {
  SCROLL_MOMENTUM_PROPS,
  SCROLL_VIEW_TOUCH_PROPS,
  WEB_INTERACTIVE_IN_SCROLL_STYLE,
  WEB_SCROLL_SURFACE_STYLE,
} from '@/src/utils/scrollViewDefaults';
export {
  installWebScrollTouchBootstrap,
  scrollSafePressHandler,
  shouldSuppressScrollConflictPress,
} from '@/src/utils/webScrollTouchBootstrap';
