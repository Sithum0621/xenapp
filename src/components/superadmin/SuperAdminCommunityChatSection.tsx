import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import CommunityChatRoom from '@/src/components/community/CommunityChatRoom';
import { Text } from '@/src/theme/Text';

const TEXT_MUTED = '#64748B';

type Props = {
  desktopShell?: boolean;
};

export default function SuperAdminCommunityChatSection({ desktopShell }: Props) {
  const { t } = useTranslation();

  return (
    <View style={[styles.wrap, desktopShell && styles.wrapDesktop]}>
      <Text style={styles.subtitle}>{t('superAdmin.communityChatSubtitle')}</Text>
      <CommunityChatRoom embedded />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 10 },
  wrapDesktop: { paddingHorizontal: 4 },
  subtitle: {
    fontSize: 14,
    color: TEXT_MUTED,
    lineHeight: 20,
  },
});
