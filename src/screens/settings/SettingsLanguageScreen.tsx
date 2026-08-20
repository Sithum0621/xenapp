import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  UIManager,
  View,
} from 'react-native';

import { ScrollView } from '@/src/components/layout/scroll';
import { useAppThemeColors } from '@/src/context/ThemePreferenceContext';
import { setStoredLanguagePreference, type StoredLangCode } from '@/src/services/languagePreference';
import { Text } from '@/src/theme/Text';
import { PAGE_EDGE_INSET } from '@/src/theme/pageLayout';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const LANGS: { code: StoredLangCode; labelKey: string }[] = [
  { code: 'en', labelKey: 'adminPortal.langEnglish' },
  { code: 'si', labelKey: 'adminPortal.langSinhala' },
  { code: 'ta', labelKey: 'adminPortal.langTamil' },
];

export function normalizeAppLanguage(code: string): StoredLangCode {
  const base = code.split('-')[0]?.toLowerCase() ?? 'en';
  if (base === 'si' || base === 'ta') return base;
  return 'en';
}

export function languageLabelKeyForCode(code: StoredLangCode): string {
  if (code === 'si') return 'adminPortal.langSinhala';
  if (code === 'ta') return 'adminPortal.langTamil';
  return 'adminPortal.langEnglish';
}

export type SettingsLanguageScreenProps = {
  /** Optional lead line above the list (e.g. admin portal). */
  subtitleKey?: string;
};

export default function SettingsLanguageScreen({ subtitleKey }: SettingsLanguageScreenProps) {
  const { t, i18n } = useTranslation();
  const colors = useAppThemeColors();
  const current = normalizeAppLanguage(i18n.language);

  const select = (code: StoredLangCode) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    void i18n.changeLanguage(code);
    void setStoredLanguagePreference(code);
  };

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.page }]}
      contentContainerStyle={styles.content}>
      {subtitleKey ? (
        <Text style={[styles.sectionLead, { color: colors.textSoft }]}>{t(subtitleKey)}</Text>
      ) : null}

      <View style={styles.list}>
        {LANGS.map(({ code, labelKey }) => {
          const active = current === code;
          return (
            <Pressable
              key={code}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => select(code)}
              style={({ pressed }) => [
                styles.row,
                {
                  borderColor: active ? colors.brandOrange : colors.border,
                  backgroundColor: active ? colors.selectionWash : colors.surfaceAlt,
                },
                pressed && styles.rowPressed,
              ]}>
              <Text
                style={[
                  styles.rowLabel,
                  { color: active ? colors.brandBlueDark : colors.text },
                ]}>
                {t(labelKey)}
              </Text>
              {active ? (
                <Ionicons name="checkmark-circle" size={22} color={colors.brandOrange} />
              ) : (
                <View style={[styles.radioOuter, { borderColor: colors.border }]} />
              )}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: PAGE_EDGE_INSET, paddingTop: 12, paddingBottom: 40 },
  sectionLead: {
    fontSize: 15,
    marginBottom: 20,
    lineHeight: 22,
  },
  list: { gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: PAGE_EDGE_INSET,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  rowPressed: { opacity: 0.92 },
  rowLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
});
