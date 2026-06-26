import { Platform, type FlatListProps } from 'react-native';



import { SCROLL_MOMENTUM_PROPS } from '@/src/utils/scrollViewDefaults';



/**

 * Native RecyclerView / UITableView tuning — finger should follow the scroll (chat-app feel).

 * Use with GestureHandler FlatList on iOS/Android; RN FlatList on web.

 */

export const NATIVE_FLUID_LIST_PROPS: Pick<

  FlatListProps<unknown>,

  | 'showsVerticalScrollIndicator'

  | 'keyboardShouldPersistTaps'

  | 'keyboardDismissMode'

  | 'nestedScrollEnabled'

  | 'scrollEventThrottle'

  | 'decelerationRate'

  | 'removeClippedSubviews'

  | 'bounces'

  | 'alwaysBounceVertical'

  | 'overScrollMode'

  | 'directionalLockEnabled'

  | 'delaysContentTouches'

  | 'canCancelContentTouches'

  | 'disableIntervalMomentum'

> = {

  ...SCROLL_MOMENTUM_PROPS,

  showsVerticalScrollIndicator: false,

  removeClippedSubviews: Platform.OS === 'android',

};


