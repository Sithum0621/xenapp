import { type ComponentType, type ReactNode, useMemo } from 'react';

import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { RectButton, type RectButtonProps } from 'react-native-gesture-handler';



import { WEB_INTERACTIVE_IN_SCROLL_STYLE } from '@/src/utils/scrollViewDefaults';

import { scrollSafePressHandler, blurWebActiveElement } from '@/src/utils/webScrollTouchBootstrap';

const GHRectButton = RectButton as ComponentType<Record<string, unknown>>;



export type ScrollFriendlyPressableProps = Omit<
  RectButtonProps,
  'style' | 'children' | 'onPressIn' | 'onPressOut'
> & {
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
  disabled?: boolean;
  onPressIn?: () => void;
  onPressOut?: () => void;
  onHoverIn?: () => void;
  onHoverOut?: () => void;
};



/**

 * Touch targets inside scroll surfaces — native-app scroll feel on every platform.

 *

 * - Native: RNGH RectButton (exclusive=false) cooperates with GH FlatList/ScrollView;

 *   no delayPressIn — momentum stays immediate; canCancelContentTouches cancels taps mid-pan.

 * - Web: Pressable + touch-action: pan-y + scroll-safe onPress (passive listeners, no preventDefault).

 */

export default function ScrollFriendlyPressable({

  children,

  style,

  innerStyle,

  rippleColor = 'transparent',

  underlayColor = 'transparent',

  activeOpacity = 0.92,

  exclusive = false,

  disabled,

  enabled,

  onPress,

  onPressIn,

  onPressOut,

  onHoverIn,

  onHoverOut,

  ...rest

}: ScrollFriendlyPressableProps) {

  const isDisabled = disabled === true || enabled === false;

  const safeOnPress = useMemo(() => scrollSafePressHandler(onPress ?? undefined), [onPress]);



  if (Platform.OS === 'web') {

    return (

      <Pressable

        {...(rest as object)}

        disabled={isDisabled}

        onPress={() => {
          safeOnPress?.(false);
        }}

        onPressIn={() => {
          blurWebActiveElement();
          onPressIn?.();
        }}

        onPressOut={onPressOut}

        {...({ onHoverIn, onHoverOut } as object)}

        style={[style, WEB_INTERACTIVE_IN_SCROLL_STYLE]}>

        <View style={[styles.inner, innerStyle]}>

          {children}

        </View>

      </Pressable>

    );

  }



  return (

    <GHRectButton

      exclusive={exclusive}

      rippleColor={rippleColor}

      underlayColor={underlayColor}

      activeOpacity={activeOpacity}

      enabled={!isDisabled}

      onPress={safeOnPress}

      onPressIn={onPressIn ? (_inside: boolean) => onPressIn() : undefined}

      onPressOut={onPressOut ? (_inside: boolean) => onPressOut() : undefined}

      style={style}

      {...(rest as object)}>

      <View style={[styles.inner, innerStyle]}>

        {children}

      </View>

    </GHRectButton>

  );

}



const styles = StyleSheet.create({

  inner: {

    alignSelf: 'stretch',

    pointerEvents: 'none',

  },

});


