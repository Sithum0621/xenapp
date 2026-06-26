import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';
import GroupChatAvatar from '@/src/components/parent/chat/GroupChatAvatar';
import type { GroupChatListItem } from '@/src/services/groupChatApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { formatChatListTime, truncateChatPreview } from '@/src/utils/groupChatFormat';

const BRAND_BLUE_DARK = '#0E2F63';
const TEXT_MUTED = '#64748B';
const BORDER = '#E2E8F0';

type Props = {
  chat: GroupChatListItem;
  onPress: () => void;
  noMessagesLabel: string;
};

function ChatListRow({ chat, onPress, noMessagesLabel }: Props) {
  const preview = chat.lastMessageBody
    ? truncateChatPreview(chat.lastMessageBody)
    : noMessagesLabel;
  const timeLabel = formatChatListTime(chat.lastMessageAt);

  return (
    <ScrollFriendlyPressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.row}
      innerStyle={styles.rowInner}>
      <GroupChatAvatar groupName={chat.groupName} size={52} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {chat.groupName}
          </Text>
          {timeLabel ? (
            <Text style={styles.time} numberOfLines={1}>
              {timeLabel}
            </Text>
          ) : null}
        </View>
        <Text style={styles.subtitle} numberOfLines={1}>
          {preview}
        </Text>
      </View>
    </ScrollFriendlyPressable>
  );
}

export default memo(ChatListRow);

const styles = StyleSheet.create({
  row: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  body: { flex: 1, gap: 4, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
  },
  time: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
  },
});
