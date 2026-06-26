import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';

import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';
import { parseTeacherGroupParams } from '@/src/utils/teacherGroupRouteParams';

const BRAND_BLUE_DARK = '#0E2F63';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';

type Props = {
  sectionTitle: string;
  children: ReactNode;
};

export default function TeacherGroupSubScreenShell({ sectionTitle, children }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const raw = useLocalSearchParams<{ title?: string; source?: string; id?: string }>();
  const ctx = parseTeacherGroupParams(raw);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace({
      pathname: '/teacher-dashboard/group-detail',
      params: {
        title: ctx.title || '',
        source: ctx.source,
        id: ctx.groupId,
      },
    } as never);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardExtraPadding={32}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={goBack}
            style={({ pressed }) => [styles.backRow, pressed && styles.backPressed]}>
            <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
            <Text style={styles.backLabel}>{t('auth.back')}</Text>
          </Pressable>
          <Text style={styles.groupTitle} numberOfLines={2}>
            {ctx.title || '—'}
          </Text>
          <Text style={styles.sectionTitle} numberOfLines={2}>
            {sectionTitle}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => routerBackOrReplace(router, appHref(AppRoutes.teacherDashboard))}
            style={({ pressed }) => [styles.exitClasses, pressed && styles.backPressed]}>
            <Text style={styles.exitClassesText}>{t('teacherDashboard.groupDetail.backToClasses')}</Text>
            <Ionicons name="home-outline" size={16} color={TEXT_MUTED} />
          </Pressable>
        </View>
        <View style={styles.card}>{children}</View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { paddingBottom: 28 },
  header: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    backgroundColor: '#FFFFFF',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    paddingVertical: 6,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {}),
  },
  backPressed: { opacity: 0.75 },
  backLabel: { fontSize: 16, fontWeight: '600', color: BRAND_BLUE_DARK },
  groupTitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_MUTED,
    lineHeight: 20,
  },
  sectionTitle: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    lineHeight: 28,
  },
  exitClasses: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  exitClassesText: {
    fontSize: 13,
    fontWeight: '700',
    color: TEXT_MUTED,
  },
  card: {
    marginHorizontal: 18,
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
  },
});
