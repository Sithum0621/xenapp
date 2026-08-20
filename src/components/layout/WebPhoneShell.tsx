import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Matches post-login content column (`DashboardSubscriptionWrapper` default).
 * Web/PC: centered column. Mobile/native: full width (unchanged).
 */
export const WEB_AUTH_MAX_WIDTH = 520;

/** @deprecated Use WEB_AUTH_MAX_WIDTH */
export const WEB_PHONE_MAX_WIDTH = WEB_AUTH_MAX_WIDTH;

type WebPhoneShellProps = {
  children: React.ReactNode;
  /** Backdrop behind the centered column on wide screens. Prefer page/surface color. */
  backdropColor?: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

/**
 * Auth-only layout shell (login / signup / related).
 * On web (PC), centers content at the same max width as dashboard pages.
 * Native apps stay full-bleed — same as mobile dashboard.
 */
export function WebPhoneShell({
  children,
  backdropColor = '#F8FAFC',
  style,
  contentStyle,
}: WebPhoneShellProps) {
  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  return (
    <View style={[styles.outer, { backgroundColor: backdropColor }, style]}>
      <View style={[styles.column, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: WEB_AUTH_MAX_WIDTH,
    alignSelf: 'center',
    // Keep shadows/borders inside; avoid clipping scroll on web.
    overflow: 'visible',
  },
});
