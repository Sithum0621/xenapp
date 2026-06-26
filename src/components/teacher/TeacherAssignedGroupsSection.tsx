import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { NativeFluidFlatList } from '@/src/components/layout/NativeFluidFlatList';
import { AppScrollView } from '@/src/components/layout/AppScrollView';
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
import type { ClassDeliveryMode, TeacherUnifiedGroupRow } from '@/src/services/teacherGroupsApi';
import { teacherCreatePersonalGroup, teacherListMyUnifiedGroups } from '@/src/services/teacherGroupsApi';
import type { WeekdayKey } from '@/src/utils/teacherGroupRouteParams';
import {
  nextDateForWeekday,
  SCHEDULE_DATE_RE,
  validateScheduleTimes,
} from '@/src/utils/weeklyClassSchedule';
import {
  appBorder,
  appBrandBlue,
  appBrandBlueDark,
  appInfoBanner,
  appPageSurface,
  appSurface,
  appTextMuted,
} from '@/src/theme/appBrandPalette';
import { teacherDashboardCard, teacherDashboardScreen } from '@/src/theme/teacherDashboardStyles';

const BRAND_BLUE = appBrandBlue;
const BRAND_BLUE_DARK = appBrandBlueDark;
const BORDER = appBorder;
const TEXT_MUTED = appTextMuted;
const PAGE_SURFACE = appPageSurface;
const MAX_SUGGESTIONS = 5;
const WEEKDAY_KEYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

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

  const [modalVisible, setModalVisible] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDeliveryMode, setFormDeliveryMode] = useState<ClassDeliveryMode>('physical');
  const [formFee, setFormFee] = useState('');
  const [formWeekday, setFormWeekday] = useState<WeekdayKey>('sat');
  const [formClassDate, setFormClassDate] = useState(() => nextDateForWeekday('sat'));
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('10:00');
  const [formBusy, setFormBusy] = useState(false);

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

  const openCreateModal = () => {
    const defaultDay: WeekdayKey = 'sat';
    setFormName('');
    setFormDeliveryMode('physical');
    setFormFee('');
    setFormWeekday(defaultDay);
    setFormClassDate(nextDateForWeekday(defaultDay));
    setFormStartTime('09:00');
    setFormEndTime('10:00');
    setModalVisible(true);
  };

  const onSelectWeekday = (day: WeekdayKey) => {
    setFormWeekday(day);
    setFormClassDate(nextDateForWeekday(day));
  };

  const closeModal = () => {
    if (formBusy) return;
    setModalVisible(false);
  };

  const submitModal = async () => {
    setFormBusy(true);
    const name = formName.trim();
    const fee = formFee.trim();
    if (!name) {
      setFormBusy(false);
      appAlert(t('teacherDashboard.groupsModalValidationTitle'), t('teacherDashboard.groupsNameRequired'));
      return;
    }
    if (!fee) {
      setFormBusy(false);
      appAlert(t('teacherDashboard.groupsModalValidationTitle'), t('teacherDashboard.groupsFeeRequired'));
      return;
    }

    const classDate = formClassDate.trim();
    if (!SCHEDULE_DATE_RE.test(classDate)) {
      setFormBusy(false);
      appAlert(
        t('teacherDashboard.groupsModalValidationTitle'),
        t('teacherDashboard.groupDetail.scheduleDateInvalid'),
      );
      return;
    }

    const timeErr = validateScheduleTimes(formStartTime, formEndTime);
    if (timeErr === 'invalid_time') {
      setFormBusy(false);
      appAlert(
        t('teacherDashboard.groupsModalValidationTitle'),
        t('adminPortal.scheduleInvalidTime'),
      );
      return;
    }
    if (timeErr === 'end_before_start') {
      setFormBusy(false);
      appAlert(
        t('teacherDashboard.groupsModalValidationTitle'),
        t('adminPortal.scheduleEndBeforeStart'),
      );
      return;
    }

    const { error } = await teacherCreatePersonalGroup({
      name,
      deliveryMode: formDeliveryMode,
      monthlyFeeInput: fee,
      weeklySchedule: {
        weekday: formWeekday,
        classDate,
        startTime: formStartTime.trim(),
        endTime: formEndTime.trim(),
      },
    });
    setFormBusy(false);
    if (error) {
      const message =
        error === 'invalid_fee'
          ? t('teacherDashboard.groupsFeeInvalid')
          : error === 'schedule_day_mismatch'
            ? t('teacherDashboard.groupsScheduleDayMismatch', {
                day: t(`teacherDashboard.groupDetail.weekdayShort.${formWeekday}`),
              })
            : error === 'schedule_invalid_date'
              ? t('teacherDashboard.groupDetail.scheduleDateInvalid')
              : error;
      appAlert(t('teacherDashboard.groupsSaveErrorTitle'), message);
      return;
    }

    closeModal();
  };

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
            <ScrollFriendlyPressable
              accessibilityRole="button"
              onPress={openCreateModal}
              style={styles.createChip}
              innerStyle={styles.createChipInner}>
              <Ionicons name="add" size={18} color={appSurface} />
              <Text style={styles.createChipText}>{t('teacherDashboard.chatsCreateClass')}</Text>
            </ScrollFriendlyPressable>
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
      openCreateModal,
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
        {!isSearchEmpty ? (
          <ScrollFriendlyPressable
            accessibilityRole="button"
            onPress={openCreateModal}
            style={styles.emptyCreateBtn}
            innerStyle={styles.emptyCreateBtnInner}>
            <Ionicons name="add" size={18} color={appSurface} />
            <Text style={styles.emptyCreateBtnText}>{t('teacherDashboard.chatsCreateClass')}</Text>
          </ScrollFriendlyPressable>
        ) : null}
      </View>
    );
  }, [chatItems.length, openCreateModal, t]);

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
    <>
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

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalBackdrop} onPress={() => !formBusy && closeModal()} />
          <AppScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.modalScroll}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{t('teacherDashboard.groupsModalCreateClassTitle')}</Text>

              <Text style={styles.modalLabel}>{t('teacherDashboard.groupsClassNameLabel')}</Text>
              <TextInput
                value={formName}
                onChangeText={setFormName}
                placeholder={t('teacherDashboard.groupsClassNamePlaceholder')}
                placeholderTextColor="#94A3B8"
                editable={!formBusy}
                style={styles.modalInput}
              />

              <Text style={[styles.modalLabel, styles.modalLabelSp]}>
                {t('teacherDashboard.groupsDeliveryModeLabel')}
              </Text>
              <View style={styles.deliveryRow}>
                <Pressable
                  disabled={formBusy}
                  accessibilityRole="button"
                  accessibilityState={{ selected: formDeliveryMode === 'physical' }}
                  onPress={() => setFormDeliveryMode('physical')}
                  style={({ pressed }) => [
                    styles.deliveryOption,
                    formDeliveryMode === 'physical' && styles.deliveryOptionSelected,
                    pressed && !formBusy && styles.deliveryOptionPressed,
                  ]}>
                  <Ionicons
                    name="location-outline"
                    size={18}
                    color={formDeliveryMode === 'physical' ? '#FFFFFF' : BRAND_BLUE_DARK}
                  />
                  <Text
                    style={[
                      styles.deliveryOptionText,
                      formDeliveryMode === 'physical' && styles.deliveryOptionTextSelected,
                    ]}>
                    {t('teacherDashboard.groupsDeliveryPhysical')}
                  </Text>
                </Pressable>
                <Pressable
                  disabled={formBusy}
                  accessibilityRole="button"
                  accessibilityState={{ selected: formDeliveryMode === 'online' }}
                  onPress={() => setFormDeliveryMode('online')}
                  style={({ pressed }) => [
                    styles.deliveryOption,
                    formDeliveryMode === 'online' && styles.deliveryOptionSelected,
                    pressed && !formBusy && styles.deliveryOptionPressed,
                  ]}>
                  <Ionicons
                    name="videocam-outline"
                    size={18}
                    color={formDeliveryMode === 'online' ? '#FFFFFF' : BRAND_BLUE_DARK}
                  />
                  <Text
                    style={[
                      styles.deliveryOptionText,
                      formDeliveryMode === 'online' && styles.deliveryOptionTextSelected,
                    ]}>
                    {t('teacherDashboard.groupsDeliveryOnline')}
                  </Text>
                </Pressable>
              </View>

              <Text style={[styles.modalLabel, styles.modalLabelSp]}>
                {t('teacherDashboard.groupsClassFeeLabel')}
              </Text>
              <TextInput
                value={formFee}
                onChangeText={setFormFee}
                placeholder={t('teacherDashboard.groupsClassFeePlaceholder')}
                placeholderTextColor="#94A3B8"
                editable={!formBusy}
                keyboardType="decimal-pad"
                style={styles.modalInput}
              />
              <Text style={styles.modalHint}>{t('teacherDashboard.groupsClassFeeHint')}</Text>

              <View style={styles.modalDivider} />
              <Text style={styles.modalSectionTitle}>{t('teacherDashboard.groupsScheduleSectionTitle')}</Text>
              <Text style={styles.modalHint}>{t('teacherDashboard.groupsScheduleSectionHint')}</Text>

              <Text style={[styles.modalLabel, styles.modalLabelSp]}>
                {t('teacherDashboard.groupDetail.dayOfWeek')}
              </Text>
              <View style={styles.dayChips}>
                {WEEKDAY_KEYS.map((d) => {
                  const selected = formWeekday === d;
                  return (
                    <Pressable
                      key={d}
                      disabled={formBusy}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => onSelectWeekday(d)}
                      style={({ pressed }) => [
                        styles.dayChip,
                        selected && styles.dayChipSelected,
                        pressed && !formBusy && styles.dayChipPressed,
                      ]}>
                      <Text style={[styles.dayChipText, selected && styles.dayChipTextSelected]}>
                        {t(`teacherDashboard.groupDetail.weekdayShort.${d}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.modalLabel, styles.modalLabelSp]}>
                {t('teacherDashboard.groupsScheduleDateLabel')}
              </Text>
              <TextInput
                value={formClassDate}
                onChangeText={setFormClassDate}
                placeholder={t('teacherDashboard.groupDetail.datePlaceholder')}
                placeholderTextColor="#94A3B8"
                editable={!formBusy}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.modalInput}
              />
              <Text style={styles.modalHint}>{t('teacherDashboard.groupsScheduleDateHint')}</Text>

              <View style={styles.timeRow}>
                <View style={styles.timeField}>
                  <Text style={styles.modalLabel}>{t('teacherDashboard.groupDetail.timeStart')}</Text>
                  <TextInput
                    value={formStartTime}
                    onChangeText={setFormStartTime}
                    placeholder="09:00"
                    placeholderTextColor="#94A3B8"
                    editable={!formBusy}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.modalInput}
                  />
                </View>
                <View style={styles.timeField}>
                  <Text style={styles.modalLabel}>{t('teacherDashboard.groupDetail.timeEnd')}</Text>
                  <TextInput
                    value={formEndTime}
                    onChangeText={setFormEndTime}
                    placeholder="10:00"
                    placeholderTextColor="#94A3B8"
                    editable={!formBusy}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.modalInput}
                  />
                </View>
              </View>
              <Text style={styles.modalHint}>{t('adminPortal.scheduleTimeFormatHint')}</Text>

              <View style={styles.modalActions}>
              <Pressable
                disabled={formBusy}
                onPress={closeModal}
                style={({ pressed }) => [styles.modalSecondary, pressed && styles.modalSecondaryPressed]}>
                <Text style={styles.modalSecondaryText}>{t('teacherDashboard.groupsCancel')}</Text>
              </Pressable>
              <Pressable
                disabled={formBusy}
                onPress={() => void submitModal()}
                style={({ pressed }) => [styles.modalPrimary, pressed && !formBusy && styles.modalPrimaryPressed]}>
                {formBusy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalPrimaryText}>{t('teacherDashboard.groupsSave')}</Text>
                )}
              </Pressable>
              </View>
            </View>
          </AppScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  listContent: {
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
  createChip: { borderRadius: 999 },
  createChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BRAND_BLUE,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  createChipText: { color: appSurface, fontWeight: '800', fontSize: 13 },
  emptyCreateBtn: { marginTop: 6, borderRadius: 999 },
  emptyCreateBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND_BLUE,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
  },
  emptyCreateBtnText: { color: appSurface, fontWeight: '800', fontSize: 14 },
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
    backgroundColor: '#EFF6FF',
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
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalScroll: {
    maxHeight: '90%',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    borderTopWidth: 1.5,
    borderColor: BORDER,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: BRAND_BLUE_DARK, marginBottom: 14 },
  modalSectionTitle: { fontSize: 15, fontWeight: '800', color: BRAND_BLUE_DARK, marginBottom: 4 },
  modalDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginVertical: 16,
  },
  modalLabel: { fontSize: 13, fontWeight: '700', color: BRAND_BLUE_DARK, marginBottom: 6 },
  modalLabelSp: { marginTop: 10 },
  dayChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: PAGE_SURFACE,
  },
  dayChipSelected: { borderColor: BRAND_BLUE, backgroundColor: '#EFF6FF' },
  dayChipPressed: { opacity: 0.88 },
  dayChipText: { fontSize: 12, fontWeight: '700', color: TEXT_MUTED },
  dayChipTextSelected: { color: BRAND_BLUE_DARK },
  timeRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  timeField: { flex: 1, minWidth: 0 },
  modalHint: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 4,
    lineHeight: 17,
  },
  deliveryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  deliveryOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: PAGE_SURFACE,
  },
  deliveryOptionSelected: {
    borderColor: BRAND_BLUE,
    backgroundColor: BRAND_BLUE,
  },
  deliveryOptionPressed: { opacity: 0.9 },
  deliveryOptionText: {
    fontSize: 13,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
  },
  deliveryOptionTextSelected: {
    color: '#FFFFFF',
  },
  modalInput: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: BRAND_BLUE_DARK,
    backgroundColor: PAGE_SURFACE,
  },
  modalInputMulti: { minHeight: 80, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalSecondary: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: PAGE_SURFACE,
  },
  modalSecondaryPressed: { opacity: 0.85 },
  modalSecondaryText: { fontWeight: '800', fontSize: 15, color: BRAND_BLUE_DARK },
  modalPrimary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
    minHeight: 48,
  },
  modalPrimaryPressed: { opacity: 0.9 },
  modalPrimaryText: { fontWeight: '800', fontSize: 15, color: '#FFFFFF' },
});
