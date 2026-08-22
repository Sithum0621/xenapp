import { useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  type RefreshControlProps,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { NativeFluidFlatList } from '@/src/components/layout/NativeFluidFlatList';
import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';
import ChatListRow from '@/src/components/parent/chat/ChatListRow';
import CommunityChatListRow from '@/src/components/community/CommunityChatListRow';
import {
  getCommunityChatSummaryCached,
  type CommunityChatPreview,
} from '@/src/services/communityChatApi';
import {
  getParentGroupChatsCached,
  type GroupChatListItem,
} from '@/src/services/groupChatApi';
import {
  getSessionCacheEntry,
  parentGroupChatsCacheKey,
} from '@/src/services/sessionDataCache';
import { Text } from '@/src/theme/Text';
import { PAGE_CONTENT_TOP, PAGE_EDGE_INSET } from '@/src/theme/pageLayout';

import {
  parentBorder,
  parentBrandBlue,
  parentBrandBlueDark,
  parentInkSoft,
  parentSurface,
} from '@/src/theme/parentDashboardPalette';

const BRAND_BLUE = parentBrandBlue;
const BRAND_BLUE_DARK = parentBrandBlueDark;
const TEXT_MUTED = parentInkSoft;
const BORDER = parentBorder;
const SURFACE = parentSurface;

export type ParentDashboardChatsSectionProps = {
  isVisible: boolean;
  studentsLoading: boolean;
  selectedStudentId: string | null;
  contentPaddingBottom?: number;
  refreshControl?: React.ReactElement<RefreshControlProps>;
};

function ParentDashboardChatsSection({
  isVisible,
  studentsLoading,
  selectedStudentId,
  contentPaddingBottom = 0,
  refreshControl,
}: ParentDashboardChatsSectionProps) {
  const router = useRouter();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chats, setChats] = useState<GroupChatListItem[]>([]);
  const [communityPreview, setCommunityPreview] = useState<CommunityChatPreview | null>(null);

  const loadCommunity = useCallback(async (force = false) => {
    const summary = await getCommunityChatSummaryCached({ force });
    setCommunityPreview(summary);
  }, []);

  const load = useCallback(async (force = false) => {
    void loadCommunity(force);
    if (!selectedStudentId) {
      setChats([]);
      setError(null);
      setLoading(false);
      return;
    }
    const chatCached = getSessionCacheEntry<
      Awaited<ReturnType<typeof getParentGroupChatsCached>>
    >(parentGroupChatsCacheKey(selectedStudentId));
    if (!chatCached?.data || force) {
      setLoading(true);
    }
    setError(null);
    const res = await getParentGroupChatsCached(selectedStudentId, { force });
    if (res.ok) {
      setChats(res.chats);
    } else {
      setChats([]);
      setError(res.error);
    }
    setLoading(false);
  }, [selectedStudentId, loadCommunity]);

  const openCommunityChat = useCallback(() => {
    router.push('/community-chat');
  }, [router]);

  useEffect(() => {
    if (!isVisible) return;
    void load();
  }, [isVisible, load]);

  const openChat = useCallback(
    (chat: GroupChatListItem) => {
      if (!selectedStudentId) return;
      router.push({
        pathname: '/parent-dashboard/chats/[groupId]',
        params: {
          studentId: selectedStudentId,
          groupId: chat.groupId,
          groupSource: chat.groupSource,
          groupName: chat.groupName,
          instituteName: chat.instituteName,
        },
      });
    },
    [router, selectedStudentId],
  );

  const renderItem = useCallback(
    ({ item }: { item: GroupChatListItem }) => (
      <ChatListRow
        chat={item}
        onPress={() => openChat(item)}
        noMessagesLabel={t('parentDashboard.chatsNoMessagesYet')}
      />
    ),
    [openChat, t],
  );

  const keyExtractor = useCallback(
    (item: GroupChatListItem) => `${item.groupSource}:${item.groupId}`,
    [],
  );

  const ListHeader = useMemo(
    () => (
      <View style={styles.header}>
        {communityPreview ? (
          <CommunityChatListRow
            preview={communityPreview}
            onPress={openCommunityChat}
            noMessagesLabel={t('parentDashboard.chatsNoMessagesYet')}
          />
        ) : null}
      </View>
    ),
    [communityPreview, openCommunityChat, t],
  );

  const ListEmpty = useMemo(() => {
    if (studentsLoading || !selectedStudentId) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={BRAND_BLUE} />
          <Text style={styles.muted}>{t('parentDashboard.chatsLoading')}</Text>
        </View>
      );
    }
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={BRAND_BLUE} />
          <Text style={styles.muted}>{t('parentDashboard.chatsLoading')}</Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={22} color="#B42318" />
          <Text style={styles.errorText}>{error}</Text>
          <ScrollFriendlyPressable onPress={() => void load()} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t('parentDashboard.classesRetry')}</Text>
          </ScrollFriendlyPressable>
        </View>
      );
    }
    return (
      <View style={styles.emptyCard}>
        <Ionicons name="chatbubbles-outline" size={28} color={BRAND_BLUE} />
        <Text style={styles.emptyTitle}>{t('parentDashboard.chatsEmptyTitle')}</Text>
        <Text style={styles.emptyBody}>{t('parentDashboard.chatsEmptyBody')}</Text>
      </View>
    );
  }, [studentsLoading, selectedStudentId, loading, error, t, load]);

  if (!isVisible) return null;

  return (
    <NativeFluidFlatList
      style={styles.flex1}
      data={!loading && !error && !studentsLoading && selectedStudentId ? chats : []}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={ListHeader}
      ListEmptyComponent={ListEmpty}
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: contentPaddingBottom },
        chats.length === 0 ? styles.listContentEmpty : null,
      ]}
      refreshControl={refreshControl}
    />
  );
}

export default memo(ParentDashboardChatsSection);

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  listContent: {
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: PAGE_CONTENT_TOP,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  header: { gap: 12, marginBottom: 8 },
  centered: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  muted: { fontSize: 14, color: TEXT_MUTED },
  errorCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  errorText: { fontSize: 14, color: TEXT_MUTED, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: parentBrandBlue,
  },
  retryText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  emptyCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13.5,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 20,
  },
});
