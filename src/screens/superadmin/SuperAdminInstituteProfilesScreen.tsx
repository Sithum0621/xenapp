/**
 * Teachers and students linked to an institute (membership roster).
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppRoutes, PROFILE_ROLE_SUPERADMIN, appHref, hrefSuperAdminInstituteManage } from '@/src/navigation/AppNavigator';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';
import { supabase } from '@/src/services/supabaseClient';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const PAGE_BG = '#FFFFFF';
const TEXT_MUTED = '#64748B';
const SUBTLE_BORDER = '#E2E8F0';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type InstituteProfileRow = {
  user_id: string;
  email: string;
  full_name: string;
  profile_role: string;
  xen_student_id: string | null;
};

export default function SuperAdminInstituteProfilesScreen() {
  const { t } = useTranslation();
  const { id: instituteIdParam } = useLocalSearchParams<{ id?: string }>();
  const instituteId = typeof instituteIdParam === 'string' ? instituteIdParam.trim() : '';

  const [checkingGate, setCheckingGate] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [instituteName, setInstituteName] = useState('');
  const [rows, setRows] = useState<InstituteProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;

    const gate = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        router.replace(AppRoutes.login);
        return;
      }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (cancelled) return;

      if (profile?.role !== PROFILE_ROLE_SUPERADMIN) {
        router.replace(AppRoutes.login);
        return;
      }

      setAuthorized(true);
      setCheckingGate(false);
    };

    void gate();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadProfiles = useCallback(async () => {
    if (!UUID_RE.test(instituteId)) return;

    setLoading(true);
    setLoadError(null);

    const [instituteRes, profilesRes] = await Promise.all([
      supabase.rpc('superadmin_get_institute', { p_id: instituteId }),
      supabase.rpc('superadmin_list_institute_profiles', {
        p_filters: {
          institute_id: instituteId,
          search: search.trim(),
          limit: 200,
          offset: 0,
        },
      }),
    ]);

    setLoading(false);

    const instituteRow = Array.isArray(instituteRes.data) ? instituteRes.data[0] : instituteRes.data;
    if (instituteRes.error || !instituteRow?.name) {
      const msg = instituteRes.error?.message ?? '';
      setLoadError(
        msg.toLowerCase().includes('institute_not_found')
          ? t('superAdmin.instituteNotFound')
          : msg || t('superAdmin.instituteNotFound'),
      );
      setRows([]);
      return;
    }

    setInstituteName(instituteRow.name);

    if (profilesRes.error) {
      setLoadError(profilesRes.error.message);
      setRows([]);
      return;
    }

    setRows((profilesRes.data ?? []) as InstituteProfileRow[]);
  }, [instituteId, search, t]);

  useEffect(() => {
    if (!authorized || !UUID_RE.test(instituteId)) {
      setLoading(false);
      return;
    }
    const timer = setTimeout(() => void loadProfiles(), search.trim() ? 350 : 0);
    return () => clearTimeout(timer);
  }, [authorized, instituteId, loadProfiles, search]);

  const roleLabel = (role: string) => {
    if (role === 'teacher') return t('superAdmin.instituteProfilesRoleTeacher');
    return t('superAdmin.instituteProfilesRoleStudent');
  };

  if (checkingGate) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.centeredBusy}>
          <ActivityIndicator color={BRAND_BLUE} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!UUID_RE.test(instituteId)) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.pagePad}>
          <Text style={styles.errorBanner}>{t('superAdmin.instituteNotFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('auth.back')}
          onPress={() => routerBackOrReplace(router, appHref(hrefSuperAdminInstituteManage(instituteId)))}
          style={({ pressed }) => [styles.backRow, pressed && styles.backRowPressed]}>
          <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
          <Text style={styles.backText}>{t('auth.back')}</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t('superAdmin.instituteProfilesTitle')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.pagePad}>
        <Text style={styles.instituteName} numberOfLines={2}>
          {instituteName || '—'}
        </Text>
        <Text style={styles.subtitle}>{t('superAdmin.instituteProfilesSubtitle')}</Text>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('superAdmin.instituteProfilesSearchPlaceholder')}
          placeholderTextColor="#94A3B8"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.searchInput}
        />
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.centeredBusy}>
          <ActivityIndicator color={BRAND_BLUE} size="large" />
        </View>
      ) : loadError ? (
        <View style={styles.pagePad}>
          <Text style={styles.errorBanner}>{loadError}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void loadProfiles()}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}>
            <Text style={styles.retryBtnText}>{t('teacherDashboard.overview.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={rows.length === 0 ? styles.listEmptyContent : styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {search.trim()
                ? t('superAdmin.instituteProfilesSearchEmpty')
                : t('superAdmin.instituteProfilesEmpty')}
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.profileRow}>
              <View style={styles.profileAccent} />
              <View style={styles.profileMain}>
                <View style={styles.profileTitleRow}>
                  <Text style={styles.profileName} numberOfLines={1}>
                    {item.full_name?.trim() || '—'}
                  </Text>
                  <View style={styles.roleChip}>
                    <Text style={styles.roleChipText}>{roleLabel(item.profile_role)}</Text>
                  </View>
                </View>
                <Text style={styles.profileEmail} numberOfLines={1}>
                  {item.email}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAGE_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SUBTLE_BORDER,
    gap: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    textAlign: 'center',
  },
  headerSpacer: { width: 72 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 4,
    minWidth: 72,
  },
  backRowPressed: { opacity: 0.65 },
  backText: { fontSize: 17, fontWeight: '600', color: BRAND_BLUE_DARK },
  pagePad: { paddingHorizontal: 20, paddingTop: 12 },
  instituteName: {
    fontSize: 22,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: 13,
    color: TEXT_MUTED,
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 18,
  },
  searchInput: {
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    minHeight: 44,
    marginBottom: 8,
  },
  listContent: { paddingHorizontal: 20, paddingBottom: 24 },
  listEmptyContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  profileAccent: {
    width: 4,
    borderRadius: 2,
    backgroundColor: BRAND_BLUE,
    marginRight: 12,
    alignSelf: 'stretch',
  },
  profileMain: { flex: 1, minWidth: 0 },
  profileTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  profileName: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    flexShrink: 1,
  },
  roleChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  roleChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: BRAND_BLUE,
    textTransform: 'uppercase',
  },
  profileEmail: {
    fontSize: 14,
    color: TEXT_MUTED,
    marginTop: 4,
  },
  profileMeta: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
    marginTop: 4,
  },
  centeredBusy: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorBanner: {
    color: '#B91C1C',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: BRAND_BLUE,
  },
  retryBtnPressed: { opacity: 0.85 },
  retryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
