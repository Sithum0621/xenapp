import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';
import GroupChatAvatar from '@/src/components/parent/chat/GroupChatAvatar';
import type { GroupChatListItem } from '@/src/services/groupChatApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { appBorder, appBrandBlueDark, appTextMuted } from '@/src/theme/appBrandPalette';
import { formatChatListTime, truncateChatPreview } from '@/src/utils/groupChatFormat';

type Props = {
  chat: GroupChatListItem;
  onPress: () => void;
  noMessagesLabel: string;
  isLast?: boolean;
};

function TeacherGroupChatListRow({ chat, onPress, noMessagesLabel, isLast = false }: Props) {
  const { t } = useTranslation();

  const preview = chat.lastMessageBody
    ? truncateChatPreview(
        chat.lastSenderName ? `${chat.lastSenderName}: ${chat.lastMessageBody}` : chat.lastMessageBody,
      )
    : chat.groupSource === 'institute' && chat.instituteName
      ? chat.instituteName
      : chat.groupSource === 'personal'
        ? t('teacherDashboard.groupsGroupClassBadge')
        : noMessagesLabel;

  const timeLabel = formatChatListTime(chat.lastMessageAt);

  return (
    <ScrollFriendlyPressable
      accessibilityRole="button"
      accessibilityLabel={t('teacherDashboard.groupsOpenChatA11y', { name: chat.groupName })}
      onPress={onPress}
      style={[styles.row, isLast && styles.rowLast]}
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
        <Text style={[styles.subtitle, !chat.lastMessageBody && styles.subtitleMuted]} numberOfLines={1}>
          {preview}
        </Text>
      </View>
    </ScrollFriendlyPressable>
  );
}

export default memo(TeacherGroupChatListRow);

const styles = StyleSheet.create({
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appBorder,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    width: '100%',
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
    color: appBrandBlueDark,
  },
  time: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    color: appTextMuted,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: appTextMuted,
  },
  subtitleMuted: {
    fontStyle: 'italic',
  },
});
