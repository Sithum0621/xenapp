import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { PAGE_EDGE_INSET } from '@/src/theme/pageLayout';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { NativeFluidFlatList } from '@/src/components/layout/NativeFluidFlatList';
import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';
import TeacherGroupChatListRow from '@/src/components/teacher/TeacherGroupChatListRow';
import CommunityChatListRow from '@/src/components/community/CommunityChatListRow';
import { SessionCacheKeys } from '@/src/services/sessionDataCache';
import { useSessionCachedQuery } from '@/src/hooks/useSessionCachedQuery';
import {
  fetchTeacherGroupChats,
  type GroupChatListItem,
} from '@/src/services/groupChatApi';
import {
  fetchCommunityChatSummary,
  type CommunityChatPreview,
} from '@/src/services/communityChatApi';
import type { TeacherUnifiedGroupRow } from '@/src/services/teacherGroupsApi';
import { teacherListMyUnifiedGroups } from '@/src/services/teacherGroupsApi';
import {
  appBorder,
  appBrandBlue,
  appBrandBlueDark,
  appInfoBanner,
  appSurface,
  appTextMuted,
} from '@/src/theme/appBrandPalette';
import { teacherDashboardCard, teacherDashboardScreen } from '@/src/theme/teacherDashboardStyles';

const BRAND_BLUE = appBrandBlue;
const BRAND_BLUE_DARK = appBrandBlueDark;
const BORDER = appBorder;
const TEXT_MUTED = appTextMuted;
const MAX_SUGGESTIONS = 5;

function rowMatchesQuery(group: TeacherUnifiedGroupRow, q: string): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return false;
  const name = group.name.toLowerCase();
  const desc = (group.description ?? '').toLowerCase();
  const inst = (group.institute_name ?? '').toLowerCase();
  return name.includes(n) || desc.includes(n) || inst.includes(n);
}

function chatMatchesQuery(chat: GroupChatListItem, q: string): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return (
    chat.groupName.toLowerCase().includes(n) ||
    chat.instituteName.toLowerCase().includes(n)
  );
}

function groupsToChatItems(groups: TeacherUnifiedGroupRow[]): GroupChatListItem[] {
  return groups.map((g) => ({
    groupId: g.id,
    groupSource: g.source,
    groupName: g.name,
    instituteName: g.institute_name ?? '',
    lastMessageBody: null,
    lastMessageAt: null,
    lastSenderName: null,
  }));
}

export type TeacherAssignedGroupsSectionProps = {
  topHeader?: ReactNode;
  contentPaddingBottom?: number;
};

