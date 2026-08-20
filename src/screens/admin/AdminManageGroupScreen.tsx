import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { appHref } from '@/src/navigation/AppNavigator';
import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import ManageGroupScheduleSection from '@/src/screens/admin/ManageGroupScheduleSection';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';
import {
  instituteAdminGetLectureGroup,
  type LectureGroupRow,
} from '@/src/services/instituteAdminLectureGroupsApi';
import { useAdminLayout } from '@/src/hooks/useAdminLayout';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractGroupIdFromPathname(pathname: string): string | undefined {
  const trimmed = pathname.replace(/\/$/, '');
  const last = trimmed.split('/').pop();
  if (!last || last === 'index' || last === 'groups') return undefined;
  const decoded = decodeURIComponent(last);
  return UUID_RE.test(decoded) ? decoded : undefined;
}

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const TEXT_MUTED = '#64748B';
const SUBTLE_BORDER = '#E2E8F0';
const PAGE_SURFACE = '#F8FAFC';

export default function AdminManageGroupScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { contentPadding } = useAdminLayout();
  const params = useLocalSearchParams<{ groupId: string | string[] }>();
  const groupId = useMemo(() => {
    const raw = params.groupId;
    const fromParams = Array.isArray(raw) ? raw[0] : raw;
    const a = typeof fromParams === 'string' ? fromParams.trim() : '';
    if (a && UUID_RE.test(a)) return a;
    const fromPath = extractGroupIdFromPathname(pathname);
    return fromPath ?? undefined;
  }, [params.groupId, pathname]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<LectureGroupRow | null>(null);

  const load = useCallback(async () => {
    if (!groupId) {
      setError('missing_id');
      setLoading(false);
      return;
    }
    setError(null);
    const { row, error: err } = await instituteAdminGetLectureGroup(groupId);
    if (err) {
      setError(err);
      setGroup(null);
      return;
    }
    setGroup(row);
    if (!row) setError('not_found');
  }, [groupId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (!groupId) {
    return (
      <View style={styles.centerBox}>
        <Text style={styles.muted}>{t('adminPortal.manageGroupInvalid')}</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color={BRAND_BLUE} />
        <Text style={styles.muted}>{t('adminPortal.groupsLoading')}</Text>
      </View>
    );
  }

  if (error || !group) {
    return (
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, contentPadding]}
        keyboardExtraPadding={32}>
        <Pressable
          accessibilityRole="button"
          onPress={() => routerBackOrReplace(router, appHref('/admin-dashboard/groups'))}
          style={({ pressed }) => [styles.backRow, pressed && styles.backRowPressed]}>
          <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
          <Text style={styles.backLabel}>{t('adminPortal.manageGroupBack')}</Text>
        </Pressable>
        <View style={styles.banner}>
          <Ionicons name="warning-outline" size={20} color="#B45309" style={styles.bannerIcon} />
          <View style={styles.bannerTextCol}>
            <Text style={styles.bannerText}>{t('adminPortal.manageGroupLoadError')}</Text>
            {error && error !== 'not_found' && error !== 'missing_id' ? (
              <Text style={styles.bannerDetail} selectable>
                {error}
              </Text>
            ) : null}
          </View>
        </View>
      </KeyboardAwareScrollView>
    );
  }

  return (
    <KeyboardAwareScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, contentPadding]}
      keyboardExtraPadding={32}>
      <Pressable
        accessibilityRole="button"
        onPress={() => routerBackOrReplace(router, appHref('/admin-dashboard/groups'))}
        style={({ pressed }) => [styles.backRow, pressed && styles.backRowPressed]}>
        <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
        <Text style={styles.backLabel}>{t('adminPortal.manageGroupBack')}</Text>
      </Pressable>

      <Text style={styles.title}>{group.name}</Text>
      {group.primary_teacher_full_name ? (
        <Text style={styles.metaLine}>
          {t('adminPortal.groupsRowPrimary', { name: group.primary_teacher_full_name })}
        </Text>
      ) : null}
      {group.description ? <Text style={styles.desc}>{group.description}</Text> : null}

      <ManageGroupScheduleSection lectureGroupId={group.id} />
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { flexGrow: 1, width: '100%' },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  muted: { fontSize: 15, color: TEXT_MUTED },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  backRowPressed: { opacity: 0.75 },
  backLabel: { fontSize: 16, fontWeight: '700', color: BRAND_BLUE_DARK },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  bannerIcon: { marginTop: 2 },
  bannerTextCol: { flex: 1, minWidth: 0 },
  bannerText: { fontSize: 14, color: '#92400E', fontWeight: '600' },
  bannerDetail: { marginTop: 6, fontSize: 12, color: '#78350F' },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    marginBottom: 8,
  },
  metaLine: { fontSize: 14, fontWeight: '700', color: BRAND_BLUE, marginBottom: 8 },
  desc: { fontSize: 15, color: TEXT_MUTED, lineHeight: 22, marginBottom: 20 },
});
