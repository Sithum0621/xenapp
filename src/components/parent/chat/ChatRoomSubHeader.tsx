import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import GroupChatAvatar from '@/src/components/parent/chat/GroupChatAvatar';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';

const BRAND_BLUE_DARK = '#0E2F63';
const TEXT_MUTED = '#64748B';
const BORDER = '#E2E8F0';
const SURFACE = '#FFFFFF';

type Props = {
  groupName: string;
  subtitle?: string;
  imageUrl?: string | null;
  onBack: () => void;
  backLabel: string;
  onSettings?: () => void;
  settingsLabel?: string;
};

function ChatRoomSubHeader({
  groupName,
  subtitle,
  imageUrl,
  onBack,
  backLabel,
  onSettings,
  settingsLabel,
}: Props) {
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        onPress={onBack}
        hitSlop={8}
        style={({ pressed }) => [styles.backBtn, pressed && styles.backPressed]}>
        <Ionicons name="chevron-back" size={24} color={BRAND_BLUE_DARK} />
      </Pressable>
      <GroupChatAvatar groupName={groupName} size={36} imageUrl={imageUrl} />
      <View style={styles.textCol}>
        <Text style={styles.title} numberOfLines={1}>
          {groupName}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onSettings ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={settingsLabel ?? 'Settings'}
          onPress={onSettings}
          hitSlop={8}
          style={({ pressed }) => [styles.settingsBtn, pressed && styles.backPressed]}>
          <Ionicons name="settings-outline" size={22} color={BRAND_BLUE_DARK} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default memo(ChatRoomSubHeader);

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: SURFACE,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  backBtn: {
    padding: 4,
    marginRight: 2,
  },
  backPressed: { opacity: 0.7 },
  textCol: { flex: 1, minWidth: 0, gap: 1 },
  title: {
    fontSize: 16,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
  },
  settingsBtn: {
    padding: 6,
    marginLeft: 2,
  },
});
