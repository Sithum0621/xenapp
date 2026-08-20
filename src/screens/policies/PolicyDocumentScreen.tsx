import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppScrollView from '@/src/components/layout/AppScrollView';
import { useHasAuthSession } from '@/src/hooks/useHasAuthSession';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import { Text } from '@/src/theme/Text';
import {
  appBrandBlue,
  appBrandBlueDark,
  appPageSurface,
  appSurface,
  appTextMuted,
} from '@/src/theme/appBrandPalette';
import { FontFamily } from '@/src/theme/fonts';
import { PAGE_CONTENT_BOTTOM, PAGE_EDGE_INSET } from '@/src/theme/pageLayout';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

const BRAND_BLUE_DARK = appBrandBlueDark;
const TEXT_MUTED = appTextMuted;

export type PolicyDocId = 'return' | 'privacy' | 'terms';

type Props = {
  doc: PolicyDocId;
};

/**
 * Shared policy document body driven by `policies.{doc}.*` locale keys.
 * Guests only navigate within `/policies/*` (back → hub). Signed-in users can leave the stack.
 */
export default function PolicyDocumentScreen({ doc }: Props) {
  const { t } = useTranslation();
  const hasSession = useHasAuthSession();
  const prefix = `policies.${doc}`;
  const sectionCount = Number(t(`${prefix}.sectionCount`, { defaultValue: '0' }));
  const sections = Array.from({ length: Math.max(0, sectionCount) }, (_, i) => i + 1);

  const onBack = () => {
    if (hasSession !== true) {
      router.replace(appHref(AppRoutes.policies));
      return;
    }
    routerBackOrReplace(router, appHref(AppRoutes.policies));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('policies.back')}
          onPress={onBack}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}>
          <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
          <Text style={styles.backText}>{t('policies.back')}</Text>
        </Pressable>
      </View>

      <AppScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t(`${prefix}.title`)}</Text>
        <Text style={styles.updated}>{t('policies.updatedAt')}</Text>
        <Text style={styles.intro}>{t(`${prefix}.intro`)}</Text>

        {sections.map((n) => (
          <View key={`${doc}-${n}`} style={styles.section}>
            <Text style={styles.sectionTitle}>{t(`${prefix}.s${n}Title`)}</Text>
            <Text style={styles.sectionBody}>{t(`${prefix}.s${n}Body`)}</Text>
          </View>
        ))}
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
    paddingHorizontal: 24,
    paddingBottom: PAGE_CONTENT_BOTTOM,
  },
  title: {
    fontSize: 26,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    marginBottom: 8,
    lineHeight: 34,
  },
  updated: {
    fontSize: 13,
    color: TEXT_MUTED,
    fontFamily: FontFamily.bold,
    marginBottom: 16,
  },
  intro: {
    fontSize: 15,
    color: '#334155',
    lineHeight: 23,
    marginBottom: 20,
  },
  section: {
    marginBottom: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: appPageSurface,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: FontFamily.bold,
    color: appBrandBlue,
    marginBottom: 8,
  },
  sectionBody: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
  },
});
