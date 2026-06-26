import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  StyleSheet,
  View,
  type FlatList,
} from 'react-native';

import { NativeFluidFlatList } from '@/src/components/layout/NativeFluidFlatList';
import ChatComposer from '@/src/components/parent/chat/ChatComposer';
import ChatMessageBubble from '@/src/components/parent/chat/ChatMessageBubble';
import GroupChatRoomShell from '@/src/components/parent/chat/GroupChatRoomShell';
import { useGroupChatRoom } from '@/src/hooks/useGroupChatRoom';
import {
  fetchCommunityChatMessages,
  sendCommunityChatMessage,
  XEN_COMMUNITY_TITLE,
} from '@/src/services/communityChatApi';
import type { GroupChatMessage } from '@/src/services/groupChatApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { FLAT_LIST_PERF_SCROLLABLE } from '@/src/utils/flatListPerf';

const TEXT_MUTED = '#64748B';

export type CommunityChatRoomProps = {
  embedded?: boolean;
};

export default function CommunityChatRoom({ embedded = false }: CommunityChatRoomProps) {
  const { t } = useTranslation();
  const listRef = useRef<FlatList<GroupChatMessage>>(null);

  const fetchMessages = useCallback(async () => fetchCommunityChatMessages(), []);

  const { loading, messages, error, reloadQuiet } = useGroupChatRoom({
    enabled: true,
    fetchMessages,
  });

  const handleSend = useCallback(
    async (body: string): Promise<boolean> => {
      const res = await sendCommunityChatMessage(body);
      if (!res.ok) return false;
      await reloadQuiet();
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
      return true;
    },
    [reloadQuiet],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: GroupChatMessage; index: number }) => {
      const prev = index > 0 ? messages[index - 1] : null;
      const showSenderName = !item.isMine && prev?.senderId !== item.senderId;
      return <ChatMessageBubble message={item} showSenderName={showSenderName} />;
    },
    [messages],
  );

  const keyExtractor = useCallback((item: GroupChatMessage) => item.id, []);

  const listEmpty = useMemo(() => {
    if (loading) return null;
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>{t('communityChat.empty')}</Text>
      </View>
    );
  }, [loading, t]);

  return (
    <View style={[styles.wrap, embedded && styles.wrapEmbedded]}>
      {embedded ? (
        <Text style={styles.embeddedTitle}>{XEN_COMMUNITY_TITLE}</Text>
      ) : null}
      <Text style={styles.hint}>{t('communityChat.hint')}</Text>

      <GroupChatRoomShell
        footer={
          <ChatComposer
            placeholder={t('communityChat.inputPlaceholder')}
            sendLabel={t('communityChat.send')}
            onSend={handleSend}
          />
        }>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#123B7A" />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <NativeFluidFlatList
            ref={listRef}
            data={messages}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={listEmpty}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onContentSizeChange={() => {
              if (messages.length > 0) {
                listRef.current?.scrollToEnd({ animated: false });
              }
            }}
            {...FLAT_LIST_PERF_SCROLLABLE}
          />
        )}
      </GroupChatRoomShell>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 8 },
  wrapEmbedded: { minHeight: 420 },
  embeddedTitle: {
    fontSize: 18,
    fontFamily: FontFamily.bold,
    color: '#0E2F63',
  },
  hint: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
    lineHeight: 18,
  },
  listContent: {
    paddingVertical: 12,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    minHeight: 200,
  },
  errorText: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
    textAlign: 'center',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
  },
});
