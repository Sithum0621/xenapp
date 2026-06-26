/**
 * When signed in as platform superadmin, show quick navigation between all role dashboards
 * (preview surfaces without changing profiles.role).
 */
import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ScrollView } from '@/src/components/layout/scroll';

import { AppRoutes, appHref, PROFILE_ROLE_SUPERADMIN } from '@/src/navigation/AppNavigator';
import { supabase } from '@/src/services/supabaseClient';

const ROUTES = [
  { href: AppRoutes.superAdminDashboard, labelKey: 'superAdmin.roleChip.superadmin' as const },
  { href: AppRoutes.adminDashboard, labelKey: 'superAdmin.roleChip.admin' as const },
  { href: AppRoutes.teacherDashboard, labelKey: 'superAdmin.roleChip.teacher' as const },
  { href: AppRoutes.parentDashboard, labelKey: 'superAdmin.roleChip.parent_student' as const },
];

export default function SuperadminDevDashboardSwitcher() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();

      if (cancelled) return;

      setVisible(profile?.role === PROFILE_ROLE_SUPERADMIN);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  const normalizedPath = pathname.replace(/\/$/, '') || '/';

  return (
    <View style={styles.wrap} accessibilityRole="toolbar">
      <Text style={styles.hint}>{t('superAdmin.devDashboardSwitcher')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollInner}
        {...(Platform.OS === 'web' ? { dataSet: { touchScroll: 'horizontal' } } : {})}>
        {ROUTES.map(({ href, labelKey }) => {
          const normalizedHref = href.replace(/\/$/, '') || '/';
          const selected =
            normalizedPath === normalizedHref || normalizedPath.startsWith(`${normalizedHref}/`);

          return (
            <Pressable
              key={href}
              accessibilityRole="button"
              accessibilityLabel={t(labelKey)}
              accessibilityState={{ selected }}
              onPress={() => router.replace(appHref(href))}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipSelected,
                pressed && !selected && styles.chipPressed,
              ]}>
              <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{t(labelKey)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
    paddingBottom: 10,
    paddingTop: 8,
  },
  hint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    paddingHorizontal: 16,
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  scrollInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  chipSelected: {
    borderColor: BRAND_BLUE,
    backgroundColor: BRAND_BLUE,
  },
  chipPressed: {
    opacity: 0.85,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
  chipLabelSelected: {
    color: '#FFFFFF',
  },
});
