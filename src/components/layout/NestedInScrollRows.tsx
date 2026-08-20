import { type ComponentType, type ReactElement, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Renders list rows inside a parent ScrollView without a nested VirtualizedList.
 * FlatList with scrollEnabled={false} often steals slow pan gestures from the parent.
 */
export type NestedInScrollRowsProps<T> = {
  data: readonly T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: (info: { item: T; index: number }) => ReactElement | null;
  ItemSeparatorComponent?: ComponentType | null;
  style?: StyleProp<ViewStyle>;
  ListHeaderComponent?: ComponentType | (() => ReactNode) | ReactNode | null;
};

export default function NestedInScrollRows<T>({
  data,
  keyExtractor,
  renderItem,
  ItemSeparatorComponent,
  style,
  ListHeaderComponent,
}: NestedInScrollRowsProps<T>) {
  const Sep = ItemSeparatorComponent;
  let header: ReactNode = null;
  if (ListHeaderComponent != null) {
    if (typeof ListHeaderComponent === 'function') {
      const Header = ListHeaderComponent as ComponentType;
      header = <Header />;
    } else {
      header = ListHeaderComponent;
    }
  }

  return (
    <View style={style}>
      {header}
      {data.map((item, index) => {
        const key = keyExtractor(item, index);
        const row = renderItem({ item, index });
        if (row == null) return null;
        return (
          <View key={key}>
            {row}
            {Sep != null && index < data.length - 1 ? <Sep /> : null}
          </View>
        );
      })}
    </View>
  );
}
