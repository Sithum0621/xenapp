import { forwardRef } from 'react';
import { type ScrollView } from 'react-native';

import {
  AppScrollView,
  type AppScrollViewProps,
} from '@/src/components/layout/AppScrollView';

export type KeyboardAwareScrollViewProps = AppScrollViewProps;

/**
 * ScrollView that stays scrollable above the keyboard and adds bottom inset while typing.
 */
export const KeyboardAwareScrollView = forwardRef<ScrollView, KeyboardAwareScrollViewProps>(
  function KeyboardAwareScrollView(props, ref) {
    return <AppScrollView ref={ref} {...props} />;
  },
);
