import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { GroupChatMessage } from '@/src/services/groupChatApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { PAGE_EDGE_INSET } from '@/src/theme/pageLayout';
import { formatChatMessageTime } from '@/src/utils/groupChatFormat';

const INCOMING_BG = '#FFFFFF';
const OUTGOING_BG = '#DCFCE7';
const TEXT_MUTED = '#64748B';
const BRAND_BLUE_DARK = '#00101F';

type Props = {
  message: GroupChatMessage;
  showSenderName: boolean;
};

function ChatMessageBubble({ message, showSenderName }: Props) {
  const outgoing = message.isMine;
  const time = formatChatMessageTime(message.createdAt);

  return (
    <View style={[styles.row, outgoing ? styles.rowOutgoing : styles.rowIncoming]}>
      <View style={[styles.bubble, outgoing ? styles.bubbleOutgoing : styles.bubbleIncoming]}>
        {showSenderName && !outgoing ? (
          <Text style={styles.senderName} numberOfLines={1}>
            {message.senderName}
          </Text>
        ) : null}
        <Text style={styles.body}>{message.body}</Text>
        {time ? <Text style={styles.time}>{time}</Text> : null}
      </View>
    </View>
  );
}

export default memo(ChatMessageBubble);

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingVertical: 3,
    maxWidth: '100%',
  },
  rowIncoming: { alignItems: 'flex-start' },
  rowOutgoing: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '82%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  bubbleIncoming: {
    backgroundColor: INCOMING_BG,
    borderTopLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  bubbleOutgoing: {
    backgroundColor: OUTGOING_BG,
    borderTopRightRadius: 4,
  },
  senderName: {
    fontSize: 12,
    fontFamily: FontFamily.bold,
    color: '#041830',
  },
  body: {
    fontSize: 15,
    fontFamily: FontFamily.regular,
    color: BRAND_BLUE_DARK,
    lineHeight: 20,
  },
  time: {
    fontSize: 11,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
    alignSelf: 'flex-end',
  },
});
