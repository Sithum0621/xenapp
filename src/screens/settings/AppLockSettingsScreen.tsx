import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { StyleSheet } from 'react-native';

import { ScrollView } from '@/src/components/layout/scroll';

import AppLockSettingsSection from '@/src/components/app-lock/AppLockSettingsSection';
import { PAGE_CONTENT_BOTTOM, PAGE_EDGE_INSET } from '@/src/theme/pageLayout';

const BRAND_BLUE_DARK = '#00101F';
export default function AppLockSettingsScreen() {
  const { t } = useTranslation();

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.lead}>{t('appLock.settingsIntro')}</Text>
      <AppLockSettingsSection />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingBottom: PAGE_CONTENT_BOTTOM,
    paddingTop: 4,
  },
  lead: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 4,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
});
