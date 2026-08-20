import {

  Platform,

  ScrollView as RNScrollView,

  type FlatListProps,

  type ScrollViewProps,

} from 'react-native';

import { ScrollView as GHScrollView } from 'react-native-gesture-handler';



/**

 * Gesture Handler ScrollView on iOS/Android cooperates with list pans and RectButton rows.

 * RN ScrollView on web (DOM overflow + CSS in app/+html.tsx).

 */

export const AppScrollComponent = Platform.OS === 'web' ? RNScrollView : GHScrollView;



const WEB_VERTICAL_SCROLL_STYLE = {

  overflowY: 'auto' as const,

  WebkitOverflowScrolling: 'touch' as const,

  overscrollBehaviorY: 'contain' as const,

  touchAction: 'pan-y' as const,

};



const WEB_HORIZONTAL_SCROLL_STYLE = {

  overflowX: 'auto' as const,

  WebkitOverflowScrolling: 'touch' as const,

  overscrollBehaviorX: 'contain' as const,

  touchAction: 'pan-x' as const,

};



/** Applied to vertical scroll surfaces on web (see app/+html.tsx). */
export const WEB_SCROLL_SURFACE_STYLE =
  Platform.OS === 'web' ? WEB_VERTICAL_SCROLL_STYLE : {};



/** Web momentum / pan styles for horizontal scroll surfaces. */

export function webScrollSurfaceStyle(horizontal?: boolean) {

  if (Platform.OS !== 'web') return {};

  return horizontal ? WEB_HORIZONTAL_SCROLL_STYLE : WEB_VERTICAL_SCROLL_STYLE;

}



/**

 * Apply to buttons/cards inside scroll surfaces on web so vertical pans reach the scroller

 * even when the touch starts on an interactive element.

 */

export const WEB_INTERACTIVE_IN_SCROLL_STYLE = Platform.select({

  web: {

    touchAction: 'pan-y' as const,

    cursor: 'pointer' as const,

    userSelect: 'none' as const,

  },

  default: {},

});



/**

 * Shared native momentum tuning (WhatsApp / chat-app pattern):

 * - Finger tracks the list immediately (delaysContentTouches: false)

 * - Scroll cancels an in-progress button press once the finger moves (canCancelContentTouches)

 * - Momentum continues across flicks (disableIntervalMomentum: false, decelerationRate: normal)

 *

 * Pair with ScrollFriendlyPressable (RNGH RectButton, exclusive=false) inside scroll content.

 */

export const SCROLL_MOMENTUM_PROPS = {

  decelerationRate: 'normal' as const,

  scrollEventThrottle: 16,

  nestedScrollEnabled: true,

  keyboardShouldPersistTaps: 'handled' as const,

  keyboardDismissMode: 'on-drag' as const,

  /** Immediate finger tracking — do not wait on child touchables before scrolling. */

  delaysContentTouches: false,

  /** Once the user moves vertically, the scroll view wins over buttons/cards. */

  canCancelContentTouches: true,

  directionalLockEnabled: false,

  bounces: true,

  alwaysBounceVertical: Platform.OS === 'ios',

  overScrollMode: 'always' as const,

  disableIntervalMomentum: false,

};



/** ScrollView / form screens — same momentum as NativeFluidFlatList. */

export const SCROLL_VIEW_TOUCH_PROPS = SCROLL_MOMENTUM_PROPS;



export const FLAT_LIST_SCROLL_PROPS: Pick<FlatListProps<unknown>, 'decelerationRate' | 'scrollEventThrottle'> = {

  decelerationRate: 'normal',

  scrollEventThrottle: 16,

};


