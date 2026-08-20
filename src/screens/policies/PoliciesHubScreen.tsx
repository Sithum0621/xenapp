import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppScrollView from '@/src/components/layout/AppScrollView';
import PoliciesList from '@/src/components/policies/PoliciesList';
import { useHasAuthSession } from '@/src/hooks/useHasAuthSession';
import { appHref } from '@/src/navigation/AppNavigator';
import { Text } from '@/src/theme/Text';
import {
  appBrandBlueDark,
  appSurface,
  appTextMuted,
} from '@/src/theme/appBrandPalette';
import { FontFamily } from '@/src/theme/fonts';
import { PAGE_CONTENT_BOTTOM, PAGE_EDGE_INSET } from '@/src/theme/pageLayout';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

const BRAND_BLUE_DARK = appBrandBlueDark;
const TEXT_MUTED = appTextMuted;

export default function PoliciesHubScreen() {
  const { t } = useTranslation();
  const hasSession = useHasAuthSession();
  /** Guests deep-link in for legal pages — no path back into the product. */
  const showBack = hasSession === true;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      {showBack ? (
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('policies.back')}
            onPress={() => routerBackOrReplace(router, appHref('/'))}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}>
            <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
            <Text style={styles.backText}>{t('policies.back')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.headerSpacer} />
      )}

      <AppScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('policies.hubTitle')}</Text>
        <Text style={styles.subtitle}>{t('policies.hubSubtitle')}</Text>
        <Text style={styles.updated}>{t('policies.updatedAt')}</Text>

        <PoliciesList />
      </AppScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: appSurface,
  },
  header: {
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerSpacer: {
    height: 12,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingRight: 12,
    gap: 4,
  },
  backBtnPressed: {
    opacity: 0.65,
  },
  backText: {
    fontSize: 17,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
  },
  content: {
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingBottom: PAGE_CONTENT_BOTTOM,
  },
  title: {
    fontSize: 26,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    marginBottom: 8,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 15,
    color: '#334155',
    lineHeight: 22,
    marginBottom: 8,
  },
  updated: {
    fontSize: 13,
    color: TEXT_MUTED,
    fontFamily: FontFamily.bold,
    marginBottom: 18,
  },
});
