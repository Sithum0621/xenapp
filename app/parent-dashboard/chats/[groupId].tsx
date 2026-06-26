import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { NativeFluidFlatList } from '@/src/components/layout/NativeFluidFlatList';
import { SafeAreaView } from 'react-native-safe-area-context';

import BrandHeader from '@/src/components/parent/BrandHeader';
import ChatComposer from '@/src/components/parent/chat/ChatComposer';
import ChatMessageBubble from '@/src/components/parent/chat/ChatMessageBubble';
import ChatReadOnlyFooter from '@/src/components/parent/chat/ChatReadOnlyFooter';
import ChatRoomSubHeader from '@/src/components/parent/chat/ChatRoomSubHeader';
import GroupChatRoomShell from '@/src/components/parent/chat/GroupChatRoomShell';
import { useGroupChatRoom } from '@/src/hooks/useGroupChatRoom';
import {
  canSendGroupChatMessages,
  fetchCurrentProfileRole,
  fetchGroupChatMessages,
  sendGroupChatMessage,
  type GroupChatMessage,
} from '@/src/services/groupChatApi';
import type { StudentGroupSource } from '@/src/services/studentClassesApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { FLAT_LIST_PERF_SCROLLABLE } from '@/src/utils/flatListPerf';
import type { FlatList } from 'react-native';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

const SURFACE_ALT = '#ECEFF4';
const TEXT_MUTED = '#64748B';

function paramOne(v: string | string[] | undefined): string {
  if (v == null) return '';
  return Array.isArray(v) ? (v[0] ?? '') : v;
}

export default function ParentGroupChatRoomScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    studentId?: string | string[];
    groupId?: string | string[];
    groupSource?: string | string[];
    groupName?: string | string[];
    instituteName?: string | string[];
  }>();

  const studentId = paramOne(params.studentId);
  const groupId = paramOne(params.groupId);
  const groupSource: StudentGroupSource =
    paramOne(params.groupSource) === 'personal' ? 'personal' : 'institute';
  const groupName = paramOne(params.groupName) || t('parentDashboard.chatsRoomFallbackTitle');
  const instituteName = paramOne(params.instituteName);

  const listRef = useRef<FlatList<GroupChatMessage>>(null);
  const [canSend, setCanSend] = useState(false);

  const fetchMessages = useCallback(async () => {
    if (!studentId || !groupId) {
      return { ok: false as const, error: t('parentDashboard.chatsErrorMissingParams') };
    }
    return fetchGroupChatMessages(studentId, groupId, groupSource);
  }, [studentId, groupId, groupSource, t]);

  const { loading, messages, error, reloadQuiet } = useGroupChatRoom({
    enabled: Boolean(studentId && groupId),
    fetchMessages,
  });

  useEffect(() => {
    void fetchCurrentProfileRole().then((role) => {
      setCanSend(canSendGroupChatMessages(role));
    });
  }, []);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    routerBackOrReplace(router, '/parent-dashboard');
  }, [router]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [goBack]);

  const handleSend = useCallback(
    async (body: string): Promise<boolean> => {
      const res = await sendGroupChatMessage(groupId, groupSource, body);
      if (!res.ok) return false;
      await reloadQuiet();
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
      return true;
    },
    [groupId, groupSource, reloadQuiet],
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
        <Text style={styles.emptyText}>{t('parentDashboard.chatsRoomEmpty')}</Text>
      </View>
    );
  }, [loading, t]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <BrandHeader />

      <ChatRoomSubHeader
        groupName={groupName}
        subtitle={instituteName || undefined}
        onBack={goBack}
        backLabel={t('appLock.back')}
      />

      <GroupChatRoomShell
        footer={
          canSend ? (
            <ChatComposer
              placeholder={t('parentDashboard.chatsInputPlaceholder')}
              sendLabel={t('parentDashboard.chatsSend')}
              onSend={handleSend}
            />
          ) : (
            <ChatReadOnlyFooter message={t('parentDashboard.chatsReadOnlyNotice')} />
          )
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: SURFACE_ALT },
  listContent: {
    paddingVertical: 12,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
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
