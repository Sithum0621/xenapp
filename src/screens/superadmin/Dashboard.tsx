/**
 * Superadmin dashboard — subscriptions via RPC; user delete via Edge Function (Admin Auth API).
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StyleProp, TextStyle } from 'react-native';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, RefreshControl, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';

import { ScrollView } from '@/src/components/layout/scroll';
import { SafeAreaView } from 'react-native-safe-area-context';

import SuperadminDevDashboardSwitcher from '@/src/components/SuperadminDevDashboardSwitcher';
import SuperAdminDashboardGrowthChart from '@/src/components/superadmin/SuperAdminDashboardGrowthChart';
import SuperAdminCardOrdersDashboardTile from '@/src/components/superadmin/SuperAdminCardOrdersDashboardTile';
import SuperAdminCardOrdersSection from '@/src/components/superadmin/SuperAdminCardOrdersSection';
import SuperAdminGamesScheduleSection from '@/src/components/superadmin/SuperAdminGamesScheduleSection';
import SuperAdminTeacherWalletTopupsDashboardTile from '@/src/components/superadmin/SuperAdminTeacherWalletTopupsDashboardTile';
import SuperAdminTeacherWalletTopupsSection from '@/src/components/superadmin/SuperAdminTeacherWalletTopupsSection';
import SuperAdminCommunityChatSection from '@/src/components/superadmin/SuperAdminCommunityChatSection';
import SuperAdminAppReleaseSection from '@/src/components/superadmin/SuperAdminAppReleaseSection';
import InstituteDetailsFormFields from '@/src/components/superadmin/InstituteDetailsFormFields';
import {
  appHref,
  hrefSuperAdminInstituteManage,
  PROFILE_ROLE_SUPERADMIN,
} from '@/src/navigation/AppNavigator';
import { fetchPremiumCardOrdersPendingCount } from '@/src/services/superadminPremiumCardOrdersApi';
import { fetchPendingTeacherWalletTopupsCount } from '@/src/services/superadminTeacherWalletApi';
import {
  fetchSuperadminDashboardGrowth,
  fetchSuperadminDashboardStats,
  type GrowthPeriod,
  type SuperadminDashboardGrowth,
  type SuperadminDashboardStats,
} from '@/src/services/superadminDashboardApi';
import { deleteSuperadminUser } from '@/src/services/superadminDeleteUserApi';
import { supabase } from '@/src/services/supabaseClient';
import {
  EMPTY_INSTITUTE_FORM,
  instituteFormToRpcPayload,
  instituteListMetaLine,
  mapInstituteRpcError,
  validateInstituteForm,
  type InstituteFormValues,
} from '@/src/utils/instituteFormValidation';

const DESKTOP_SIDEBAR_BREAKPOINT = 960;
const SIDEBAR_RAIL_EXPANDED_W = 220;
const SIDEBAR_RAIL_COLLAPSED_W = 52;

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const PAGE_BG = '#FFFFFF';
const TEXT_MUTED = '#64748B';
const SUBTLE_BORDER = '#E2E8F0';
const DASHBOARD_PANEL_BG = '#F8FAFC';

type DashboardStatTileDef = {
  id: keyof SuperadminDashboardStats;
  icon: 'school-outline' | 'business-outline' | 'shield-checkmark-outline' | 'people-outline';
  labelKey:
    | 'superAdmin.dashboardStatTeachers'
    | 'superAdmin.dashboardStatInstitutes'
    | 'superAdmin.dashboardStatAdmins'
    | 'superAdmin.dashboardStatStudents';
  accent: string;
  bg: string;
};

const DASHBOARD_STAT_TILES: DashboardStatTileDef[] = [
  {
    id: 'teachers',
    icon: 'school-outline',
    labelKey: 'superAdmin.dashboardStatTeachers',
    accent: BRAND_BLUE,
    bg: '#EFF6FF',
  },
  {
    id: 'institutes',
    icon: 'business-outline',
    labelKey: 'superAdmin.dashboardStatInstitutes',
    accent: '#5B21B6',
    bg: '#F5F3FF',
  },
  {
    id: 'admins',
    icon: 'shield-checkmark-outline',
    labelKey: 'superAdmin.dashboardStatAdmins',
    accent: '#B45309',
    bg: '#FFFBEB',
  },
  {
    id: 'students',
    icon: 'people-outline',
    labelKey: 'superAdmin.dashboardStatStudents',
    accent: '#047857',
    bg: '#ECFDF5',
  },
];

/** Page size for superadmin lists (fetch limit+1 row to detect hasMore). */
const USER_LIST_PAGE_SIZE = 30;
/** Pagination chunk size for institutes list (requested explicitly). */
const INSTITUTE_LIST_PAGE_SIZE = 5;

export type SuperAdminUserRow = {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  expiry_date: string | null;
  is_active: boolean;
};

export type SuperAdminTab = 'teachers' | 'admins' | 'others';

export type InstituteRow = {
  id: string;
  name: string;
  address: string | null;
  contact_info: string | null;
  address_line1: string | null;
  address_line2: string | null;
  email: string | null;
  contact_number: string | null;
  notes: string | null;
  created_at: string;
};

type SuperAdminPrimaryNav =
  | 'dashboard'
  | 'users'
  | 'institutes'
  | 'gamesSchedule'
  | 'cardOrders'
  | 'walletTopups'
  | 'communityChat'
  | 'appReleases';

function normalizeRole(role: string): string {
  return (role || '').trim().toLowerCase();
}

/** Maps UI tab to server-side filter (pagination-friendly). */
function roleFilterFromTab(tab: SuperAdminTab): string {
  if (tab === 'teachers') return 'teachers';
  if (tab === 'admins') return 'admins';
  return 'others';
}

function dedupeInstituteRows(rows: InstituteRow[]): InstituteRow[] {
  const byId = new Map<string, InstituteRow>();
  for (const row of rows) {
    byId.set(row.id, row);
  }
  return Array.from(byId.values());
}

function instituteListMetaLineFromRow(item: InstituteRow): string {
  return instituteListMetaLine(item);
}

/** Keeps keystrokes local so the dashboard shell does not re-render on every character. */
function DebouncedSearchField({
  placeholder,
  style,
  onDebouncedChange,
  delayMs = 400,
}: {
  placeholder: string;
  style: StyleProp<TextStyle>;
  onDebouncedChange: (trimmed: string) => void;
  delayMs?: number;
}) {
  const [local, setLocal] = useState('');
  const didSyncRef = useRef(false);

  useEffect(() => {
    if (!didSyncRef.current) {
      didSyncRef.current = true;
      onDebouncedChange(local.trim());
      return;
    }
    const timer = setTimeout(() => onDebouncedChange(local.trim()), delayMs);
    return () => clearTimeout(timer);
  }, [local, delayMs, onDebouncedChange]);

  return (
    <TextInput
      value={local}
      onChangeText={setLocal}
      placeholder={placeholder}
      placeholderTextColor="#94A3B8"
      autoCapitalize="none"
      autoCorrect={false}
      style={style}
    />
  );
}

