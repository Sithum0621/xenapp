import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import { Text } from '@/src/theme/Text';
import {
  appBrandBlueDark,
  appPageSurface,
  appTextMuted,
} from '@/src/theme/appBrandPalette';
import { FontFamily } from '@/src/theme/fonts';

const BORDER = '#E2E8F0';

type PolicyListItem = {
  key: string;
  titleKey: string;
  hintKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
};

export const POLICY_LIST_ITEMS: PolicyListItem[] = [
  {
    key: 'return',
    titleKey: 'policies.returnPolicy',
    hintKey: 'policies.returnPolicyHint',
    icon: 'return-down-back-outline',
    href: AppRoutes.policiesReturn,
  },
  {
    key: 'privacy',
    titleKey: 'policies.privacyPolicy',
    hintKey: 'policies.privacyPolicyHint',
    icon: 'shield-checkmark-outline',
    href: AppRoutes.policiesPrivacy,
  },
  {
    key: 'terms',
    titleKey: 'policies.termsPolicy',
    hintKey: 'policies.termsHint',
    icon: 'document-text-outline',
    href: AppRoutes.policiesTerms,
  },
];

type Props = {
  /** Tighter padding for landing embedding. */
  compact?: boolean;
};

/**
 * Shared Return / Privacy / Terms list — used in the in-app policies hub.
 */
export default function PoliciesList({ compact }: Props) {
  const { t } = useTranslation();

  return (
    <View style={[styles.list, compact && styles.listCompact]} accessibilityRole="list">
      {POLICY_LIST_ITEMS.map((item, index) => (
        <Pressable
          key={item.key}
          accessibilityRole="link"
          accessibilityLabel={t(item.titleKey)}
          onPress={() => router.push(appHref(item.href))}
          style={({ pressed }) => [
            styles.row,
            compact && styles.rowCompact,
            index < POLICY_LIST_ITEMS.length - 1 && styles.rowBorder,
            pressed && styles.rowPressed,
          ]}>
          <View style={[styles.iconWrap, compact && styles.iconWrapCompact]}>
            <Ionicons name={item.icon} size={compact ? 18 : 20} color={appBrandBlueDark} />
          </View>
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, compact && styles.rowTitleCompact]}>
              {t(item.titleKey)}
            </Text>
            <Text style={styles.rowHint}>{t(item.hintKey)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={appTextMuted} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: appPageSurface,
    overflow: 'hidden',
  },
  listCompact: {
    borderRadius: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowCompact: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  rowPressed: {
    opacity: 0.88,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EEF4FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapCompact: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    fontSize: 16,
    fontFamily: FontFamily.bold,
    color: appBrandBlueDark,
  },
  rowTitleCompact: {
    fontSize: 15,
  },
  rowHint: {
    fontSize: 13,
    color: appTextMuted,
    lineHeight: 18,
  },
});
