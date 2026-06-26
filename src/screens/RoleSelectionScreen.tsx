import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import { LanguageLnToggle } from '@/src/components/LanguageLnToggle';
import {
  AppRoutes,
  PUBLIC_SELECTABLE_ROLES,
  type PublicSelectableRole,
} from '@/src/navigation/AppNavigator';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
/** Pale brand strip — logo PNGs read clearly (dark artwork on light surface). */
const BRAND_SURFACE = '#E8EEF8';
const BRAND_SURFACE_GRADIENT = ['#E3EEFF', '#F1F6FF'] as const;
const PAGE_BG = '#FFFFFF';
const SUBTLE_BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';

const CARD_COLUMN_MAX = 440;

const XEN_LOGO = require('@/assets/images/brand/xen-logo.png');
const WOVELLO_LOGO = require('@/assets/images/brand/wovello-logo.png');

export type AppRoleParam = PublicSelectableRole;

function RoleCardIcon({ roleId }: { roleId: PublicSelectableRole }) {
  switch (roleId) {
    case 'parent':
      return (
        <MaterialCommunityIcons name="human-male-child" size={28} color={BRAND_BLUE} />
      );
    case 'teacher':
      return <Ionicons name="school-outline" size={28} color={BRAND_BLUE} />;
    case 'admin':
      return <Ionicons name="shield-checkmark-outline" size={28} color={BRAND_BLUE} />;
  }
}

/**
 * Public onboarding roles. `superadmin` is omitted — use a separate secure flow.
 * Parent + Student share one entry (`parent`) → login only (no self-registration).
 * Teachers open login first; new teachers can use “Create account” on that screen to sign up.
 */
const ROLES = PUBLIC_SELECTABLE_ROLES;

export type RoleSelectionScreenProps = {
  onSelectRole?: (role: AppRoleParam) => void;
};

export default function RoleSelectionScreen({ onSelectRole }: RoleSelectionScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [selectedRole, setSelectedRole] = useState<AppRoleParam | null>(null);
  const [secretTapCount, setSecretTapCount] = useState(0);

  const handleHiddenSuperadminAccess = useCallback(() => {
    setSecretTapCount((prev) => {
      const next = prev + 1;
      if (next >= 7) {
        router.push({
          pathname: AppRoutes.login,
          params: { superadmin_hint: '1' },
        });
        return 0;
      }
      return next;
    });
  }, []);

  const labelKey = (id: AppRoleParam) =>
    ({
      teacher: 'roleSelect.roles.teacher',
      parent: 'roleSelect.roles.parentStudent',
      admin: 'roleSelect.roles.admin',
    })[id];

  const handleRolePress = useCallback(
    (role: AppRoleParam) => {
      setSelectedRole(role);

      if (onSelectRole) {
        onSelectRole(role);
        return;
      }

      queueMicrotask(() => {
        if (role === 'admin') {
          router.replace({
            pathname: AppRoutes.login,
            params: { role: 'admin' },
          });
          return;
        }
        if (role === 'parent') {
          router.replace({
            pathname: AppRoutes.login,
            params: { role: 'parent' },
          });
          return;
        }
        if (role === 'teacher') {
          router.replace({
            pathname: AppRoutes.login,
            params: { role: 'teacher' },
          });
          return;
        }
      });
    },
    [onSelectRole],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.page}>
        <LinearGradient
          colors={[...BRAND_SURFACE_GRADIENT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.appName')}
            onPress={handleHiddenSuperadminAccess}
            style={styles.brandTitleTapZone}>
            <Image
              source={XEN_LOGO}
              style={styles.xenLogo}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
              accessibilityLabel={t('common.appName')}
            />
          </Pressable>
          <Text style={styles.brandTagline}>{t('languageSelect.tagline')}</Text>
        </LinearGradient>

        <KeyboardAwareScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 20 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.centerBlock}>
            <View style={styles.langToolbar}>
              <LanguageLnToggle />
            </View>
            <Text style={[styles.heading, styles.centerText]}>{t('roleSelect.whoAreYou')}</Text>
            <Text style={[styles.subheading, styles.centerText]}>{t('roleSelect.selectAccountType')}</Text>
            <Text style={[styles.subtitle, styles.centerText]}>{t('roleSelect.subtitle')}</Text>

            <View style={styles.cardGrid}>
              {ROLES.map((id) => {
                const selected = selectedRole === id;
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={t(labelKey(id))}
                    onPress={() => handleRolePress(id)}
                    style={({ pressed }) => [
                      styles.roleCard,
                      selected && styles.roleCardSelected,
                      pressed && styles.roleCardPressed,
                    ]}>
                    <View style={[styles.iconWrap, selected && styles.iconWrapSelected]}>
                      <RoleCardIcon roleId={id} />
                    </View>
                    <View style={styles.roleLabels}>
                      <Text style={[styles.roleTitle, selected && styles.roleTitleSelected]}>
                        {t(labelKey(id))}
                      </Text>
                    </View>
                    <View style={styles.chevron}>
                      <Ionicons name="chevron-forward" size={20} color={TEXT_MUTED} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </KeyboardAwareScrollView>

        <LinearGradient
          colors={[...BRAND_SURFACE_GRADIENT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.poweredFooter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Text style={styles.poweredLabel}>{t('roleSelect.poweredBy')}</Text>
          <Image
            source={WOVELLO_LOGO}
            style={styles.wovelloLogo}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            accessibilityLabel="Wovello"
          />
        </LinearGradient>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BRAND_SURFACE,
  },
  page: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 22,
    paddingTop: 8,
    alignItems: 'center',
  },
  xenLogo: {
    height: 58,
    width: 156,
    marginBottom: 8,
  },
  brandTitleTapZone: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignItems: 'center',
  },
  brandTagline: {
    marginTop: 4,
    color: BRAND_BLUE_DARK,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  centerBlock: {
    width: '100%',
    maxWidth: CARD_COLUMN_MAX,
    alignSelf: 'center',
  },
  langToolbar: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 12,
  },
  centerText: {
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    marginBottom: 6,
    lineHeight: 34,
  },
  subheading: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND_BLUE,
    marginBottom: 10,
    lineHeight: 24,
  },
  subtitle: {
    fontSize: 16,
    color: TEXT_MUTED,
    lineHeight: 24,
    marginBottom: 28,
  },
  cardGrid: {
    gap: 14,
    width: '100%',
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 18,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#F8FAFC',
    ...Platform.select({
      ios: {
        shadowColor: '#123B7A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  roleCardSelected: {
    borderColor: BRAND_BLUE,
    backgroundColor: '#EFF6FF',
  },
  roleCardPressed: {
    opacity: 0.94,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
  },
  iconWrapSelected: {
    borderColor: BRAND_BLUE,
  },
  roleLabels: {
    flex: 1,
    gap: 2,
  },
  roleTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
  roleTitleSelected: {
    color: BRAND_BLUE_DARK,
  },
  chevron: {
    opacity: 0.85,
  },
  poweredFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 14,
    paddingHorizontal: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SUBTLE_BORDER,
  },
  poweredLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: TEXT_MUTED,
    letterSpacing: 0.2,
  },
  wovelloLogo: {
    height: 22,
    width: 88,
  },
});
