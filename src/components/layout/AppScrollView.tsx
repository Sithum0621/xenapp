import { forwardRef, type ReactElement } from 'react';
import { Platform, type ScrollView, type ScrollViewProps } from 'react-native';

import { useKeyboardScrollInset } from '@/src/hooks/useKeyboardScrollInset';
import {
  AppScrollComponent,
  SCROLL_VIEW_TOUCH_PROPS,
  webScrollSurfaceStyle,
} from '@/src/utils/scrollViewDefaults';

export type AppScrollViewProps = ScrollViewProps & {
  /** Added to keyboard height for contentContainerStyle paddingBottom. */
  keyboardExtraPadding?: number;
};

/**
 * Default scroll container for forms and detail screens (non-list tabs).
 * List tabs should use NativeFluidFlatList instead.
 */
export const AppScrollView = forwardRef<ScrollView, AppScrollViewProps>(function AppScrollView(
  {
    children,
    horizontal,
    contentContainerStyle,
    keyboardExtraPadding = 24,
    style,
    ...rest
  },
  ref,
): ReactElement {
  const keyboardPadding = useKeyboardScrollInset(
    horizontal === true ? 0 : keyboardExtraPadding,
  );

  return (
    <AppScrollComponent
      ref={ref}
      horizontal={horizontal}
      {...rest}
      {...(SCROLL_VIEW_TOUCH_PROPS as ScrollViewProps)}
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      style={[webScrollSurfaceStyle(horizontal === true), style]}
      contentContainerStyle={[
        contentContainerStyle,
        !horizontal && keyboardPadding > 0 ? { paddingBottom: keyboardPadding } : null,
      ]}>
      {children}
    </AppScrollComponent>
  );
});

export default AppScrollView;
