import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/src/theme/Text';
import { Pressable, useWindowDimensions, View } from 'react-native';

import {
  ALERT_BANNER_STACK_BREAKPOINT,
  alertBannerStyles as styles,
} from '@/src/theme/alertBannerStyles';
import { appSurface, appWarnBanner } from '@/src/theme/appBrandPalette';

export type TempPasswordBannerProps = {
  message: string;
  actionLabel: string;
  onPressAction: () => void;
  hintLabel?: string;
};

/**
 * Warning banner for users still on a temporary password.
 * Stacks vertically on narrow widths so the action button stays tappable on mobile.
 */
export default function TempPasswordBanner({
  message,
  actionLabel,
  onPressAction,
  hintLabel,
}: TempPasswordBannerProps) {
  const { width } = useWindowDimensions();
  const stacked = width < ALERT_BANNER_STACK_BREAKPOINT;

  return (
    <View
      accessibilityRole="alert"
      // @ts-expect-error RN Web data attribute for global alert banner CSS
      dataSet={{ xenAlertBanner: 'true' }}
      style={[styles.shell, stacked && styles.shellStacked]}>
      <View style={[styles.topRow, stacked && styles.topRowStacked]}>
        <View style={styles.iconWrap}>
          <Ionicons name="warning-outline" size={20} color={appWarnBanner.accent} />
        </View>
        <View style={styles.body}>
          <Text style={styles.message}>{message}</Text>
          {hintLabel ? <Text style={styles.hint}>{hintLabel}</Text> : null}
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        onPress={onPressAction}
        style={({ pressed }) => [
          styles.actionBtn,
          stacked && styles.actionBtnStacked,
          pressed && styles.actionBtnPressed,
        ]}>
        <Ionicons name="key-outline" size={16} color={appSurface} />
        <Text style={styles.actionText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}