export default function SuperadminDashboard() {
  const { t, i18n } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const desktopShell = windowWidth >= DESKTOP_SIDEBAR_BREAKPOINT;
  const [winRailExpanded, setWinRailExpanded] = useState(
    () => windowWidth >= DESKTOP_SIDEBAR_BREAKPOINT,
  );

  const [authorized, setAuthorized] = useState(false);
  const [checkingGate, setCheckingGate] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SuperAdminTab>('teachers');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [rows, setRows] = useState<SuperAdminUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SuperAdminUserRow | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [primaryNav, setPrimaryNav] = useState<SuperAdminPrimaryNav>('dashboard');
  const [institutesRows, setInstitutesRows] = useState<InstituteRow[]>([]);
  const [instituteLoading, setInstituteLoading] = useState(false);
  const [instituteRefreshing, setInstituteRefreshing] = useState(false);
  const [instituteForm, setInstituteForm] = useState<InstituteFormValues>(EMPTY_INSTITUTE_FORM);
  const [instituteSubmitting, setInstituteSubmitting] = useState(false);
  const [debouncedInstituteSearch, setDebouncedInstituteSearch] = useState('');
  const [pendingInstituteDelete, setPendingInstituteDelete] = useState<InstituteRow | null>(null);
  const [busyInstituteId, setBusyInstituteId] = useState<string | null>(null);
  const [usersLoadingMore, setUsersLoadingMore] = useState(false);
  const [institutesLoadingMore, setInstitutesLoadingMore] = useState(false);
  const [showAddInstituteForm, setShowAddInstituteForm] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<SuperadminDashboardStats | null>(null);
  const [dashboardStatsLoading, setDashboardStatsLoading] = useState(false);
  const [dashboardStatsRefreshing, setDashboardStatsRefreshing] = useState(false);
  const [dashboardStatsError, setDashboardStatsError] = useState<string | null>(null);
  const [growthPeriod, setGrowthPeriod] = useState<GrowthPeriod>('month');
  const [growthData, setGrowthData] = useState<SuperadminDashboardGrowth | null>(null);
  const [growthLoading, setGrowthLoading] = useState(false);
  const [growthError, setGrowthError] = useState<string | null>(null);
  const [pendingCardOrdersCount, setPendingCardOrdersCount] = useState(0);
  const [pendingWalletTopupsCount, setPendingWalletTopupsCount] = useState(0);

  const usersListSeqRef = useRef(0);
  const usersOffsetRef = useRef(0);
  const usersHasMoreRef = useRef(true);
  const usersLoadingMoreRef = useRef(false);

  const institutesListSeqRef = useRef(0);
  const institutesOffsetRef = useRef(0);
  const institutesHasMoreRef = useRef(true);
  const institutesLoadingMoreRef = useRef(false);
  const institutesCanLoadMoreRef = useRef(false);

  const setDebouncedSearchStable = useCallback((value: string) => {
    setDebouncedSearch(value);
  }, []);

  const setDebouncedInstituteSearchStable = useCallback((value: string) => {
    setDebouncedInstituteSearch(value);
  }, []);

  const formatDashboardCount = useCallback(
    (value: number) => new Intl.NumberFormat(i18n.language).format(value),
    [i18n.language],
  );

  const dashboardStatsGridWide = desktopShell && windowWidth >= 720;

  useEffect(() => {
    if (windowWidth < DESKTOP_SIDEBAR_BREAKPOINT) {
      setWinRailExpanded(false);
      return;
    }
    setWinRailExpanded(true);
  }, [windowWidth]);

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

      setCurrentUserId(user.id);
      setAuthorized(true);
      setCheckingGate(false);
    };

    void gate();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadUsers = useCallback(
    async (reset: boolean) => {
      if (!authorized || primaryNav !== 'users') {
        setLoading(false);
        usersLoadingMoreRef.current = false;
        setUsersLoadingMore(false);
        return;
      }

      if (reset) {
        usersListSeqRef.current += 1;
      }
      const seq = usersListSeqRef.current;
      const offset = reset ? 0 : usersOffsetRef.current;

      if (!reset) {
        if (!usersHasMoreRef.current || usersLoadingMoreRef.current) return;
        usersLoadingMoreRef.current = true;
        setUsersLoadingMore(true);
      } else {
        setLoading(true);
        setErrorMessage(null);
        usersOffsetRef.current = 0;
        usersHasMoreRef.current = true;
      }

      const { data, error } = await supabase.rpc('superadmin_list_users', {
        p_query: {
          search: debouncedSearch,
          role_filter: roleFilterFromTab(activeTab),
          limit: USER_LIST_PAGE_SIZE + 1,
          offset,
        },
      });

      if (seq !== usersListSeqRef.current) return;

      if (reset) {
        setLoading(false);
      } else {
        usersLoadingMoreRef.current = false;
        setUsersLoadingMore(false);
      }

      if (error) {
        setErrorMessage(error.message);
        if (reset) setRows([]);
        return;
      }

      const raw = (data ?? []) as SuperAdminUserRow[];
      const hasMore = raw.length > USER_LIST_PAGE_SIZE;
      const page = hasMore ? raw.slice(0, USER_LIST_PAGE_SIZE) : raw;

      usersHasMoreRef.current = hasMore;

      if (reset) {
        setRows(page);
        usersOffsetRef.current = page.length;
      } else {
        setRows((prev) => [...prev, ...page]);
        usersOffsetRef.current = offset + page.length;
      }
    },
    [authorized, primaryNav, debouncedSearch, activeTab],
  );

  const reloadUsers = useCallback(async () => {
    await loadUsers(true);
  }, [loadUsers]);

  const loadDashboardGrowth = useCallback(async () => {
    if (!authorized || primaryNav !== 'dashboard') {
      setGrowthLoading(false);
      return;
    }

    setGrowthLoading(true);
    setGrowthError(null);

    const { growth, error } = await fetchSuperadminDashboardGrowth(growthPeriod);

    setGrowthLoading(false);

    if (error) {
      setGrowthData(null);
      setGrowthError(error);
      return;
    }

    setGrowthData(growth);
  }, [authorized, primaryNav, growthPeriod]);

  const loadPendingCardOrdersCount = useCallback(async () => {
    if (!authorized) return;
    const { count, error } = await fetchPremiumCardOrdersPendingCount();
    if (!error) setPendingCardOrdersCount(count);
  }, [authorized]);

  const loadPendingWalletTopupsCount = useCallback(async () => {
    if (!authorized) return;
    const { count, error } = await fetchPendingTeacherWalletTopupsCount();
    if (!error) setPendingWalletTopupsCount(count);
  }, [authorized]);

  const loadPendingReviewCounts = useCallback(async () => {
    await Promise.all([loadPendingCardOrdersCount(), loadPendingWalletTopupsCount()]);
  }, [loadPendingCardOrdersCount, loadPendingWalletTopupsCount]);

  const loadDashboardOverview = useCallback(async () => {
    if (!authorized || primaryNav !== 'dashboard') {
      setDashboardStatsLoading(false);
      setGrowthLoading(false);
      return;
    }

    setDashboardStatsLoading(true);
    setGrowthLoading(true);
    setDashboardStatsError(null);
    setGrowthError(null);

    const [statsRes, growthRes, pendingCardRes, pendingWalletRes] = await Promise.all([
      fetchSuperadminDashboardStats(),
      fetchSuperadminDashboardGrowth(growthPeriod),
      fetchPremiumCardOrdersPendingCount(),
      fetchPendingTeacherWalletTopupsCount(),
    ]);

    setDashboardStatsLoading(false);
    setGrowthLoading(false);

    if (statsRes.error) {
      setDashboardStats(null);
      setDashboardStatsError(statsRes.error);
    } else {
      setDashboardStats(statsRes.stats);
    }

    if (growthRes.error) {
      setGrowthData(null);
      setGrowthError(growthRes.error);
    } else {
      setGrowthData(growthRes.growth);
    }

    if (!pendingCardRes.error) {
      setPendingCardOrdersCount(pendingCardRes.count);
    }
    if (!pendingWalletRes.error) {
      setPendingWalletTopupsCount(pendingWalletRes.count);
    }
  }, [authorized, primaryNav, growthPeriod]);

  const reloadDashboardOverview = useCallback(async () => {
    await loadDashboardOverview();
  }, [loadDashboardOverview]);

  useEffect(() => {
    if (!authorized || primaryNav !== 'dashboard') {
      setDashboardStatsLoading(false);
      setGrowthLoading(false);
      return;
    }
    void loadDashboardOverview();
  }, [authorized, primaryNav, growthPeriod, loadDashboardOverview]);

  useFocusEffect(
    useCallback(() => {
      if (!authorized) return;
      if (primaryNav === 'dashboard') {
        void reloadDashboardOverview();
      } else {
        void loadPendingReviewCounts();
      }
    }, [authorized, primaryNav, reloadDashboardOverview, loadPendingReviewCounts]),
  );

  const onRefreshDashboardStats = useCallback(async () => {
    setDashboardStatsRefreshing(true);
    await reloadDashboardOverview();
    setDashboardStatsRefreshing(false);
  }, [reloadDashboardOverview]);

  useEffect(() => {
    if (!authorized || primaryNav !== 'users') {
      setLoading(false);
      return;
    }
    void loadUsers(true);
  }, [authorized, primaryNav, debouncedSearch, activeTab, loadUsers]);

  const loadInstitutes = useCallback(
    async (reset: boolean) => {
      if (!authorized || primaryNav !== 'institutes') {
        setInstituteLoading(false);
        institutesLoadingMoreRef.current = false;
        setInstitutesLoadingMore(false);
        return;
      }

      if (reset) {
        institutesListSeqRef.current += 1;
      }
      const seq = institutesListSeqRef.current;
      const offset = reset ? 0 : institutesOffsetRef.current;

      if (!reset) {
        if (!institutesHasMoreRef.current || institutesLoadingMoreRef.current) return;
        institutesLoadingMoreRef.current = true;
        setInstitutesLoadingMore(true);
      } else {
        setInstituteLoading(true);
        setErrorMessage(null);
        institutesOffsetRef.current = 0;
        institutesHasMoreRef.current = true;
      }

      const { data, error } = await supabase.rpc('superadmin_list_institutes', {
        p_filters: {
          search: debouncedInstituteSearch,
          limit: INSTITUTE_LIST_PAGE_SIZE + 1,
          offset,
        },
      });

      if (seq !== institutesListSeqRef.current) return;

      if (reset) {
        setInstituteLoading(false);
      } else {
        institutesLoadingMoreRef.current = false;
        setInstitutesLoadingMore(false);
      }

      if (error) {
        setErrorMessage(error.message);
        if (reset) setInstitutesRows([]);
        return;
      }

      const raw = (data ?? []) as InstituteRow[];
      const hasMore = raw.length > INSTITUTE_LIST_PAGE_SIZE;
      const page = hasMore ? raw.slice(0, INSTITUTE_LIST_PAGE_SIZE) : raw;

      institutesHasMoreRef.current = hasMore;

      if (reset) {
        setInstitutesRows(dedupeInstituteRows(page));
        institutesOffsetRef.current = page.length;
        institutesCanLoadMoreRef.current = false;
        setTimeout(() => {
          institutesCanLoadMoreRef.current = true;
        }, 500);
      } else {
        setInstitutesRows((prev) => dedupeInstituteRows([...prev, ...page]));
        institutesOffsetRef.current = offset + page.length;
      }
    },
    [authorized, primaryNav, debouncedInstituteSearch],
  );

  const reloadInstitutes = useCallback(async () => {
    await loadInstitutes(true);
  }, [loadInstitutes]);

  useEffect(() => {
    if (!authorized || primaryNav !== 'institutes') {
      setInstituteLoading(false);
      return;
    }
    void loadInstitutes(true);
  }, [authorized, primaryNav, debouncedInstituteSearch, loadInstitutes]);

  useEffect(() => {
    if (primaryNav !== 'institutes') {
      setShowAddInstituteForm(false);
    }
  }, [primaryNav]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reloadUsers();
    setRefreshing(false);
  }, [reloadUsers]);

  const onRefreshInstitutes = useCallback(async () => {
    setInstituteRefreshing(true);
    await reloadInstitutes();
    setInstituteRefreshing(false);
  }, [reloadInstitutes]);

  const loadMoreUsers = useCallback(() => {
    void loadUsers(false);
  }, [loadUsers]);

  const openInstituteManage = useCallback((instituteId: string) => {
    router.push(appHref(hrefSuperAdminInstituteManage(instituteId)));
  }, []);

  const loadMoreInstitutes = useCallback(() => {
    if (!institutesCanLoadMoreRef.current) return;
    if (!institutesHasMoreRef.current || institutesLoadingMoreRef.current || instituteLoading) return;
    void loadInstitutes(false);
  }, [loadInstitutes, instituteLoading]);

  const submitInstitute = async () => {
    const validationKey = validateInstituteForm(instituteForm);
    if (validationKey) {
      setErrorMessage(t(`superAdmin.${validationKey}`));
      return;
    }

    setInstituteSubmitting(true);
    setErrorMessage(null);

    const { error } = await supabase.rpc('superadmin_create_institute', {
      p_payload: instituteFormToRpcPayload(instituteForm),
    });

    setInstituteSubmitting(false);

    if (error) {
      const mapped = mapInstituteRpcError(error.message);
      setErrorMessage(mapped ? t(`superAdmin.${mapped}`) : error.message);
      return;
    }

    setInstituteForm(EMPTY_INSTITUTE_FORM);
    setShowAddInstituteForm(false);
    await reloadInstitutes();
  };

  const deleteInstituteById = async (instituteId: string) => {
    setBusyInstituteId(instituteId);
    setErrorMessage(null);

    const { error } = await supabase.rpc('superadmin_delete_institute', {
      p_id: instituteId,
    });

    setBusyInstituteId(null);

    if (error) {
      const m = error.message.toLowerCase();
      setErrorMessage(
        m.includes('institute_not_found') ? t('superAdmin.instituteNotFound') : error.message,
      );
      return;
    }

    await reloadInstitutes();
  };

  const extendSubscription = async (userId: string) => {
    setBusyUserId(userId);
    setErrorMessage(null);

    const { error } = await supabase.rpc('superadmin_extend_subscription', {
      p_target_user_id: userId,
      p_days: 30,
    });

    setBusyUserId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await reloadUsers();
  };

  const setSubscriptionActive = async (userId: string, nextActive: boolean) => {
    setBusyUserId(userId);
    setErrorMessage(null);

    const { error } = await supabase.rpc('superadmin_set_subscription_active', {
      p_target_user_id: userId,
      p_is_active: nextActive,
    });

    setBusyUserId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await reloadUsers();
  };

  const canDeleteUser = useCallback(
    (item: SuperAdminUserRow) => {
      if (!currentUserId || item.user_id === currentUserId) return false;
      if (normalizeRole(item.role) === 'superadmin') return false;
      return true;
    },
    [currentUserId],
  );

  const mapDeleteApiError = (code?: string, detail?: string) => {
    switch (code) {
      case 'cannot_delete_self':
        return t('superAdmin.errors.deleteSelf');
      case 'cannot_delete_superadmin':
        return t('superAdmin.errors.deleteSuperadminProtected');
      case 'not_superadmin':
      case 'unauthorized':
        return t('superAdmin.errors.deleteForbidden');
      case 'network_error':
      case 'invoke_failed':
      case 'edge_http_error':
      case 'server_misconfigured':
        return t('superAdmin.errors.deleteUnreachable');
      case 'delete_failed':
        return detail ? `${t('superAdmin.errors.deleteFailed')} (${detail})` : t('superAdmin.errors.deleteFailed');
      case 'rpc_failed': {
        const m = (detail ?? '').toLowerCase();
        if (m.includes('cannot_delete_self')) return t('superAdmin.errors.deleteSelf');
        if (m.includes('cannot_delete_superadmin')) return t('superAdmin.errors.deleteSuperadminProtected');
        if (m.includes('permission denied') || m.includes('auth.users')) {
          return t('superAdmin.errors.deleteUnreachable');
        }
        return detail?.trim() || t('superAdmin.errors.deleteFailed');
      }
      default:
        return detail?.trim() || t('superAdmin.errors.deleteFailed');
    }
  };

  const deleteUserById = async (userId: string) => {
    setBusyUserId(userId);
    setErrorMessage(null);

    const result = await deleteSuperadminUser(userId);

    setBusyUserId(null);

    if (!result.ok) {
      setErrorMessage(mapDeleteApiError(result.error, result.detail));
      return;
    }

    await reloadUsers();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace(AppRoutes.login);
  };

  const formatExpiry = (iso: string | null) => {
    if (!iso) return t('superAdmin.noExpiry');
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const formatInstituteCreated = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  if (checkingGate || !authorized) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <SuperadminDevDashboardSwitcher />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={BRAND_BLUE} />
        </View>
      </SafeAreaView>
    );
  }

  const railWidth = winRailExpanded ? SIDEBAR_RAIL_EXPANDED_W : SIDEBAR_RAIL_COLLAPSED_W;

  const selectDashboardHome = () => {
    setPrimaryNav('dashboard');
    setSidebarOpen(false);
  };

  const selectUsersTab = () => {
    setPrimaryNav('users');
    setSidebarOpen(false);
  };

  const selectInstitutesTab = () => {
    setPrimaryNav('institutes');
    setSidebarOpen(false);
  };

  const selectGamesScheduleTab = () => {
    setPrimaryNav('gamesSchedule');
    setSidebarOpen(false);
  };

  const selectCardOrdersTab = () => {
    setPrimaryNav('cardOrders');
    setSidebarOpen(false);
  };

  const selectWalletTopupsTab = () => {
    setPrimaryNav('walletTopups');
    setSidebarOpen(false);
  };

  const selectCommunityChatTab = () => {
    setPrimaryNav('communityChat');
    setSidebarOpen(false);
  };

  const selectAppReleasesTab = () => {
    setPrimaryNav('appReleases');
    setSidebarOpen(false);
  };

  const pendingCardOrdersBadgeLabel =
    pendingCardOrdersCount > 99 ? '99+' : String(pendingCardOrdersCount);
  const pendingWalletTopupsBadgeLabel =
    pendingWalletTopupsCount > 99 ? '99+' : String(pendingWalletTopupsCount);

  const sidebarNavScrollContent = (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('superAdmin.sidebarDashboard')}
        accessibilityState={{ selected: primaryNav === 'dashboard' }}
        onPress={selectDashboardHome}
        style={({ pressed }) => [
          styles.sidebarPrimaryRow,
          primaryNav === 'dashboard' && styles.sidebarPrimaryRowSelected,
          pressed && primaryNav !== 'dashboard' && styles.sidebarPrimaryRowPressed,
          Platform.OS === 'web' ? styles.sidebarNavRowWeb : null,
        ]}>
        <Ionicons
          name="home-outline"
          size={18}
          color={primaryNav === 'dashboard' ? '#FFFFFF' : BRAND_BLUE_DARK}
        />
        <Text
          style={[
            styles.sidebarPrimaryLabel,
            primaryNav === 'dashboard' && styles.sidebarPrimaryLabelSelected,
          ]}>
          {t('superAdmin.sidebarDashboard')}
        </Text>
        <View style={styles.sidebarRowTrailingSpacer} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('superAdmin.sidebarUsers')}
        accessibilityState={{ selected: primaryNav === 'users' }}
        onPress={selectUsersTab}
        style={({ pressed }) => [
          styles.sidebarPrimaryRow,
          primaryNav === 'users' && styles.sidebarPrimaryRowSelected,
          pressed && primaryNav !== 'users' && styles.sidebarPrimaryRowPressed,
          Platform.OS === 'web' ? styles.sidebarNavRowWeb : null,
        ]}>
        <Ionicons
          name="reader-outline"
          size={18}
          color={primaryNav === 'users' ? '#FFFFFF' : BRAND_BLUE_DARK}
        />
        <Text
          style={[
            styles.sidebarPrimaryLabel,
            primaryNav === 'users' && styles.sidebarPrimaryLabelSelected,
          ]}>
          {t('superAdmin.sidebarUsers')}
        </Text>
        <View style={styles.sidebarRowTrailingSpacer} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('superAdmin.sidebarInstitutes')}
        accessibilityState={{ selected: primaryNav === 'institutes' }}
        onPress={selectInstitutesTab}
        style={({ pressed }) => [
          styles.sidebarPrimaryRow,
          primaryNav === 'institutes' && styles.sidebarPrimaryRowSelected,
          pressed && primaryNav !== 'institutes' && styles.sidebarPrimaryRowPressed,
          Platform.OS === 'web' ? styles.sidebarNavRowWeb : null,
        ]}>
        <Ionicons
          name="business-outline"
          size={18}
          color={primaryNav === 'institutes' ? '#FFFFFF' : BRAND_BLUE_DARK}
        />
        <Text
          style={[
            styles.sidebarPrimaryLabel,
            primaryNav === 'institutes' && styles.sidebarPrimaryLabelSelected,
          ]}>
          {t('superAdmin.sidebarInstitutes')}
        </Text>
        <View style={styles.sidebarRowTrailingSpacer} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('superAdmin.sidebarGamesSchedule')}
        accessibilityState={{ selected: primaryNav === 'gamesSchedule' }}
        onPress={selectGamesScheduleTab}
        style={({ pressed }) => [
          styles.sidebarPrimaryRow,
          primaryNav === 'gamesSchedule' && styles.sidebarPrimaryRowSelected,
          pressed && primaryNav !== 'gamesSchedule' && styles.sidebarPrimaryRowPressed,
          Platform.OS === 'web' ? styles.sidebarNavRowWeb : null,
        ]}>
        <Ionicons
          name="calendar-outline"
          size={18}
          color={primaryNav === 'gamesSchedule' ? '#FFFFFF' : BRAND_BLUE_DARK}
        />
        <Text
          style={[
            styles.sidebarPrimaryLabel,
            primaryNav === 'gamesSchedule' && styles.sidebarPrimaryLabelSelected,
          ]}>
          {t('superAdmin.sidebarGamesSchedule')}
        </Text>
        <View style={styles.sidebarRowTrailingSpacer} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('superAdmin.sidebarCardOrders')}
        accessibilityState={{ selected: primaryNav === 'cardOrders' }}
        onPress={selectCardOrdersTab}
        style={({ pressed }) => [
          styles.sidebarPrimaryRow,
          primaryNav === 'cardOrders' && styles.sidebarPrimaryRowSelected,
          pressed && primaryNav !== 'cardOrders' && styles.sidebarPrimaryRowPressed,
          Platform.OS === 'web' ? styles.sidebarNavRowWeb : null,
        ]}>
        <Ionicons
          name="card-outline"
          size={18}
          color={primaryNav === 'cardOrders' ? '#FFFFFF' : BRAND_BLUE_DARK}
        />
        <Text
          style={[
            styles.sidebarPrimaryLabel,
            primaryNav === 'cardOrders' && styles.sidebarPrimaryLabelSelected,
          ]}>
          {t('superAdmin.sidebarCardOrders')}
        </Text>
        {pendingCardOrdersCount > 0 ? (
          <View style={styles.sidebarNavBadge}>
            <Text style={styles.sidebarNavBadgeLabel}>{pendingCardOrdersBadgeLabel}</Text>
          </View>
        ) : (
          <View style={styles.sidebarRowTrailingSpacer} />
        )}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('superAdmin.sidebarWalletTopups')}
        accessibilityState={{ selected: primaryNav === 'walletTopups' }}
        onPress={selectWalletTopupsTab}
        style={({ pressed }) => [
          styles.sidebarPrimaryRow,
          primaryNav === 'walletTopups' && styles.sidebarPrimaryRowSelected,
          pressed && primaryNav !== 'walletTopups' && styles.sidebarPrimaryRowPressed,
          Platform.OS === 'web' ? styles.sidebarNavRowWeb : null,
        ]}>
        <Ionicons
          name="wallet-outline"
          size={18}
          color={primaryNav === 'walletTopups' ? '#FFFFFF' : BRAND_BLUE_DARK}
        />
        <Text
          style={[
            styles.sidebarPrimaryLabel,
            primaryNav === 'walletTopups' && styles.sidebarPrimaryLabelSelected,
          ]}>
          {t('superAdmin.sidebarWalletTopups')}
        </Text>
        {pendingWalletTopupsCount > 0 ? (
          <View style={styles.sidebarNavBadge}>
            <Text style={styles.sidebarNavBadgeLabel}>{pendingWalletTopupsBadgeLabel}</Text>
          </View>
        ) : (
          <View style={styles.sidebarRowTrailingSpacer} />
        )}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('superAdmin.sidebarCommunityChat')}
        accessibilityState={{ selected: primaryNav === 'communityChat' }}
        onPress={selectCommunityChatTab}
        style={({ pressed }) => [
          styles.sidebarPrimaryRow,
          primaryNav === 'communityChat' && styles.sidebarPrimaryRowSelected,
          pressed && primaryNav !== 'communityChat' && styles.sidebarPrimaryRowPressed,
          Platform.OS === 'web' ? styles.sidebarNavRowWeb : null,
        ]}>
        <Ionicons
          name="chatbubbles-outline"
          size={18}
          color={primaryNav === 'communityChat' ? '#FFFFFF' : BRAND_BLUE_DARK}
        />
        <Text
          style={[
            styles.sidebarPrimaryLabel,
            primaryNav === 'communityChat' && styles.sidebarPrimaryLabelSelected,
          ]}>
          {t('superAdmin.sidebarCommunityChat')}
        </Text>
        <View style={styles.sidebarRowTrailingSpacer} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('superAdmin.sidebarAppReleases')}
        accessibilityState={{ selected: primaryNav === 'appReleases' }}
        onPress={selectAppReleasesTab}
        style={({ pressed }) => [
          styles.sidebarPrimaryRow,
          primaryNav === 'appReleases' && styles.sidebarPrimaryRowSelected,
          pressed && primaryNav !== 'appReleases' && styles.sidebarPrimaryRowPressed,
          Platform.OS === 'web' ? styles.sidebarNavRowWeb : null,
        ]}>
        <Ionicons
          name="phone-portrait-outline"
          size={18}
          color={primaryNav === 'appReleases' ? '#FFFFFF' : BRAND_BLUE_DARK}
        />
        <Text
          style={[
            styles.sidebarPrimaryLabel,
            primaryNav === 'appReleases' && styles.sidebarPrimaryLabelSelected,
          ]}>
          {t('superAdmin.sidebarAppReleases')}
        </Text>
        <View style={styles.sidebarRowTrailingSpacer} />
      </Pressable>
    </>
  );

  const dashboardMain = (
    <View style={styles.mainColumnWrap}>
      <View style={[styles.header, desktopShell && styles.headerWindowsShell]}>
        {!desktopShell ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('superAdmin.openMenu')}
            onPress={() => setSidebarOpen(true)}
            style={({ pressed }) => [
              styles.menuBtn,
              pressed && styles.menuBtnPressed,
              Platform.OS === 'web' ? styles.menuBtnWeb : null,
            ]}>
            <Ionicons name="menu-outline" size={26} color={BRAND_BLUE_DARK} />
          </Pressable>
        ) : null}
        <Text style={styles.title}>{t('superAdmin.title')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('superAdmin.signOut')}
          onPress={() => void handleSignOut()}
          style={({ pressed }) => [styles.signOutBtn, pressed && styles.signOutBtnPressed]}>
          <Ionicons name="log-out-outline" size={22} color={BRAND_BLUE_DARK} />
        </Pressable>
      </View>

      {primaryNav === 'dashboard' ? (
        <ScrollView
          style={styles.dashboardScroll}
          contentContainerStyle={[
            styles.dashboardScrollContent,
            desktopShell && styles.dashboardScrollContentFlex,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={dashboardStatsRefreshing}
              onRefresh={() => void onRefreshDashboardStats()}
              tintColor={BRAND_BLUE}
            />
          }>
          <Text style={styles.dashboardOverviewSubtitle}>{t('superAdmin.dashboardOverviewSubtitle')}</Text>

          <SuperAdminCardOrdersDashboardTile
            newOrdersCount={pendingCardOrdersCount}
            onPress={selectCardOrdersTab}
            t={t}
          />

          <SuperAdminTeacherWalletTopupsDashboardTile
            pendingCount={pendingWalletTopupsCount}
            onPress={selectWalletTopupsTab}
            t={t}
          />

          {dashboardStatsLoading && !dashboardStats ? (
            <View style={styles.dashboardStatsLoadingWrap}>
              <ActivityIndicator size="large" color={BRAND_BLUE} />
              <Text style={styles.dashboardStatsLoadingText}>{t('superAdmin.dashboardStatsLoading')}</Text>
            </View>
          ) : dashboardStatsError && !dashboardStats ? (
            <View style={styles.dashboardStatsErrorWrap}>
              <Text style={styles.dashboardStatsErrorText}>{t('superAdmin.dashboardStatsError')}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('superAdmin.dashboardStatsRetry')}
                onPress={() => void reloadDashboardOverview()}
                style={({ pressed }) => [
                  styles.dashboardStatsRetryBtn,
                  pressed && styles.dashboardStatsRetryBtnPressed,
                ]}>
                <Text style={styles.dashboardStatsRetryLabel}>{t('superAdmin.dashboardStatsRetry')}</Text>
              </Pressable>
            </View>
          ) : (
            <View
              style={[
                styles.dashboardStatsGrid,
                dashboardStatsGridWide && styles.dashboardStatsGridWide,
              ]}>
              {DASHBOARD_STAT_TILES.map((tile) => {
                const value = dashboardStats?.[tile.id] ?? 0;
                return (
                  <View
                    key={tile.id}
                    style={[
                      styles.dashboardStatCard,
                      dashboardStatsGridWide && styles.dashboardStatCardWide,
                      { backgroundColor: tile.bg, borderColor: SUBTLE_BORDER },
                    ]}>
                    <View style={[styles.dashboardStatIconWrap, { backgroundColor: PAGE_BG }]}>
                      <Ionicons name={tile.icon} size={22} color={tile.accent} />
                    </View>
                    <Text style={[styles.dashboardStatValue, { color: tile.accent }]}>
                      {formatDashboardCount(value)}
                    </Text>
                    <Text style={styles.dashboardStatLabel}>{t(tile.labelKey)}</Text>
                  </View>
                );
              })}
            </View>
          )}

          <SuperAdminDashboardGrowthChart
            period={growthPeriod}
            onPeriodChange={setGrowthPeriod}
            growth={growthData}
            loading={growthLoading}
            error={growthError}
            onRetry={() => void loadDashboardGrowth()}
            formatCount={formatDashboardCount}
          />
        </ScrollView>
      ) : primaryNav === 'institutes' ? (
        <>
          <Text style={styles.subtitle}>{t('superAdmin.institutesSubtitle')}</Text>

          {!showAddInstituteForm ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('superAdmin.addInstitute')}
              onPress={() => setShowAddInstituteForm(true)}
              style={({ pressed }) => [
                styles.addInstituteTriggerBtn,
                pressed && styles.addInstituteTriggerBtnPressed,
                Platform.OS === 'web' ? styles.addInstituteTriggerBtnWeb : null,
              ]}>
              <Ionicons name="add-circle-outline" size={22} color={BRAND_BLUE} />
              <Text style={styles.addInstituteTriggerLabel}>{t('superAdmin.addInstitute')}</Text>
            </Pressable>
          ) : null}

          {showAddInstituteForm ? (
            <View style={styles.instituteFormCard}>
              <View style={styles.instituteFormHeader}>
                <Text style={styles.instituteFormTitle}>{t('superAdmin.addInstitute')}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('superAdmin.cancelAddInstitute')}
                  onPress={() => setShowAddInstituteForm(false)}
                  style={({ pressed }) => [
                    styles.instituteFormCancelBtn,
                    pressed && styles.instituteFormCancelBtnPressed,
                  ]}>
                  <Text style={styles.instituteFormCancelLabel}>{t('superAdmin.cancelAddInstitute')}</Text>
                </Pressable>
              </View>
              <InstituteDetailsFormFields
                values={instituteForm}
                onChange={(patch) => setInstituteForm((prev) => ({ ...prev, ...patch }))}
                editable={!instituteSubmitting}
                fieldLabelStyle={styles.instituteFieldLabel}
                inputStyle={styles.instituteInput}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('superAdmin.addInstitute')}
                disabled={instituteSubmitting}
                onPress={() => void submitInstitute()}
                style={({ pressed }) => [
                  styles.instituteSubmitBtn,
                  pressed && styles.instituteSubmitBtnPressed,
                  instituteSubmitting && styles.btnDisabled,
                ]}>
                {instituteSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.instituteSubmitBtnText}>{t('superAdmin.addInstitute')}</Text>
                )}
              </Pressable>
            </View>
          ) : null}

          <DebouncedSearchField
            placeholder={t('superAdmin.institutesSearchPlaceholder')}
            style={styles.searchInput}
            onDebouncedChange={setDebouncedInstituteSearchStable}
          />

          {errorMessage ? <Text style={styles.errorBanner}>{errorMessage}</Text> : null}

          {instituteLoading && institutesRows.length === 0 ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={BRAND_BLUE} />
            </View>
          ) : (
            <FlatList
              style={desktopShell ? styles.dashboardListFlex : undefined}
              data={institutesRows}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  refreshing={instituteRefreshing}
                  onRefresh={() => void onRefreshInstitutes()}
                />
              }
              contentContainerStyle={[
                styles.listContent,
                institutesRows.length > 0 && styles.instituteListContent,
              ]}
              onEndReached={loadMoreInstitutes}
              onEndReachedThreshold={0.2}
              ListFooterComponent={
                institutesLoadingMore ? (
                  <View style={styles.listFooterSpinner}>
                    <ActivityIndicator color={BRAND_BLUE} />
                    <Text style={styles.listFooterSpinnerLabel}>{t('superAdmin.loadingMore')}</Text>
                  </View>
                ) : null
              }
              initialNumToRender={12}
              maxToRenderPerBatch={16}
              windowSize={9}
              removeClippedSubviews={Platform.OS !== 'web'}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  {instituteLoading
                    ? ''
                    : debouncedInstituteSearch
                      ? t('superAdmin.institutesSearchEmpty')
                      : t('superAdmin.institutesEmpty')}
                </Text>
              }
              renderItem={({ item, index }) => {
                const busy = busyInstituteId === item.id;
                const isLast = index === institutesRows.length - 1;
                return (
                  <View
                    style={[
                      styles.instituteListRow,
                      isLast && styles.instituteListRowLast,
                      desktopShell && styles.instituteListRowDesktop,
                    ]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('superAdmin.manageInstitute')}
                      disabled={busy}
                      onPress={() => openInstituteManage(item.id)}
                      style={({ pressed }) => [
                        styles.instituteListMain,
                        pressed && styles.instituteListMainPressed,
                        busy && styles.btnDisabled,
                        Platform.OS === 'web' ? styles.instituteListMainWeb : null,
                      ]}>
                      <Text style={styles.instituteListName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.instituteListMeta} numberOfLines={2}>
                        {instituteListMetaLineFromRow(item)}
                      </Text>
                      <Text style={styles.instituteListDate}>
                        {t('superAdmin.instituteCreatedLabel')}: {formatInstituteCreated(item.created_at)}
                      </Text>
                    </Pressable>
                    <View style={styles.instituteCardActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('superAdmin.manageInstitute')}
                        disabled={busy}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        onPress={() => openInstituteManage(item.id)}
                        style={({ pressed }) => [
                          styles.instituteIconBtn,
                          pressed && styles.instituteIconBtnPressed,
                          busy && styles.btnDisabled,
                          Platform.OS === 'web' ? styles.instituteIconBtnWeb : null,
                        ]}>
                        <Ionicons name="settings-outline" size={20} color={BRAND_BLUE_DARK} />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('superAdmin.deleteInstitute')}
                        disabled={busy}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        onPress={() => setPendingInstituteDelete(item)}
                        style={({ pressed }) => [
                          styles.instituteIconBtn,
                          pressed && styles.instituteIconBtnPressed,
                          busy && styles.btnDisabled,
                          Platform.OS === 'web' ? styles.instituteIconBtnWeb : null,
                        ]}>
                        <Ionicons name="trash-outline" size={20} color="#B91C1C" />
                      </Pressable>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </>
      ) : primaryNav === 'gamesSchedule' ? (
        <SuperAdminGamesScheduleSection desktopShell={desktopShell} />
      ) : primaryNav === 'cardOrders' ? (
        <SuperAdminCardOrdersSection
          desktopShell={desktopShell}
          onOrdersChanged={() => void loadPendingReviewCounts()}
        />
      ) : primaryNav === 'walletTopups' ? (
        <SuperAdminTeacherWalletTopupsSection
          desktopShell={desktopShell}
          onRequestsChanged={() => void loadPendingReviewCounts()}
        />
      ) : primaryNav === 'communityChat' ? (
        <SuperAdminCommunityChatSection desktopShell={desktopShell} />
      ) : primaryNav === 'appReleases' ? (
        <SuperAdminAppReleaseSection desktopShell={desktopShell} />
      ) : (
        <>
          <Text style={styles.subtitle}>{t('superAdmin.subtitle')}</Text>

          <View style={styles.tabsRow}>
            {(
              [
                ['teachers', 'tabTeachers'],
                ['admins', 'tabAdmins'],
                ['others', 'tabOthers'],
              ] as const
            ).map(([tab, labelKey]) => {
              const selected = activeTab === tab;
              return (
                <Pressable
                  key={tab}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setActiveTab(tab)}
                  style={({ pressed }) => [
                    styles.tabChip,
                    selected && styles.tabChipActive,
                    pressed && !selected && styles.tabChipPressed,
                  ]}>
                  <Text style={[styles.tabChipText, selected && styles.tabChipTextActive]}>
                    {t(`superAdmin.${labelKey}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <DebouncedSearchField
            placeholder={t('superAdmin.searchPlaceholder')}
            style={styles.searchInput}
            onDebouncedChange={setDebouncedSearchStable}
          />

          {errorMessage ? <Text style={styles.errorBanner}>{errorMessage}</Text> : null}

          {loading && rows.length === 0 ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={BRAND_BLUE} />
            </View>
          ) : (
            <FlatList
              style={desktopShell ? styles.dashboardListFlex : undefined}
              data={rows}
              keyExtractor={(item) => item.user_id}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
              }
              contentContainerStyle={styles.listContent}
              onEndReached={loadMoreUsers}
              onEndReachedThreshold={0.35}
              ListFooterComponent={
                usersLoadingMore ? (
                  <View style={styles.listFooterSpinner}>
                    <ActivityIndicator color={BRAND_BLUE} />
                    <Text style={styles.listFooterSpinnerLabel}>{t('superAdmin.loadingMore')}</Text>
                  </View>
                ) : null
              }
              initialNumToRender={12}
              maxToRenderPerBatch={16}
              windowSize={9}
              removeClippedSubviews={Platform.OS !== 'web'}
              ListEmptyComponent={
                <Text style={styles.emptyText}>{loading ? '' : t('superAdmin.empty')}</Text>
              }
              renderItem={({ item }) => {
                const busy = busyUserId === item.user_id;
                const showDelete = canDeleteUser(item);
                return (
                  <View style={styles.card}>
                    <View style={styles.cardHeaderRow}>
                      <View style={styles.cardTitleBlock}>
                        <Text style={styles.cardEmail}>{item.email}</Text>
                      </View>
                      {showDelete ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t('superAdmin.deleteUser')}
                          disabled={busy}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          onPress={() => setPendingDelete(item)}
                          style={({ pressed }) => [
                            styles.deleteBtn,
                            pressed && styles.deleteBtnPressed,
                            busy && styles.btnDisabled,
                            Platform.OS === 'web' ? styles.deleteBtnWeb : null,
                          ]}>
                          <Ionicons name="trash-outline" size={22} color="#B91C1C" />
                        </Pressable>
                      ) : null}
                    </View>
                    {item.full_name ? <Text style={styles.cardName}>{item.full_name}</Text> : null}
                    <Text style={styles.cardMeta}>
                      {t('superAdmin.roleLabel')}: {item.role || '—'}
                    </Text>
                    <Text style={styles.cardMeta}>
                      {t('superAdmin.expiryLabel')}: {formatExpiry(item.expiry_date)}
                    </Text>

                    <View style={styles.rowActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('superAdmin.extend30')}
                        disabled={busy}
                        onPress={() => void extendSubscription(item.user_id)}
                        style={({ pressed }) => [
                          styles.extendBtn,
                          pressed && styles.extendBtnPressed,
                          busy && styles.btnDisabled,
                        ]}>
                        {busy ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <Text style={styles.extendBtnText}>{t('superAdmin.extend30')}</Text>
                        )}
                      </Pressable>

                      <View style={styles.toggleWrap}>
                        <Text style={styles.toggleLabel}>{t('superAdmin.activeLabel')}</Text>
                        <Switch
                          accessibilityLabel={t('superAdmin.activeLabel')}
                          value={item.is_active}
                          disabled={busy}
                          onValueChange={(v) => void setSubscriptionActive(item.user_id, v)}
                        />
                      </View>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </>
      )}
    </View>
  );

  const windowsRail = (
    <View style={[styles.winRail, { width: railWidth }]}>
      <View style={[styles.winRailHeader, !winRailExpanded && styles.winRailHeaderCollapsed]}>
        {winRailExpanded ? (
          <>
            <Text style={styles.sidebarTitle}>{t('superAdmin.sidebarTitle')}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('superAdmin.collapseSidebar')}
              onPress={() => setWinRailExpanded(false)}
              style={({ pressed }) => [styles.sidebarCloseBtn, pressed && styles.sidebarCloseBtnPressed]}>
              <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('superAdmin.expandSidebar')}
            onPress={() => setWinRailExpanded(true)}
            style={({ pressed }) => [styles.winRailExpandBtn, pressed && styles.winRailExpandBtnPressed]}>
            <Ionicons name="chevron-forward" size={22} color={BRAND_BLUE_DARK} />
          </Pressable>
        )}
      </View>
      <ScrollView style={styles.winRailScroll} contentContainerStyle={styles.winRailScrollContent}>
        {!winRailExpanded ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('superAdmin.sidebarDashboard')}
              accessibilityState={{ selected: primaryNav === 'dashboard' }}
              onPress={selectDashboardHome}
              style={({ pressed }) => [
                styles.winRailIconBtn,
                primaryNav === 'dashboard' && styles.winRailIconBtnSelected,
                pressed && primaryNav !== 'dashboard' && styles.winRailIconBtnPressed,
                Platform.OS === 'web' ? styles.winRailIconBtnWeb : null,
              ]}>
              <Ionicons
                name="home-outline"
                size={22}
                color={primaryNav === 'dashboard' ? '#FFFFFF' : BRAND_BLUE_DARK}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('superAdmin.sidebarUsers')}
              accessibilityState={{ selected: primaryNav === 'users' }}
              onPress={selectUsersTab}
              style={({ pressed }) => [
                styles.winRailIconBtn,
                primaryNav === 'users' && styles.winRailIconBtnSelected,
                pressed && primaryNav !== 'users' && styles.winRailIconBtnPressed,
                Platform.OS === 'web' ? styles.winRailIconBtnWeb : null,
              ]}>
              <Ionicons
                name="reader-outline"
                size={22}
                color={primaryNav === 'users' ? '#FFFFFF' : BRAND_BLUE_DARK}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('superAdmin.sidebarInstitutes')}
              accessibilityState={{ selected: primaryNav === 'institutes' }}
              onPress={selectInstitutesTab}
              style={({ pressed }) => [
                styles.winRailIconBtn,
                primaryNav === 'institutes' && styles.winRailIconBtnSelected,
                pressed && primaryNav !== 'institutes' && styles.winRailIconBtnPressed,
                Platform.OS === 'web' ? styles.winRailIconBtnWeb : null,
              ]}>
              <Ionicons
                name="business-outline"
                size={22}
                color={primaryNav === 'institutes' ? '#FFFFFF' : BRAND_BLUE_DARK}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('superAdmin.sidebarGamesSchedule')}
              accessibilityState={{ selected: primaryNav === 'gamesSchedule' }}
              onPress={selectGamesScheduleTab}
              style={({ pressed }) => [
                styles.winRailIconBtn,
                primaryNav === 'gamesSchedule' && styles.winRailIconBtnSelected,
                pressed && primaryNav !== 'gamesSchedule' && styles.winRailIconBtnPressed,
                Platform.OS === 'web' ? styles.winRailIconBtnWeb : null,
              ]}>
              <Ionicons
                name="calendar-outline"
                size={22}
                color={primaryNav === 'gamesSchedule' ? '#FFFFFF' : BRAND_BLUE_DARK}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('superAdmin.sidebarCardOrders')}
              accessibilityState={{ selected: primaryNav === 'cardOrders' }}
              onPress={selectCardOrdersTab}
              style={({ pressed }) => [
                styles.winRailIconBtn,
                primaryNav === 'cardOrders' && styles.winRailIconBtnSelected,
                pressed && primaryNav !== 'cardOrders' && styles.winRailIconBtnPressed,
                Platform.OS === 'web' ? styles.winRailIconBtnWeb : null,
              ]}>
              <Ionicons
                name="card-outline"
                size={22}
                color={primaryNav === 'cardOrders' ? '#FFFFFF' : BRAND_BLUE_DARK}
              />
              {pendingCardOrdersCount > 0 ? (
                <View style={styles.winRailBadge}>
                  <Text style={styles.winRailBadgeLabel}>{pendingCardOrdersBadgeLabel}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('superAdmin.sidebarWalletTopups')}
              accessibilityState={{ selected: primaryNav === 'walletTopups' }}
              onPress={selectWalletTopupsTab}
              style={({ pressed }) => [
                styles.winRailIconBtn,
                primaryNav === 'walletTopups' && styles.winRailIconBtnSelected,
                pressed && primaryNav !== 'walletTopups' && styles.winRailIconBtnPressed,
                Platform.OS === 'web' ? styles.winRailIconBtnWeb : null,
              ]}>
              <Ionicons
                name="wallet-outline"
                size={22}
                color={primaryNav === 'walletTopups' ? '#FFFFFF' : BRAND_BLUE_DARK}
              />
              {pendingWalletTopupsCount > 0 ? (
                <View style={styles.winRailBadge}>
                  <Text style={styles.winRailBadgeLabel}>{pendingWalletTopupsBadgeLabel}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('superAdmin.sidebarCommunityChat')}
              accessibilityState={{ selected: primaryNav === 'communityChat' }}
              onPress={selectCommunityChatTab}
              style={({ pressed }) => [
                styles.winRailIconBtn,
                primaryNav === 'communityChat' && styles.winRailIconBtnSelected,
                pressed && primaryNav !== 'communityChat' && styles.winRailIconBtnPressed,
                Platform.OS === 'web' ? styles.winRailIconBtnWeb : null,
              ]}>
              <Ionicons
                name="chatbubbles-outline"
                size={22}
                color={primaryNav === 'communityChat' ? '#FFFFFF' : BRAND_BLUE_DARK}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('superAdmin.sidebarAppReleases')}
              accessibilityState={{ selected: primaryNav === 'appReleases' }}
              onPress={selectAppReleasesTab}
              style={({ pressed }) => [
                styles.winRailIconBtn,
                primaryNav === 'appReleases' && styles.winRailIconBtnSelected,
                pressed && primaryNav !== 'appReleases' && styles.winRailIconBtnPressed,
                Platform.OS === 'web' ? styles.winRailIconBtnWeb : null,
              ]}>
              <Ionicons
                name="phone-portrait-outline"
                size={22}
                color={primaryNav === 'appReleases' ? '#FFFFFF' : BRAND_BLUE_DARK}
              />
            </Pressable>
          </>
        ) : (
          sidebarNavScrollContent
        )}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {desktopShell ? (
        <View style={styles.winShellRow}>
          {windowsRail}
          <View style={styles.winMainColumn}>{dashboardMain}</View>
        </View>
      ) : (
        dashboardMain
      )}

      <Modal
        visible={pendingDelete !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingDelete(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('superAdmin.cancelDelete')}
            style={styles.modalDismissLayer}
            onPress={() => setPendingDelete(null)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('superAdmin.deleteConfirmTitle')}</Text>
            <Text style={styles.modalBody}>
              {pendingDelete
                ? t('superAdmin.deleteConfirmMessage', { email: pendingDelete.email })
                : ''}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPendingDelete(null)}
                style={({ pressed }) => [styles.modalBtnSecondary, pressed && styles.modalBtnPressed]}>
                <Text style={styles.modalBtnSecondaryText}>{t('superAdmin.cancelDelete')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const row = pendingDelete;
                  setPendingDelete(null);
                  if (row) void deleteUserById(row.user_id);
                }}
                style={({ pressed }) => [styles.modalBtnDanger, pressed && styles.modalBtnDangerPressed]}>
                <Text style={styles.modalBtnDangerText}>{t('superAdmin.confirmDelete')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={pendingInstituteDelete !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingInstituteDelete(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('superAdmin.cancelDelete')}
            style={styles.modalDismissLayer}
            onPress={() => setPendingInstituteDelete(null)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('superAdmin.instituteDeleteConfirmTitle')}</Text>
            <Text style={styles.modalBody}>
              {pendingInstituteDelete
                ? t('superAdmin.instituteDeleteConfirmMessage', { name: pendingInstituteDelete.name })
                : ''}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPendingInstituteDelete(null)}
                style={({ pressed }) => [styles.modalBtnSecondary, pressed && styles.modalBtnPressed]}>
                <Text style={styles.modalBtnSecondaryText}>{t('superAdmin.cancelDelete')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const row = pendingInstituteDelete;
                  setPendingInstituteDelete(null);
                  if (row) void deleteInstituteById(row.id);
                }}
                style={({ pressed }) => [styles.modalBtnDanger, pressed && styles.modalBtnDangerPressed]}>
                <Text style={styles.modalBtnDangerText}>{t('superAdmin.confirmDelete')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {!desktopShell ? (
        <Modal
          visible={sidebarOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setSidebarOpen(false)}>
          <View style={styles.sidebarOverlay}>
            <SafeAreaView style={styles.sidebarPanel} edges={['top', 'left', 'bottom']}>
              <View style={styles.sidebarHeader}>
                <Text style={styles.sidebarTitle}>{t('superAdmin.sidebarTitle')}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('superAdmin.closeMenu')}
                  onPress={() => setSidebarOpen(false)}
                  style={({ pressed }) => [styles.sidebarCloseBtn, pressed && styles.sidebarCloseBtnPressed]}>
                  <Ionicons name="close" size={26} color={BRAND_BLUE_DARK} />
                </Pressable>
              </View>
              <ScrollView
                style={styles.sidebarModalScroll}
                contentContainerStyle={styles.sidebarModalScrollContent}>
                {sidebarNavScrollContent}
              </ScrollView>
            </SafeAreaView>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('superAdmin.closeMenu')}
              style={styles.sidebarBackdrop}
              onPress={() => setSidebarOpen(false)}
            />
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  winShellRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 0,
    minWidth: 0,
  },
  winMainColumn: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#F1F5F9',
  },
  winRail: {
    flexDirection: 'column',
    alignSelf: 'stretch',
    flexShrink: 0,
    backgroundColor: PAGE_BG,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: SUBTLE_BORDER,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '2px 0 10px rgba(15, 23, 42, 0.1)' } as const)
      : {
          shadowColor: '#0f172a',
          shadowOffset: { width: 2, height: 0 },
          shadowOpacity: 0.1,
          shadowRadius: 10,
          elevation: 6,
        }),
  },
  winRailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SUBTLE_BORDER,
    minHeight: 44,
  },
  winRailHeaderCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  winRailExpandBtn: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  winRailExpandBtnPressed: {
    opacity: 0.65,
  },
  winRailScroll: {
    flex: 1,
  },
  winRailScrollContent: {
    paddingHorizontal: 10,
    paddingBottom: 12,
    paddingTop: 4,
    flexGrow: 1,
  },
  winRailIconBtn: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginBottom: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#F8FAFC',
  },
  winRailIconBtnSelected: {
    backgroundColor: BRAND_BLUE,
    borderColor: BRAND_BLUE,
  },
  winRailIconBtnPressed: {
    opacity: 0.88,
  },
  winRailIconBtnWeb: {
    cursor: 'pointer',
  },
  winRailBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  winRailBadgeLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerWindowsShell: {
    paddingLeft: 16,
  },
  dashboardListFlex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 4,
  },
  menuBtn: {
    padding: 8,
    marginRight: 4,
  },
  menuBtnPressed: {
    opacity: 0.65,
  },
  menuBtnWeb: {
    cursor: 'pointer',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    flex: 1,
    paddingHorizontal: 4,
  },
  signOutBtn: {
    padding: 8,
  },
  signOutBtnPressed: {
    opacity: 0.65,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_MUTED,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  tabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 12,
  },
  tabChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#F8FAFC',
  },
  tabChipActive: {
    backgroundColor: BRAND_BLUE,
    borderColor: BRAND_BLUE,
  },
  tabChipPressed: {
    opacity: 0.85,
  },
  tabChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
  tabChipTextActive: {
    color: '#FFFFFF',
  },
  searchInput: {
    marginHorizontal: 20,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 16,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  errorBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    color: '#B91C1C',
    fontWeight: '600',
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    flexGrow: 1,
  },
  listFooterSpinner: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  listFooterSpinnerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_MUTED,
  },
  emptyText: {
    textAlign: 'center',
    color: TEXT_MUTED,
    marginTop: 24,
    fontSize: 15,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#F8FAFC',
    padding: 16,
    marginBottom: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  deleteBtn: {
    padding: 4,
    marginTop: -2,
  },
  deleteBtnPressed: {
    opacity: 0.65,
  },
  cardEmail: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  cardName: {
    fontSize: 15,
    color: '#334155',
    marginTop: 4,
  },
  cardMeta: {
    fontSize: 13,
    color: TEXT_MUTED,
    marginTop: 6,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 12,
    flexWrap: 'wrap',
  },
  extendBtn: {
    backgroundColor: BRAND_BLUE,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minWidth: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extendBtnPressed: {
    backgroundColor: BRAND_BLUE_DARK,
  },
  extendBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  toggleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
  deleteBtnWeb: {
    cursor: 'pointer',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  modalDismissLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    zIndex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    backgroundColor: PAGE_BG,
    padding: 22,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  modalBody: {
    marginTop: 10,
    fontSize: 15,
    color: '#334155',
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 22,
  },
  modalBtnSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#F8FAFC',
  },
  modalBtnSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
  modalBtnDanger: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#B91C1C',
  },
  modalBtnDangerPressed: {
    opacity: 0.88,
  },
  modalBtnDangerText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalBtnPressed: {
    opacity: 0.85,
  },
  sidebarOverlay: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebarPanel: {
    width: 260,
    maxWidth: '86%',
    flexShrink: 0,
    backgroundColor: PAGE_BG,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: SUBTLE_BORDER,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '2px 0 12px rgba(15, 23, 42, 0.12)' } as const)
      : {
          shadowColor: '#0f172a',
          shadowOffset: { width: 2, height: 0 },
          shadowOpacity: 0.12,
          shadowRadius: 12,
          elevation: 8,
        }),
  },
  sidebarBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SUBTLE_BORDER,
  },
  sidebarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  sidebarCloseBtn: {
    padding: 6,
  },
  sidebarCloseBtnPressed: {
    opacity: 0.65,
  },
  mainColumnWrap: {
    flex: 1,
    minHeight: 0,
  },
  dashboardScroll: {
    flex: 1,
    backgroundColor: DASHBOARD_PANEL_BG,
  },
  dashboardScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  dashboardScrollContentFlex: {
    flexGrow: 1,
  },
  dashboardOverviewSubtitle: {
    fontSize: 14,
    color: TEXT_MUTED,
    lineHeight: 20,
    marginBottom: 20,
  },
  dashboardStatsLoadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  dashboardStatsLoadingText: {
    fontSize: 14,
    color: TEXT_MUTED,
  },
  dashboardStatsErrorWrap: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 12,
    gap: 16,
  },
  dashboardStatsErrorText: {
    fontSize: 14,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 360,
  },
  dashboardStatsRetryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: BRAND_BLUE,
  },
  dashboardStatsRetryBtnPressed: {
    opacity: 0.88,
  },
  dashboardStatsRetryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  dashboardStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  dashboardStatsGridWide: {
    gap: 16,
  },
  dashboardStatCard: {
    width: '47%',
    minWidth: 140,
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 8,
  },
  dashboardStatCardWide: {
    width: '22%',
    minWidth: 150,
  },
  dashboardStatIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SUBTLE_BORDER,
  },
  dashboardStatValue: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  dashboardStatLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
  sidebarModalScroll: {
    flex: 1,
  },
  sidebarModalScrollContent: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 20,
  },
  sidebarPrimaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginBottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#F8FAFC',
  },
  sidebarPrimaryRowSelected: {
    backgroundColor: BRAND_BLUE,
    borderColor: BRAND_BLUE,
  },
  sidebarPrimaryRowPressed: {
    opacity: 0.88,
  },
  sidebarPrimaryLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
  sidebarPrimaryLabelSelected: {
    color: '#FFFFFF',
  },
  sidebarRowTrailingSpacer: {
    width: 18,
  },
  sidebarNavBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarNavBadgeLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sidebarNavRowWeb: {
    cursor: 'pointer',
  },
  addInstituteTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BRAND_BLUE,
    backgroundColor: '#EFF6FF',
  },
  addInstituteTriggerBtnPressed: {
    opacity: 0.88,
  },
  addInstituteTriggerBtnWeb: {
    cursor: 'pointer',
  } as const,
  addInstituteTriggerLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  instituteFormCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PAGE_BG,
  },
  instituteFormHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  instituteFormTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    flex: 1,
  },
  instituteFormCancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  instituteFormCancelBtnPressed: {
    opacity: 0.7,
  },
  instituteFormCancelLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_MUTED,
  },
  instituteListContent: {
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PAGE_BG,
    overflow: 'hidden',
    paddingBottom: 0,
  },
  instituteListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SUBTLE_BORDER,
    backgroundColor: PAGE_BG,
  },
  instituteListRowLast: {
    borderBottomWidth: 0,
  },
  instituteListRowDesktop: {
    paddingVertical: 14,
  },
  instituteListMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingVertical: 2,
    paddingRight: 8,
    borderRadius: 10,
  },
  instituteListMainPressed: {
    opacity: 0.72,
  },
  instituteListMainWeb: {
    cursor: 'pointer',
  },
  instituteListName: {
    fontSize: 15,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  instituteListMeta: {
    fontSize: 13,
    color: TEXT_MUTED,
    lineHeight: 18,
  },
  instituteListDate: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  instituteFieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
    marginBottom: 6,
    marginTop: 4,
  },
  instituteInput: {
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    minHeight: 44,
    marginBottom: 4,
    textAlignVertical: 'top',
  },
  instituteSubmitBtn: {
    marginTop: 14,
    backgroundColor: BRAND_BLUE,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  instituteSubmitBtnPressed: {
    backgroundColor: BRAND_BLUE_DARK,
  },
  instituteSubmitBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  instituteCardActions: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    flexShrink: 0,
  },
  instituteIconBtn: {
    padding: 4,
    marginTop: -2,
  },
  instituteIconBtnPressed: {
    opacity: 0.65,
  },
  instituteIconBtnWeb: {
    cursor: 'pointer',
  },
});
