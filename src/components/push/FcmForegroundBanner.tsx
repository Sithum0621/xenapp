import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ForegroundFcmMessage } from '@/src/hooks/useFirebaseMessaging';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { notificationVisual } from '@/src/utils/notificationVisual';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';

export type FcmForegroundBannerProps = {
  message: ForegroundFcmMessage;
  onDismiss: () => void;
};

/** In-app banner for FCM messages received while the app is in the foreground. */
export default function FcmForegroundBanner({ message, onDismiss }: FcmForegroundBannerProps) {
  const insets = useSafeAreaInsets();
  const visual = notificationVisual(message.data?.type, message.data);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification"
        onPress={onDismiss}
        style={({ pressed }) => [
          styles.card,
          { borderColor: `${visual.color}33` },
          pressed && styles.cardPressed,
        ]}>
        <View style={[styles.iconWrap, { backgroundColor: visual.iconBackground }]}>
          <Ionicons name={visual.icon} size={18} color={visual.color} />
        </View>
        <View style={styles.textCol}>
          <Text style={[styles.title, { color: visual.titleColor }]} numberOfLines={2}>
            {message.title}
          </Text>
          {message.body ? (
            <Text style={styles.body} numberOfLines={3}>
              {message.body}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          onPress={onDismiss}
          style={styles.closeBtn}>
          <Ionicons name="close" size={18} color={BRAND_BLUE_DARK} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 9999,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(18, 59, 122, 0.14)',
    shadowColor: '#0E2F63',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  cardPressed: {
    opacity: 0.92,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(18, 59, 122, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FontFamily.regular,
    color: '#475569',
  },
  closeBtn: {
    padding: 2,
  },
});
