import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';
import GroupChatAvatar from '@/src/components/parent/chat/GroupChatAvatar';
import type { CommunityChatPreview } from '@/src/services/communityChatApi';
import { XEN_COMMUNITY_TITLE } from '@/src/services/communityChatApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { formatChatListTime, truncateChatPreview } from '@/src/utils/groupChatFormat';

const BRAND_BLUE_DARK = '#00101F';
const TEXT_MUTED = '#64748B';
const BORDER = '#E2E8F0';
const COMMUNITY_ACCENT = '#5B21B6';

type Props = {
  preview: CommunityChatPreview;
  onPress: () => void;
  noMessagesLabel: string;
};

function CommunityChatListRow({ preview, onPress, noMessagesLabel }: Props) {
  const previewText = preview.lastMessageBody
    ? truncateChatPreview(preview.lastMessageBody)
    : noMessagesLabel;
  const timeLabel = formatChatListTime(preview.lastMessageAt);

  return (
    <ScrollFriendlyPressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.row}
      innerStyle={styles.rowInner}>
      <View style={styles.avatarWrap}>
        <GroupChatAvatar groupName={XEN_COMMUNITY_TITLE} size={52} useBrandMark />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {preview.title || XEN_COMMUNITY_TITLE}
          </Text>
          {timeLabel ? (
            <Text style={styles.time} numberOfLines={1}>
              {timeLabel}
            </Text>
          ) : null}
        </View>
        <Text style={styles.subtitle} numberOfLines={1}>
          {previewText}
        </Text>
      </View>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>MyTuition</Text>
      </View>
    </ScrollFriendlyPressable>
  );
}

export default memo(CommunityChatListRow);

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
  avatarWrap: {
    borderRadius: 26,
    borderWidth: 2,
    borderColor: 'rgba(91, 33, 182, 0.2)',
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
    color: COMMUNITY_ACCENT,
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
  badge: {
    backgroundColor: 'rgba(91, 33, 182, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: FontFamily.bold,
    color: COMMUNITY_ACCENT,
    letterSpacing: 0.4,
  },
});
