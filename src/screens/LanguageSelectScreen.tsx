import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { LayoutAnimation, Platform, Pressable, StyleSheet, UIManager, View } from 'react-native';

import { ScrollView } from '@/src/components/layout/scroll';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { setStoredLanguagePreference, type StoredLangCode } from '@/src/services/languagePreference';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const PAGE_BG = '#FFFFFF';
const SUBTLE_BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';

type LangCode = 'en' | 'si' | 'ta';

const LANGUAGES: {
  code: LangCode;
  nativeName: string;
  icon: ComponentProps<typeof Ionicons>['name'];
}[] = [
  { code: 'en', nativeName: 'English', icon: 'language' },
  { code: 'si', nativeName: 'සිංහල', icon: 'school-outline' },
  { code: 'ta', nativeName: 'தமிழ்', icon: 'library-outline' },
];

export type LanguageSelectScreenProps = {
  onContinue?: () => void;
};

export default function LanguageSelectScreen({ onContinue }: LanguageSelectScreenProps) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<LangCode | null>(null);
  const selectLanguage = useCallback(
    (code: LangCode) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setSelected(code);
      void i18n.changeLanguage(code);
      void setStoredLanguagePreference(code as StoredLangCode);
    },
    [i18n],
  );

  const handleContinue = useCallback(() => {
    if (selected == null) return;
    void setStoredLanguagePreference(selected as StoredLangCode);
    if (onContinue) {
      onContinue();
      return;
    }
    router.replace('/role-select');
  }, [onContinue, selected]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.page}>
        <View style={styles.header}>
          <View style={styles.logoMark} accessibilityRole="image" accessibilityLabel="XEN">
            <Ionicons name="book" size={36} color={BRAND_BLUE} />
          </View>
          <Text style={styles.brandTitle} accessibilityRole="header">
            {t('common.appName')}
          </Text>
          <Text style={styles.brandTagline}>{t('languageSelect.tagline')}</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Text style={styles.heading}>{t('languageSelect.title')}</Text>
          <Text style={styles.subtitle}>{t('languageSelect.subtitle')}</Text>

          <View style={styles.langList}>
            {LANGUAGES.map(({ code, nativeName, icon }) => {
              const isActive = selected === code;
              return (
                <Pressable
                  key={code}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={nativeName}
                  onPress={() => selectLanguage(code)}
                  style={({ pressed }) => [
                    styles.langButton,
                    isActive && styles.langButtonSelected,
                    pressed && styles.langButtonPressed,
                  ]}>
                  <View style={[styles.langIconCircle, isActive && styles.langIconCircleActive]}>
                    <Ionicons
                      name={icon}
                      size={22}
                      color={isActive ? BRAND_BLUE : TEXT_MUTED}
                    />
                  </View>
                  <Text style={[styles.langLabel, isActive && styles.langLabelActive]}>
                    {nativeName}
                  </Text>
                  {isActive ? (
                    <Ionicons name="checkmark-circle" size={22} color={BRAND_BLUE} />
                  ) : (
                    <View style={styles.radioOuter}>
                      <View style={styles.radioInner} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

        </ScrollView>

        {selected != null && (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('languageSelect.continue')}
              onPress={handleContinue}
              style={({ pressed }) => [styles.continueBtn, pressed && styles.continueBtnPressed]}>
              <Text style={styles.continueText}>{t('languageSelect.continue')}</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BRAND_BLUE,
  },
  page: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  header: {
    backgroundColor: BRAND_BLUE,
    paddingHorizontal: 24,
    paddingBottom: 28,
    paddingTop: 8,
    alignItems: 'center',
  },
  logoMark: {
    width: 76,
    height: 76,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  brandTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  brandTagline: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    marginBottom: 8,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 16,
    color: TEXT_MUTED,
    lineHeight: 24,
    marginBottom: 28,
  },
  langList: {
    gap: 14,
  },
  langButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#F8FAFC',
  },
  langButtonSelected: {
    borderColor: BRAND_BLUE,
    backgroundColor: '#EFF6FF',
  },
  langButtonPressed: {
    opacity: 0.92,
  },
  langIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
  },
  langIconCircleActive: {
    borderColor: BRAND_BLUE,
  },
  langLabel: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
  },
  langLabelActive: {
    color: BRAND_BLUE_DARK,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: SUBTLE_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 0,
    height: 0,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: PAGE_BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SUBTLE_BORDER,
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: BRAND_BLUE,
    paddingVertical: 16,
    borderRadius: 14,
    minHeight: 52,
  },
  continueBtnPressed: {
    backgroundColor: BRAND_BLUE_DARK,
  },
  continueText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
