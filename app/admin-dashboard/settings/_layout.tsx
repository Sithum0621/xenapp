import { Slot, usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ADMIN_COMPACT_BREAKPOINT } from '@/src/constants/adminLayout';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const SUBTLE_BORDER = '#E2E8F0';

export default function AdminSettingsLayout() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isCompact = width < ADMIN_COMPACT_BREAKPOINT;

  const onProfile =
    pathname.endsWith('/profile') ||
    pathname.endsWith('/settings') ||
    pathname.endsWith('/settings/');
  const onLang = pathname.includes('/language');
  const onAppLock = pathname.includes('/app-lock');

  return (
    <View style={styles.wrap}>
      <View style={[styles.header, isCompact && styles.headerCompact]}>
        {!isCompact ? (
          <Text style={styles.screenTitle}>{t('adminPortal.settingsTitle')}</Text>
        ) : null}

        <View style={[styles.segment, isCompact && styles.segmentCompact]}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: onProfile && !onLang && !onAppLock }}
            onPress={() => router.replace('/admin-dashboard/settings/profile')}
            style={[styles.segmentBtn, onProfile && !onLang && !onAppLock && styles.segmentBtnActive]}>
            <Text
              style={[
                styles.segmentText,
                isCompact && styles.segmentTextCompact,
                onProfile && !onLang && !onAppLock && styles.segmentTextActive,
              ]}
              numberOfLines={2}>
              {t('adminPortal.settingsProfileTab')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: onAppLock }}
            onPress={() => router.replace('/admin-dashboard/settings/app-lock')}
            style={[styles.segmentBtn, onAppLock && styles.segmentBtnActive]}>
            <Text
              style={[
                styles.segmentText,
                isCompact && styles.segmentTextCompact,
                onAppLock && styles.segmentTextActive,
              ]}
              numberOfLines={2}>
              {t('adminPortal.settingsAppLockTab')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: onLang }}
            onPress={() => router.replace('/admin-dashboard/settings/language')}
            style={[styles.segmentBtn, onLang && styles.segmentBtnActive]}>
            <Text
              style={[
                styles.segmentText,
                isCompact && styles.segmentTextCompact,
                onLang && styles.segmentTextActive,
              ]}
              numberOfLines={2}>
              {t('adminPortal.settingsLanguageTab')}
            </Text>
          </Pressable>
        </View>
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
    paddingHorizontal: 24,
  },
  headerCompact: {
    paddingHorizontal: 16,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    marginBottom: 14,
  },
  segment: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#F8FAFC',
    marginBottom: 16,
    gap: 4,
    width: '100%',
  },
  segmentCompact: {
    flexWrap: 'wrap',
  },
  segmentBtn: {
    flex: 1,
    minWidth: 88,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  segmentBtnActive: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: BRAND_BLUE,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  segmentTextCompact: {
    fontSize: 12,
    lineHeight: 16,
  },
  segmentTextActive: {
    color: BRAND_BLUE_DARK,
  },
});
