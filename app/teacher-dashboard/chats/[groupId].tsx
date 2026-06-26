import { useLocalSearchParams, useRouter } from 'expo-router';
import { appAlert } from '@/src/utils/appAlert';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, BackHandler, Platform, StyleSheet, View, type FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NativeFluidFlatList } from '@/src/components/layout/NativeFluidFlatList';
import ChatComposer from '@/src/components/parent/chat/ChatComposer';
import ChatMessageBubble from '@/src/components/parent/chat/ChatMessageBubble';
import ChatRoomSubHeader from '@/src/components/parent/chat/ChatRoomSubHeader';
import GroupChatRoomShell from '@/src/components/parent/chat/GroupChatRoomShell';
import TeacherGroupChatSettingsSheet from '@/src/components/teacher/chat/TeacherGroupChatSettingsSheet';
import { useGroupChatRoom } from '@/src/hooks/useGroupChatRoom';
import {
  fetchTeacherGroupChatMessages,
  sendGroupChatMessage,
  type GroupChatMessage,
} from '@/src/services/groupChatApi';
import {
  fetchTeacherGroupChatSettings,
  signedGroupChatAvatarUrl,
} from '@/src/services/groupChatSettingsApi';
import type { StudentGroupSource } from '@/src/services/studentClassesApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { FLAT_LIST_PERF_SCROLLABLE } from '@/src/utils/flatListPerf';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

const SURFACE_ALT = '#ECEFF4';
const TEXT_MUTED = '#64748B';

function paramOne(v: string | string[] | undefined): string {
  if (v == null) return '';
  return Array.isArray(v) ? (v[0] ?? '') : v;
}

export default function TeacherGroupChatRoomScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    groupId?: string | string[];
    groupSource?: string | string[];
    groupName?: string | string[];
    instituteName?: string | string[];
  }>();

  const groupId = paramOne(params.groupId);
  const groupSource: StudentGroupSource =
    paramOne(params.groupSource) === 'personal' ? 'personal' : 'institute';
  const groupName = paramOne(params.groupName) || t('teacherDashboard.groupChat.roomFallbackTitle');
  const instituteName = paramOne(params.instituteName);

  const listRef = useRef<FlatList<GroupChatMessage>>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const loadAvatar = useCallback(async () => {
    if (!groupId) return;
    const res = await fetchTeacherGroupChatSettings(groupId, groupSource);
    if (!res.ok) return;
    const url = await signedGroupChatAvatarUrl(res.settings.chatAvatarPath);
    setAvatarUrl(url);
  }, [groupId, groupSource]);

  useEffect(() => {
    void loadAvatar();
  }, [loadAvatar]);

  const settingsLabels = useMemo(
    () => ({
      title: t('teacherDashboard.groupChat.settingsTitle'),
      displayName: t('teacherDashboard.groupChat.settingsDisplayName'),
      displayNamePlaceholder: t('teacherDashboard.groupChat.settingsDisplayNamePlaceholder'),
      groupPhoto: t('teacherDashboard.groupChat.settingsGroupPhoto'),
      changePhoto: t('teacherDashboard.groupChat.settingsChangePhoto'),
      save: t('teacherDashboard.groupChat.settingsSave'),
      cancel: t('teacherDashboard.groupChat.settingsCancel'),
      savedTitle: t('teacherDashboard.groupChat.settingsSavedTitle'),
      savedBody: t('teacherDashboard.groupChat.settingsSavedBody'),
      errorTitle: t('teacherDashboard.groupChat.settingsErrorTitle'),
      photosPermission: t('teacherDashboard.groupChat.settingsPhotosPermission'),
    }),
    [t],
  );

  const handleAttach = useCallback(() => {
    appAlert(
      t('teacherDashboard.groupChat.attachTitle'),
      t('teacherDashboard.groupChat.attachComingSoon'),
    );
  }, [t]);

  const fetchMessages = useCallback(async () => {
    if (!groupId) {
      return { ok: false as const, error: t('teacherDashboard.groupChat.errorMissingParams') };
    }
    return fetchTeacherGroupChatMessages(groupId, groupSource);
  }, [groupId, groupSource, t]);

  const { loading, messages, error, reloadQuiet } = useGroupChatRoom({
    enabled: Boolean(groupId),
    fetchMessages,
  });

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    routerBackOrReplace(router, '/teacher-dashboard');
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
        <Text style={styles.emptyText}>{t('teacherDashboard.groupChat.roomEmpty')}</Text>
      </View>
    );
  }, [loading, t]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ChatRoomSubHeader
        groupName={groupName}
        subtitle={instituteName || undefined}
        imageUrl={avatarUrl}
        onBack={goBack}
        backLabel={t('appLock.back')}
        onSettings={() => setSettingsOpen(true)}
        settingsLabel={t('teacherDashboard.groupChat.settingsTitle')}
      />

      <TeacherGroupChatSettingsSheet
        visible={settingsOpen}
        groupId={groupId}
        groupSource={groupSource}
        groupName={groupName}
        labels={settingsLabels}
        onClose={() => setSettingsOpen(false)}
        onSaved={({ avatarUrl: nextAvatarUrl }) => {
          setAvatarUrl(nextAvatarUrl);
          void reloadQuiet();
        }}
      />

      <GroupChatRoomShell
        footer={
          <ChatComposer
            placeholder={t('teacherDashboard.groupChat.inputPlaceholder')}
            sendLabel={t('teacherDashboard.groupChat.send')}
            attachLabel={t('teacherDashboard.groupChat.attach')}
            onAttach={handleAttach}
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
