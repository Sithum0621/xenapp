import { Ionicons } from '@expo/vector-icons';
import { Slot, usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ADMIN_COMPACT_BREAKPOINT } from '@/src/constants/adminLayout';
import { useAppThemeColors } from '@/src/context/ThemePreferenceContext';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import { Text } from '@/src/theme/Text';
import { PAGE_EDGE_INSET } from '@/src/theme/pageLayout';

export default function AdminSettingsLayout() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isCompact = width < ADMIN_COMPACT_BREAKPOINT;
  const colors = useAppThemeColors();

  const onProfile =
    pathname.endsWith('/profile') ||
    pathname.endsWith('/settings') ||
    pathname.endsWith('/settings/');
  const onLang = pathname.includes('/language');
  const onAppLock = pathname.includes('/app-lock');

  const profileSelected = onProfile && !onLang && !onAppLock;

  return (
    <View style={styles.wrap}>
      <View style={[styles.header, isCompact && styles.headerCompact]}>
        {!isCompact ? (
          <Text style={[styles.screenTitle, { color: colors.brandBlueDark }]}>
            {t('adminPortal.settingsTitle')}
          </Text>
        ) : null}

        <View
          style={[
            styles.segment,
            isCompact && styles.segmentCompact,
            { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
          ]}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: profileSelected }}
            onPress={() => router.replace('/admin-dashboard/settings/profile')}
            style={[
              styles.segmentBtn,
              profileSelected && {
                backgroundColor: colors.selectionWash,
                borderWidth: 1.5,
                borderColor: colors.brandRoyal,
              },
            ]}>
            <Text
              style={[
                styles.segmentText,
                isCompact && styles.segmentTextCompact,
                { color: profileSelected ? colors.brandBlueDark : colors.textMuted },
              ]}
              numberOfLines={2}>
              {t('adminPortal.settingsProfileTab')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: onAppLock }}
            onPress={() => router.replace('/admin-dashboard/settings/app-lock')}
            style={[
              styles.segmentBtn,
              onAppLock && {
                backgroundColor: colors.selectionWash,
                borderWidth: 1.5,
                borderColor: colors.brandRoyal,
              },
            ]}>
            <Text
              style={[
                styles.segmentText,
                isCompact && styles.segmentTextCompact,
                { color: onAppLock ? colors.brandBlueDark : colors.textMuted },
              ]}
              numberOfLines={2}>
              {t('adminPortal.settingsAppLockTab')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: onLang }}
            onPress={() => router.replace('/admin-dashboard/settings/language')}
            style={[
              styles.segmentBtn,
              onLang && {
                backgroundColor: colors.selectionWash,
                borderWidth: 1.5,
                borderColor: colors.brandRoyal,
              },
            ]}>
            <Text
              style={[
                styles.segmentText,
                isCompact && styles.segmentTextCompact,
                { color: onLang ? colors.brandBlueDark : colors.textMuted },
              ]}
              numberOfLines={2}>
              {t('adminPortal.settingsLanguageTab')}
            </Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('adminPortal.settingsPoliciesLink')}
          onPress={() => router.push(appHref(AppRoutes.policies))}
          style={({ pressed }) => [
            styles.policiesLink,
            { borderColor: colors.border, backgroundColor: colors.surface },
            pressed && styles.policiesLinkPressed,
          ]}>
          <View style={[styles.policiesIcon, { backgroundColor: colors.selectionWash }]}>
            <Ionicons name="document-text-outline" size={18} color={colors.brandBlueDark} />
          </View>
          <View style={styles.policiesText}>
            <Text style={[styles.policiesTitle, { color: colors.brandBlueDark }]}>
              {t('adminPortal.settingsPoliciesLink')}
            </Text>
            <Text style={[styles.policiesHint, { color: colors.textMuted }]}>
              {t('adminPortal.settingsPoliciesHint')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      <Slot />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingTop: 8,
    minWidth: 0,
  },
  header: {
    paddingHorizontal: PAGE_EDGE_INSET,
  },
  headerCompact: {
    paddingHorizontal: PAGE_EDGE_INSET,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 14,
  },
  segment: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 12,
    gap: 4,
    width: '100%',
  },
  segmentCompact: {
    flexWrap: 'wrap',
  },
  segmentBtn: {
    flex: 1,
    minWidth: 72,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  segmentTextCompact: {
    fontSize: 11,
    lineHeight: 15,
  },
  policiesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 16,
  },
  policiesLinkPressed: {
    opacity: 0.88,
  },
  policiesIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  policiesText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  policiesTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  policiesHint: {
    fontSize: 12,
    fontWeight: '600',
  },
});
