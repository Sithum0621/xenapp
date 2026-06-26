import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppScrollView from '@/src/components/layout/AppScrollView';
import { Text } from '@/src/theme/Text';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';
import {
  appBrandBlue,
  appBrandBlueDark,
  appPageSurface,
  appSurface,
  appTextMuted,
} from '@/src/theme/appBrandPalette';

const BRAND_BLUE_DARK = appBrandBlueDark;
const PAGE_BG = appSurface;
const TEXT_MUTED = appTextMuted;

type TermsVariant = 'parent' | 'teacher';

const PARENT_SECTION_KEYS = ['s1', 's2', 's3', 's4', 's5'] as const;
const TEACHER_SECTION_KEYS = ['s1', 's2', 's3', 's4'] as const;

export default function TermsAndConditionsScreen() {
  const { t } = useTranslation();
  const { variant } = useLocalSearchParams<{ variant?: string }>();
  const termsVariant: TermsVariant = variant === 'teacher' ? 'teacher' : 'parent';
  const sectionKeys = termsVariant === 'teacher' ? TEACHER_SECTION_KEYS : PARENT_SECTION_KEYS;
  const contentPrefix = `termsAndConditions.${termsVariant}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('termsAndConditions.back')}
          onPress={() => routerBackOrReplace(router)}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}>
          <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
          <Text style={styles.backText}>{t('termsAndConditions.back')}</Text>
        </Pressable>
      </View>

      <AppScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('termsAndConditions.title')}</Text>
        <Text style={styles.updated}>{t('termsAndConditions.updatedAt')}</Text>
        <Text style={styles.intro}>{t(`${contentPrefix}.intro`)}</Text>

        {sectionKeys.map((key) => (
          <View key={key} style={styles.section}>
            <Text style={styles.sectionTitle}>{t(`${contentPrefix}.${key}Title`)}</Text>
            <Text style={styles.sectionBody}>{t(`${contentPrefix}.${key}Body`)}</Text>
          </View>
        ))}
      </AppScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  header: {
    paddingHorizontal: 16,
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
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    marginBottom: 8,
    lineHeight: 34,
  },
  updated: {
    fontSize: 13,
    color: TEXT_MUTED,
    fontWeight: '600',
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
    fontWeight: '700',
    color: appBrandBlue,
    marginBottom: 8,
  },
  sectionBody: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
    fontWeight: '500',
  },
});