export default function TeacherAssignedGroupsSection({
  topHeader,
  contentPaddingBottom = 0,
}: TeacherAssignedGroupsSectionProps = {}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [communityPreview, setCommunityPreview] = useState<CommunityChatPreview | null>(null);

  const loadCommunity = useCallback(async () => {
    setCommunityPreview(await fetchCommunityChatSummary());
  }, []);

  useEffect(() => {
    void loadCommunity();
  }, [loadCommunity]);

  const {
    data: groupsResult,
    loading: groupsLoading,
    error: groupsQueryError,
    refresh: refreshGroups,
  } = useSessionCachedQuery(
    SessionCacheKeys.TEACHER_UNIFIED_GROUPS,
    () => teacherListMyUnifiedGroups(),
    { shouldCache: (res) => !res.error },
  );

  const {
    data: chatsResult,
    loading: chatsLoading,
    refresh: refreshChats,
  } = useSessionCachedQuery(
    SessionCacheKeys.TEACHER_GROUP_CHATS,
    () => fetchTeacherGroupChats(),
    { shouldCache: (res) => res.ok },
  );

  const groups = groupsResult?.rows ?? [];
  const loadError = groupsResult?.error ?? groupsQueryError;
  const partialWarning = groupsResult?.partialWarning ?? null;
  const loading = (groupsLoading || chatsLoading) && groups.length === 0 && !loadError;

  const chatItems = useMemo(() => {
    if (chatsResult?.ok) return chatsResult.chats;
    if (groups.length > 0) return groupsToChatItems(groups);
    return [];
  }, [chatsResult, groups]);

  const refresh = useCallback(() => {
    refreshGroups(true);
    refreshChats(true);
    void loadCommunity();
  }, [refreshGroups, refreshChats, loadCommunity]);

  const [searchQuery, setSearchQuery] = useState('');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const blurCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBlurTimer = () => {
    if (blurCloseTimerRef.current != null) {
      clearTimeout(blurCloseTimerRef.current);
      blurCloseTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (blurCloseTimerRef.current != null) {
        clearTimeout(blurCloseTimerRef.current);
        blurCloseTimerRef.current = null;
      }
    };
  }, []);

  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return groups.filter((g) => rowMatchesQuery(g, searchQuery)).slice(0, MAX_SUGGESTIONS);
  }, [groups, searchQuery]);

  const displayedChats = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return chatItems;
    return chatItems.filter((c) => chatMatchesQuery(c, q));
  }, [chatItems, searchQuery]);

  const openCommunityChat = useCallback(() => {
    router.push('/community-chat');
  }, [router]);

  const openGroupChat = useCallback(
    (chat: GroupChatListItem) => {
      router.push({
        pathname: '/teacher-dashboard/chats/[groupId]',
        params: {
          groupId: chat.groupId,
          groupSource: chat.groupSource,
          groupName: chat.groupName,
          instituteName: chat.instituteName,
        },
      } as never);
    },
    [router],
  );

  const onPickSuggestion = useCallback(
    (g: TeacherUnifiedGroupRow) => {
      clearBlurTimer();
      setSearchQuery('');
      setSuggestionsOpen(false);
      openGroupChat({
        groupId: g.id,
        groupSource: g.source,
        groupName: g.name,
        instituteName: g.institute_name ?? '',
        lastMessageBody: null,
        lastMessageAt: null,
        lastSenderName: null,
      });
    },
    [openGroupChat],
  );

  const keyExtractor = useCallback(
    (item: GroupChatListItem) => `${item.groupSource}:${item.groupId}`,
    [],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: GroupChatListItem; index: number }) => {
      const isLast = index === displayedChats.length - 1;
      return (
        <View style={[styles.chatListItemShell, isLast && styles.chatListItemShellLast]}>
          <TeacherGroupChatListRow
            chat={item}
            isLast={isLast}
            onPress={() => openGroupChat(item)}
            noMessagesLabel={t('parentDashboard.chatsNoMessagesYet')}
          />
        </View>
      );
    },
    [displayedChats.length, openGroupChat, t],
  );

  const ListHeader = useMemo(
    () => (
      <View style={styles.listHeader}>
        {topHeader ? <View style={teacherDashboardScreen.pageHeader}>{topHeader}</View> : null}

        <View style={styles.toolbarCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>{t('teacherDashboard.chatsHeading')}</Text>
            </View>
          </View>

          {partialWarning ? (
            <Text style={styles.partialWarn}>
              {t('teacherDashboard.groupsPartialWarning', { detail: partialWarning })}
            </Text>
          ) : null}

          <View style={styles.searchOuter}>
            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={18} color={TEXT_MUTED} style={styles.searchIcon} />
              <TextInput
                value={searchQuery}
                onChangeText={(tx) => {
                  setSearchQuery(tx);
                  setSuggestionsOpen(tx.trim().length > 0);
                }}
                onFocus={() => setSuggestionsOpen(searchQuery.trim().length > 0)}
                onBlur={() => {
                  clearBlurTimer();
                  blurCloseTimerRef.current = setTimeout(() => setSuggestionsOpen(false), 200);
                }}
                placeholder={t('teacherDashboard.groupsSearchPlaceholder')}
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.searchInput}
                accessibilityLabel={t('teacherDashboard.groupsSearchA11y')}
              />
              {searchQuery.length > 0 ? (
                <ScrollFriendlyPressable
                  accessibilityRole="button"
                  accessibilityLabel={t('teacherDashboard.groupsClearSearch')}
                  onPress={() => {
                    setSearchQuery('');
                    setSuggestionsOpen(false);
                  }}
                  hitSlop={8}
                  style={styles.clearBtn}>
                  <Ionicons name="close-circle" size={20} color={TEXT_MUTED} />
                </ScrollFriendlyPressable>
              ) : null}
            </View>

            {suggestionsOpen && suggestions.length > 0 ? (
              <View style={styles.suggestionsDropdown} accessibilityRole="menu">
                {suggestions.map((g, idx) => (
                  <ScrollFriendlyPressable
                    key={`${g.source}:${g.id}`}
                    accessibilityRole="menuitem"
                    onPress={() => {
                      clearBlurTimer();
                      onPickSuggestion(g);
                    }}
                    style={[
                      styles.suggestionRow,
                      idx === suggestions.length - 1 && styles.suggestionRowLast,
                    ]}
                    innerStyle={styles.suggestionRowInner}>
                    <Ionicons name="people-outline" size={18} color={BRAND_BLUE_DARK} />
                    <View style={styles.suggestionTextCol}>
                      <Text style={styles.suggestionName} numberOfLines={1}>
                        {g.name}
                      </Text>
                      {g.source === 'institute' && g.institute_name ? (
                        <Text style={styles.suggestionDesc} numberOfLines={1}>
                          {g.institute_name}
                        </Text>
                      ) : g.description ? (
                        <Text style={styles.suggestionDesc} numberOfLines={1}>
                          {g.description}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.suggestionBadgePill}>
                      <Text style={styles.suggestionBadgePillText}>
                        {g.source === 'institute'
                          ? t('teacherDashboard.groupsInstituteBadge')
                          : t('teacherDashboard.groupsGroupClassBadge')}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
                  </ScrollFriendlyPressable>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        {communityPreview ? (
          <View style={styles.communityCard}>
            <CommunityChatListRow
              preview={communityPreview}
              onPress={openCommunityChat}
              noMessagesLabel={t('parentDashboard.chatsNoMessagesYet')}
            />
          </View>
        ) : null}

        {displayedChats.length > 0 ? (
          <View style={[styles.chatListCard, styles.chatListCardWithItems]}>
            <Text style={styles.listHeading}>{t('teacherDashboard.groupsChatsListHeading')}</Text>
          </View>
        ) : null}
      </View>
    ),
    [
      topHeader,
      t,
      partialWarning,
      searchQuery,
      suggestionsOpen,
      suggestions,
      onPickSuggestion,
      displayedChats.length,
      communityPreview,
      openCommunityChat,
    ],
  );

  const ListEmpty = useMemo(() => {
    const isSearchEmpty = chatItems.length > 0;
    return (
      <View style={teacherDashboardScreen.emptyCard}>
        <View style={teacherDashboardScreen.emptyIconWrap}>
          <Ionicons
            name={isSearchEmpty ? 'search-outline' : 'chatbubbles-outline'}
            size={26}
            color={BRAND_BLUE}
          />
        </View>
        <Text style={teacherDashboardScreen.emptyTitle}>
          {isSearchEmpty
            ? t('teacherDashboard.chatsEmptySearchTitle')
            : t('teacherDashboard.chatsEmptyTitle')}
        </Text>
        <Text style={teacherDashboardScreen.emptyBody}>
          {isSearchEmpty ? t('teacherDashboard.groupsEmptySearch') : t('teacherDashboard.chatsEmptyBody')}
        </Text>
      </View>
    );
  }, [chatItems.length, t]);

  if (loading) {
    return (
      <View style={[styles.stateWrap, teacherDashboardScreen.contentPad]}>
        {topHeader ? <View style={teacherDashboardScreen.pageHeader}>{topHeader}</View> : null}
        <View style={styles.loaderCard}>
          <ActivityIndicator color={BRAND_BLUE} />
          <Text style={styles.loaderHint}>{t('teacherDashboard.groupsLoading')}</Text>
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.stateWrap, teacherDashboardScreen.contentPad]}>
        {topHeader ? <View style={teacherDashboardScreen.pageHeader}>{topHeader}</View> : null}
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={24} color="#B42318" />
          <Text style={styles.errorText}>{t('teacherDashboard.groupsLoadError')}</Text>
          <Text style={styles.errorDetail}>{loadError}</Text>
          <ScrollFriendlyPressable
            accessibilityRole="button"
            onPress={() => void refresh()}
            style={styles.retryBtn}
            innerStyle={styles.retryBtnInner}>
            <Text style={styles.retryBtnText}>{t('teacherDashboard.groupsRetry')}</Text>
          </ScrollFriendlyPressable>
        </View>
      </View>
    );
  }

  return (
    <NativeFluidFlatList
      style={styles.flex1}
      data={displayedChats}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={ListHeader}
      ListEmptyComponent={ListEmpty}
      contentContainerStyle={[
        styles.listContent,
        teacherDashboardScreen.contentPad,
        { paddingBottom: contentPaddingBottom },
        displayedChats.length === 0 ? styles.listContentEmpty : null,
      ]}
      keyboardShouldPersistTaps="always"
    />
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  listContent: {
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: 0,
  },
  listContentEmpty: { flexGrow: 1 },
  listHeader: {
    gap: 0,
  },
  stateWrap: {
    flex: 1,
  },
  toolbarCard: {
    ...teacherDashboardCard,
    padding: 16,
    gap: 12,
  },
  communityCard: {
    marginTop: 16,
    ...teacherDashboardCard,
    overflow: 'hidden',
  },
  chatListCard: {
    marginTop: 16,
    ...teacherDashboardCard,
  },
  chatListCardWithItems: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  chatListItemShell: {
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: appSurface,
  },
  chatListItemShellLast: {
    borderBottomWidth: 1.5,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    overflow: 'hidden',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionHeaderText: { flex: 1, minWidth: 0 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
  },
  partialWarn: {
    fontSize: 13,
    color: appInfoBanner.text,
    backgroundColor: appInfoBanner.background,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: appInfoBanner.border,
    padding: 10,
    fontWeight: '600',
    lineHeight: 18,
  },
  loaderCard: {
    ...teacherDashboardCard,
    alignItems: 'center',
    paddingVertical: 36,
    gap: 10,
  },
  loaderHint: { fontSize: 14, color: TEXT_MUTED, fontWeight: '600' },
  errorBox: {
    ...teacherDashboardCard,
    alignItems: 'center',
    padding: 22,
    gap: 8,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  errorText: { fontSize: 15, fontWeight: '800', color: '#991B1B', textAlign: 'center' },
  errorDetail: { fontSize: 12, color: '#7F1D1D', textAlign: 'center' },
  retryBtn: { marginTop: 8, borderRadius: 12 },
  retryBtnInner: {
    backgroundColor: BRAND_BLUE,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  retryBtnText: { color: appSurface, fontWeight: '800', fontSize: 14 },
  searchOuter: {
    position: 'relative',
    zIndex: 200,
    ...(Platform.OS === 'android' ? { elevation: 16 } : {}),
  },
  searchWrap: {
    ...teacherDashboardScreen.searchField,
  },
  searchIcon: { position: 'absolute', left: 12, zIndex: 1 },
  clearBtn: { position: 'absolute', right: 10, zIndex: 1, padding: 4 },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: BRAND_BLUE_DARK,
    minHeight: 44,
    paddingVertical: 8,
  },
  suggestionsDropdown: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '100%',
    marginTop: 6,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: {
        elevation: 14,
      },
      default: {},
    }),
  },
  suggestionRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEF2F7',
    backgroundColor: '#FFFFFF',
  },
  suggestionRowLast: {
    borderBottomWidth: 0,
  },
  suggestionRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
  },
  suggestionTextCol: { flex: 1, minWidth: 0 },
  suggestionName: { fontSize: 15, fontWeight: '700', color: BRAND_BLUE_DARK },
  suggestionDesc: { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },
  suggestionBadgePill: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: 120,
  },
  suggestionBadgePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: BRAND_BLUE,
    textTransform: 'uppercase',
  },
  listHeading: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    fontSize: 13,
    fontWeight: '700',
    color: TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.35,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
});
