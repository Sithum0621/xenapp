import { type ReactNode, useMemo } from 'react';

import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { RectButton, type RectButtonProps } from 'react-native-gesture-handler';



import { WEB_INTERACTIVE_IN_SCROLL_STYLE } from '@/src/utils/scrollViewDefaults';

import { scrollSafePressHandler } from '@/src/utils/webScrollTouchBootstrap';



export type ScrollFriendlyPressableProps = Omit<RectButtonProps, 'style' | 'children'> & {

  style?: StyleProp<ViewStyle>;

  innerStyle?: StyleProp<ViewStyle>;

  children: ReactNode;

  disabled?: boolean;

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

  ...rest

}: ScrollFriendlyPressableProps) {

  const isDisabled = disabled === true || enabled === false;

  const safeOnPress = useMemo(() => scrollSafePressHandler(onPress ?? undefined), [onPress]);



  if (Platform.OS === 'web') {

    return (

      <Pressable

        disabled={isDisabled}

        onPress={safeOnPress}

        style={[style, WEB_INTERACTIVE_IN_SCROLL_STYLE]}

        {...rest}>

        <View style={[styles.inner, innerStyle]} pointerEvents="none">

          {children}

        </View>

      </Pressable>

    );

  }



  return (

    <RectButton

      exclusive={exclusive}

      rippleColor={rippleColor}

      underlayColor={underlayColor}

      activeOpacity={activeOpacity}

      enabled={!isDisabled}

      onPress={safeOnPress}

      style={style}

      {...rest}>

      <View style={[styles.inner, innerStyle]} pointerEvents="none">

        {children}

      </View>

    </RectButton>

  );

}



const styles = StyleSheet.create({

  inner: {

    alignSelf: 'stretch',

  },

});


