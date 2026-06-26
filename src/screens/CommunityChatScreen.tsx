import { useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CommunityChatRoom from '@/src/components/community/CommunityChatRoom';
import BrandHeader from '@/src/components/parent/BrandHeader';
import ChatRoomSubHeader from '@/src/components/parent/chat/ChatRoomSubHeader';
import { XEN_COMMUNITY_TITLE } from '@/src/services/communityChatApi';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

const SURFACE_ALT = '#ECEFF4';

export default function CommunityChatScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    routerBackOrReplace(router, '/');
  }, [router]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [goBack]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <BrandHeader />
      <ChatRoomSubHeader
        groupName={XEN_COMMUNITY_TITLE}
        subtitle={t('communityChat.subtitle')}
        onBack={goBack}
        backLabel={t('appLock.back')}
      />
      <CommunityChatRoom />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: SURFACE_ALT },
});
