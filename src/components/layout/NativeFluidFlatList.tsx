import { forwardRef, type ReactElement } from 'react';
import { FlatList as RNFlatList, Platform, type FlatListProps } from 'react-native';
import { FlatList as GHFlatList } from 'react-native-gesture-handler';

import { useKeyboardScrollInset } from '@/src/hooks/useKeyboardScrollInset';
import { NATIVE_FLUID_LIST_PROPS } from '@/src/utils/nativeFluidList';
import { WEB_SCROLL_SURFACE_STYLE } from '@/src/utils/scrollViewDefaults';

export type NativeFluidFlatListProps<ItemT> = FlatListProps<ItemT>;

const FlatListComponent = Platform.OS === 'web' ? RNFlatList : GHFlatList;

function NativeFluidFlatListInner<ItemT>(
  props: NativeFluidFlatListProps<ItemT>,
  ref: React.Ref<RNFlatList<ItemT>>,
): ReactElement {
  const keyboardPadding = useKeyboardScrollInset(16);
  const { style, contentContainerStyle, ...rest } = props;
  return (
    <FlatListComponent
      ref={ref}
      {...rest}
      {...NATIVE_FLUID_LIST_PROPS}
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      style={[WEB_SCROLL_SURFACE_STYLE, style]}
      contentContainerStyle={[
        contentContainerStyle,
        keyboardPadding > 0 ? { paddingBottom: keyboardPadding } : null,
      ]}
    />
  );
}

export const NativeFluidFlatList = forwardRef(NativeFluidFlatListInner) as <ItemT>(
  props: NativeFluidFlatListProps<ItemT> & { ref?: React.Ref<RNFlatList<ItemT>> },
) => ReactElement;

export default NativeFluidFlatList;
