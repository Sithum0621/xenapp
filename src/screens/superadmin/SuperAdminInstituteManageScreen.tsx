/**
 * Full-screen institute management: assigned admins, create-admin modal, institute details.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ScrollView } from '@/src/components/layout/scroll';
import { SafeAreaView } from 'react-native-safe-area-context';

import InstituteDetailsFormFields from '@/src/components/superadmin/InstituteDetailsFormFields';
import { AppRoutes, PROFILE_ROLE_SUPERADMIN, appHref } from '@/src/navigation/AppNavigator';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';
import { superadminCreateInstituteAdmin } from '@/src/services/superadminCreateInstituteAdminApi';
import { superadminResendAdminCredentials } from '@/src/services/superadminResendAdminCredentialsApi';
import { supabase } from '@/src/services/supabaseClient';
import {
  instituteFormToRpcPayload,
  instituteRecordToFormValues,
  mapInstituteRpcError,
  validateInstituteForm,
  type InstituteFormValues,
} from '@/src/utils/instituteFormValidation';
import { buildResendFailureMessage } from '@/src/utils/resendEmailFailureHint';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const PAGE_BG = '#FFFFFF';
const TEXT_MUTED = '#64748B';
const SUBTLE_BORDER = '#E2E8F0';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type InstituteAdminRow = {
  user_id: string;
  email: string;
  full_name: string;
};

type ProfilesPanel = 'details' | 'admins' | null;

type InstituteMemberCounts = {
  admins: number;
  teachers: number;
  students: number;
};

type AdminCredentialsBanner = {
  email: string;
  password: string;
  fullName: string;
  emailSkipReason?: string | null;
};

const EMPTY_MEMBER_COUNTS: InstituteMemberCounts = { admins: 0, teachers: 0, students: 0 };

export default function SuperAdminInstituteManageScreen() {
  const { t } = useTranslation();
  const { id: instituteIdParam } = useLocalSearchParams<{ id?: string }>();
  const instituteId = typeof instituteIdParam === 'string' ? instituteIdParam.trim() : '';

  const [checkingGate, setCheckingGate] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [instituteLoading, setInstituteLoading] = useState(true);

  const [form, setForm] = useState<InstituteFormValues>({
    name: '',
    addressLine1: '',
    addressLine2: '',
    email: '',
    contactNumber: '',
    notes: '',
  });

  const [assignedAdmins, setAssignedAdmins] = useState<InstituteAdminRow[]>([]);
  const [assignedAdminsLoading, setAssignedAdminsLoading] = useState(false);
  const [removeAdminBusyId, setRemoveAdminBusyId] = useState<string | null>(null);

  const [createAdminFirstName, setCreateAdminFirstName] = useState('');
  const [createAdminLastName, setCreateAdminLastName] = useState('');
  const [createAdminEmail, setCreateAdminEmail] = useState('');
  const [createAdminPassword, setCreateAdminPassword] = useState('');
  const [createAdminSubmitting, setCreateAdminSubmitting] = useState(false);
  const [createAdminModalVisible, setCreateAdminModalVisible] = useState(false);
  const [createModalError, setCreateModalError] = useState<string | null>(null);

  const [instituteDetailsSaving, setInstituteDetailsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profilesPanel, setProfilesPanel] = useState<ProfilesPanel>(null);
  const [memberCounts, setMemberCounts] = useState<InstituteMemberCounts>(EMPTY_MEMBER_COUNTS);
  const [memberCountsLoading, setMemberCountsLoading] = useState(false);
  const [adminCredentialsBanner, setAdminCredentialsBanner] = useState<AdminCredentialsBanner | null>(
    null,
  );
  const [resendAdminBusyId, setResendAdminBusyId] = useState<string | null>(null);
  const [adminEmailNotice, setAdminEmailNotice] = useState<string | null>(null);

  const pageBusy = instituteDetailsSaving || removeAdminBusyId !== null || resendAdminBusyId !== null;

  const resetCreateAdminForm = useCallback(() => {
    setCreateAdminFirstName('');
    setCreateAdminLastName('');
    setCreateAdminEmail('');
    setCreateAdminPassword('');
    setCreateModalError(null);
  }, []);

  const openCreateAdminModal = () => {
    resetCreateAdminForm();
    setCreateAdminModalVisible(true);
  };

  const toggleProfilesPanel = useCallback((panel: Exclude<ProfilesPanel, null>) => {
    setProfilesPanel((current) => (current === panel ? null : panel));
  }, []);

  const collapseProfilesPanel = useCallback(() => {
    setProfilesPanel(null);
  }, []);

  const closeCreateAdminModal = () => {
    if (createAdminSubmitting) return;
    setCreateAdminModalVisible(false);
    resetCreateAdminForm();
  };

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

  useEffect(() => {
    if (!authorized || !UUID_RE.test(instituteId)) {
      setInstituteLoading(false);
      return;
    }

    let cancelled = false;

    const loadRow = async () => {
      setInstituteLoading(true);
      setLoadError(null);

      const { data, error } = await supabase.rpc('superadmin_get_institute', {
        p_id: instituteId,
      });

      if (cancelled) return;

      setInstituteLoading(false);

      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row?.id) {
        const msg = error?.message ?? '';
        setLoadError(
          msg.toLowerCase().includes('institute_not_found')
            ? t('superAdmin.instituteNotFound')
            : msg || t('superAdmin.instituteNotFound'),
        );
        return;
      }

      setForm(instituteRecordToFormValues(row));
    };

    void loadRow();
    return () => {
      cancelled = true;
    };
  }, [authorized, instituteId, t]);

  const loadMemberCounts = useCallback(async (id: string) => {
    setMemberCountsLoading(true);
    const { data, error } = await supabase.rpc('superadmin_institute_member_counts', {
      p_institute_id: id,
    });
    setMemberCountsLoading(false);
    if (error) {
      setMemberCounts(EMPTY_MEMBER_COUNTS);
      return;
    }
    const raw = (data ?? {}) as Partial<InstituteMemberCounts>;
    setMemberCounts({
      admins: typeof raw.admins === 'number' ? raw.admins : 0,
      teachers: typeof raw.teachers === 'number' ? raw.teachers : 0,
      students: typeof raw.students === 'number' ? raw.students : 0,
    });
  }, []);

  const loadAssignedAdmins = useCallback(async (id: string) => {
    setAssignedAdminsLoading(true);
    const { data, error } = await supabase.rpc('superadmin_list_institute_admins', {
      p_filters: { institute_id: id, limit: 100, offset: 0 },
    });
    setAssignedAdminsLoading(false);
    if (error) {
      setErrorMessage(error.message);
      setAssignedAdmins([]);
      return;
    }
    setAssignedAdmins((data ?? []) as InstituteAdminRow[]);
  }, []);

  useEffect(() => {
    if (!authorized || !UUID_RE.test(instituteId)) return;
    void loadAssignedAdmins(instituteId);
    void loadMemberCounts(instituteId);
  }, [authorized, instituteId, loadAssignedAdmins, loadMemberCounts]);

  const saveInstituteDetails = async () => {
    if (!UUID_RE.test(instituteId)) return;

    const validationKey = validateInstituteForm(form);
    if (validationKey) {
      setErrorMessage(t(`superAdmin.${validationKey}`));
      return;
    }

    setInstituteDetailsSaving(true);
    setErrorMessage(null);

    const payload = instituteFormToRpcPayload(form);
    const { error } = await supabase.rpc('superadmin_update_institute', {
      p_payload: {
        id: instituteId,
        ...payload,
      },
    });

    setInstituteDetailsSaving(false);

    if (error) {
      const mapped = mapInstituteRpcError(error.message);
      setErrorMessage(mapped ? t(`superAdmin.${mapped}`) : error.message);
      return;
    }
  };

  const removeAdminFromInstitute = async (adminUserId: string) => {
    if (!UUID_RE.test(instituteId)) return;
    setRemoveAdminBusyId(adminUserId);
    setErrorMessage(null);
    const { error } = await supabase.rpc('superadmin_remove_admin_from_institute', {
      p_payload: {
        institute_id: instituteId,
        admin_user_id: adminUserId,
      },
    });
    setRemoveAdminBusyId(null);
    if (error) {
      const m = error.message.toLowerCase();
      setErrorMessage(
        m.includes('admin_not_assigned_here')
          ? t('superAdmin.instituteManageErrRemoveFailed')
          : error.message,
      );
      return;
    }
    await loadAssignedAdmins(instituteId);
    await loadMemberCounts(instituteId);
  };

  const mapCreateAdminError = (code?: string, detail?: string) => {
    switch (code) {
      case 'validation_failed':
        return t('superAdmin.instituteManageErrCreateAdminValidation');
      case 'email_exists':
        return t('superAdmin.instituteManageErrCreateAdminEmailExists');
      case 'institute_not_found':
      case 'invalid_institute_id':
        return t('superAdmin.instituteNotFound');
      case 'not_superadmin':
      case 'unauthorized':
        return t('superAdmin.errors.deleteForbidden');
      case 'network_error':
      case 'invoke_failed':
      case 'edge_http_error':
      case 'server_misconfigured':
        return t('superAdmin.instituteManageErrCreateAdminUnreachable');
      case 'create_failed':
        return detail?.trim()
          ? `${t('superAdmin.instituteManageErrCreateAdminFailed')} (${detail})`
          : t('superAdmin.instituteManageErrCreateAdminFailed');
      default:
        return detail?.trim() || t('superAdmin.instituteManageErrCreateAdminFailed');
    }
  };

  const submitCreateInstituteAdmin = async () => {
    if (!UUID_RE.test(instituteId)) return;
    const first = createAdminFirstName.trim();
    const last = createAdminLastName.trim();
    const email = createAdminEmail.trim();
    const password = createAdminPassword;

    if (!first || !last || !email || password.length < 6) {
      setCreateModalError(t('superAdmin.instituteManageErrCreateAdminValidation'));
      return;
    }
    if (!email.includes('@')) {
      setCreateModalError(t('superAdmin.instituteManageErrCreateAdminValidation'));
      return;
    }

    setCreateAdminSubmitting(true);
    setCreateModalError(null);

    const result = await superadminCreateInstituteAdmin({
      institute_id: instituteId,
      first_name: first,
      last_name: last,
      email,
      password,
    });

    setCreateAdminSubmitting(false);

    if (!result.ok) {
      setCreateModalError(mapCreateAdminError(result.error, result.detail));
      return;
    }

    setCreateAdminModalVisible(false);
    resetCreateAdminForm();
    setAdminEmailNotice(null);
    setAdminCredentialsBanner(null);

    if (result.email_sent === false) {
      const manualPassword = result.manual_password ?? password;
      setAdminCredentialsBanner({
        email,
        password: manualPassword,
        fullName: `${first} ${last}`.trim(),
        emailSkipReason: result.email_skip_reason,
      });
    } else {
      setAdminEmailNotice(t('superAdmin.instituteManageCreateAdminEmailSent'));
    }

    await loadAssignedAdmins(instituteId);
    await loadMemberCounts(instituteId);
  };

  const resendAdminCredentialsEmail = async (admin: InstituteAdminRow) => {
    if (!UUID_RE.test(instituteId)) return;
    setResendAdminBusyId(admin.user_id);
    setAdminEmailNotice(null);
    setAdminCredentialsBanner(null);

    const result = await superadminResendAdminCredentials({
      institute_id: instituteId,
      user_id: admin.user_id,
    });

    setResendAdminBusyId(null);

    if (!result.ok) {
      setErrorMessage(
        result.error === 'admin_not_found'
          ? t('superAdmin.instituteManageResendAdminNotFound')
          : t('superAdmin.instituteManageResendAdminFailed'),
      );
      return;
    }

    if (result.email_sent) {
      setAdminEmailNotice(
        t('superAdmin.instituteManageResendAdminEmailSent', { email: admin.email }),
      );
      return;
    }

    if (result.manual_password) {
      setAdminCredentialsBanner({
        email: admin.email,
        password: result.manual_password,
        fullName: admin.full_name?.trim() || admin.email,
        emailSkipReason: result.email_skip_reason,
      });
      return;
    }

    setErrorMessage(
      buildResendFailureMessage(
        t,
        result.email_skip_reason,
        'superAdmin.instituteManageCreateAdminEmailNotSent',
      ),
    );
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('auth.back')}
            onPress={() => routerBackOrReplace(router, appHref(AppRoutes.superAdminDashboard))}
            style={({ pressed }) => [styles.backRow, pressed && styles.backRowPressed]}>
            <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
            <Text style={styles.backText}>{t('auth.back')}</Text>
          </Pressable>
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
          onPress={() => routerBackOrReplace(router, appHref(AppRoutes.superAdminDashboard))}
          style={({ pressed }) => [styles.backRow, pressed && styles.backRowPressed]}>
          <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
          <Text style={styles.backText}>{t('auth.back')}</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t('superAdmin.manageInstitute')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {instituteLoading ? (
        <View style={styles.centeredBusy}>
          <ActivityIndicator color={BRAND_BLUE} size="large" />
        </View>
      ) : loadError ? (
        <View style={styles.pagePad}>
          <Text style={styles.errorBanner}>{loadError}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => routerBackOrReplace(router, appHref(AppRoutes.superAdminDashboard))}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}>
            <Text style={styles.secondaryBtnText}>{t('auth.back')}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator>
            <Text style={styles.pageInstituteName} numberOfLines={2}>
              {form.name.trim() || '—'}
            </Text>

            {errorMessage ? <Text style={styles.inlineError}>{errorMessage}</Text> : null}
            {adminEmailNotice ? <Text style={styles.inlineSuccess}>{adminEmailNotice}</Text> : null}
            {adminCredentialsBanner ? (
              <View style={styles.adminCredentialsBanner}>
                <View style={styles.adminCredentialsBannerHeader}>
                  <Text style={styles.adminCredentialsBannerTitle}>
                    {t('superAdmin.instituteManageCreateAdminEmailNotSent')}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('superAdmin.manageClose')}
                    hitSlop={8}
                    onPress={() => setAdminCredentialsBanner(null)}
                    style={({ pressed }) => [
                      styles.adminCredentialsBannerClose,
                      pressed && styles.adminCredentialsBannerClosePressed,
                    ]}>
                    <Ionicons name="close" size={18} color={BRAND_BLUE_DARK} />
                  </Pressable>
                </View>
                <Text style={styles.adminCredentialsBannerHint}>
                  {buildResendFailureMessage(
                    t,
                    adminCredentialsBanner.emailSkipReason,
                    'superAdmin.instituteManageCreateAdminEmailNotSentDetail',
                  )}
                </Text>
                <Text style={styles.adminCredentialsBannerShare}>
                  {t('superAdmin.instituteManageCreateAdminManualShare')}
                </Text>
                <Text style={styles.adminCredentialsLine}>
                  {t('superAdmin.manageCreateAdminEmail')}: {adminCredentialsBanner.email}
                </Text>
                <Text style={styles.adminCredentialsLine}>
                  {t('superAdmin.manageCreateAdminPassword')}: {adminCredentialsBanner.password}
                </Text>
              </View>
            ) : null}

            <View style={styles.profilesSectionCard}>
              <Text style={styles.profilesSectionTitle}>{t('superAdmin.instituteProfilesSectionTitle')}</Text>

              <View style={styles.profilesTabRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: profilesPanel === 'details', expanded: profilesPanel === 'details' }}
                  accessibilityLabel={t('superAdmin.instituteDetailsTabButton')}
                  disabled={pageBusy}
                  onPress={() => toggleProfilesPanel('details')}
                  style={({ pressed }) => [
                    styles.profilesTabBtn,
                    profilesPanel === 'details' && styles.profilesTabBtnSelected,
                    pressed && profilesPanel !== 'details' && styles.profilesTabBtnPressed,
                    pageBusy && styles.btnDisabled,
                  ]}>
                  <Ionicons
                    name="business-outline"
                    size={18}
                    color={profilesPanel === 'details' ? '#FFFFFF' : BRAND_BLUE}
                  />
                  <Text
                    style={[
                      styles.profilesTabBtnText,
                      profilesPanel === 'details' && styles.profilesTabBtnTextSelected,
                    ]}>
                    {t('superAdmin.instituteDetailsTabButton')}
                  </Text>
                  {profilesPanel === 'details' ? (
                    <Ionicons name="chevron-up" size={16} color="#FFFFFF" />
                  ) : null}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: profilesPanel === 'admins', expanded: profilesPanel === 'admins' }}
                  accessibilityLabel={t('superAdmin.instituteAdminsTabButton')}
                  disabled={pageBusy}
                  onPress={() => toggleProfilesPanel('admins')}
                  style={({ pressed }) => [
                    styles.profilesTabBtn,
                    profilesPanel === 'admins' && styles.profilesTabBtnSelected,
                    pressed && profilesPanel !== 'admins' && styles.profilesTabBtnPressed,
                    pageBusy && styles.btnDisabled,
                  ]}>
                  <Ionicons
                    name="shield-outline"
                    size={18}
                    color={profilesPanel === 'admins' ? '#FFFFFF' : BRAND_BLUE}
                  />
                  <Text
                    style={[
                      styles.profilesTabBtnText,
                      profilesPanel === 'admins' && styles.profilesTabBtnTextSelected,
                    ]}>
                    {t('superAdmin.instituteAdminsTabButton')}
                  </Text>
                  {profilesPanel === 'admins' ? (
                    <Ionicons name="chevron-up" size={16} color="#FFFFFF" />
                  ) : null}
                </Pressable>
              </View>

              <View style={[styles.memberCountsRow, profilesPanel === null && styles.memberCountsRowCompact]}>
                <View style={styles.memberCountTile}>
                  <Text style={styles.memberCountValue}>
                    {memberCountsLoading ? '—' : memberCounts.admins}
                  </Text>
                  <Text style={styles.memberCountLabel}>{t('superAdmin.instituteMemberCountAdmins')}</Text>
                </View>
                <View style={styles.memberCountDivider} />
                <View style={styles.memberCountTile}>
                  <Text style={styles.memberCountValue}>
                    {memberCountsLoading ? '—' : memberCounts.teachers}
                  </Text>
                  <Text style={styles.memberCountLabel}>{t('superAdmin.instituteMemberCountTeachers')}</Text>
                </View>
                <View style={styles.memberCountDivider} />
                <View style={styles.memberCountTile}>
                  <Text style={styles.memberCountValue}>
                    {memberCountsLoading ? '—' : memberCounts.students}
                  </Text>
                  <Text style={styles.memberCountLabel}>{t('superAdmin.instituteMemberCountStudents')}</Text>
                </View>
              </View>

              {profilesPanel === 'details' ? (
                <View style={styles.profilesPanel}>
                  <View style={styles.profilesPanelHeader}>
                    <Text style={styles.profilesPanelHeading}>{t('superAdmin.manageSectionDetails')}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('superAdmin.instituteProfilesCollapseSection')}
                      disabled={pageBusy}
                      hitSlop={8}
                      onPress={collapseProfilesPanel}
                      style={({ pressed }) => [
                        styles.profilesPanelCollapseBtn,
                        pressed && styles.profilesPanelCollapseBtnPressed,
                        pageBusy && styles.btnDisabled,
                      ]}>
                      <Ionicons name="chevron-up" size={20} color={BRAND_BLUE} />
                    </Pressable>
                  </View>
                  <InstituteDetailsFormFields
                    values={form}
                    onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
                    editable={!instituteDetailsSaving && !pageBusy}
                    fieldLabelStyle={styles.instituteFieldLabel}
                    inputStyle={styles.instituteInput}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('superAdmin.manageSaveDetails')}
                    disabled={pageBusy}
                    onPress={() => void saveInstituteDetails()}
                    style={({ pressed }) => [
                      styles.saveDetailsBtn,
                      pressed && styles.saveDetailsBtnPressed,
                      pageBusy && styles.btnDisabled,
                    ]}>
                    {instituteDetailsSaving ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.saveDetailsBtnText}>{t('superAdmin.manageSaveDetails')}</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}

              {profilesPanel === 'admins' ? (
                <View style={styles.profilesPanel}>
                  <View style={styles.profilesPanelHeader}>
                    <Text style={styles.profilesPanelHeading}>{t('superAdmin.manageSectionAdmins')}</Text>
                    <View style={styles.profilesPanelHeaderActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('superAdmin.manageCreateAdminButton')}
                        disabled={pageBusy || assignedAdminsLoading}
                        onPress={openCreateAdminModal}
                        style={({ pressed }) => [
                          styles.brandSecondaryBtn,
                          pressed && styles.brandSecondaryBtnPressed,
                          (pageBusy || assignedAdminsLoading) && styles.btnDisabled,
                        ]}>
                        <Ionicons name="person-add-outline" size={18} color={BRAND_BLUE} />
                        <Text style={styles.brandSecondaryBtnText}>{t('superAdmin.manageCreateAdminButton')}</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('superAdmin.instituteProfilesCollapseSection')}
                        disabled={pageBusy}
                        hitSlop={8}
                        onPress={collapseProfilesPanel}
                        style={({ pressed }) => [
                          styles.profilesPanelCollapseBtn,
                          pressed && styles.profilesPanelCollapseBtnPressed,
                          pageBusy && styles.btnDisabled,
                        ]}>
                        <Ionicons name="chevron-up" size={20} color={BRAND_BLUE} />
                      </Pressable>
                    </View>
                  </View>

                  {assignedAdminsLoading ? (
                    <View style={styles.manageInlineBusy}>
                      <ActivityIndicator color={BRAND_BLUE} size="small" />
                      <Text style={styles.manageHint}>{t('superAdmin.manageLoadingAdmins')}</Text>
                    </View>
                  ) : assignedAdmins.length === 0 ? (
                    <Text style={styles.manageHint}>{t('superAdmin.manageAssignedEmpty')}</Text>
                  ) : (
                    <View style={styles.adminList}>
                      {assignedAdmins.map((a) => {
                        const rmBusy = removeAdminBusyId === a.user_id;
                        const resendBusy = resendAdminBusyId === a.user_id;
                        const displayName = a.full_name?.trim() || '—';
                        return (
                          <View key={a.user_id} style={styles.adminListItem}>
                            <View style={styles.adminListAccent} />
                            <View style={styles.adminListMain}>
                              <Text style={styles.adminListName}>{displayName}</Text>
                              <Text style={styles.adminListEmail}>{a.email}</Text>
                            </View>
                            <View style={styles.adminListActions}>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={t('superAdmin.instituteManageResendAdminEmail')}
                                disabled={pageBusy}
                                onPress={() => void resendAdminCredentialsEmail(a)}
                                style={({ pressed }) => [
                                  styles.manageResendChip,
                                  pressed && styles.manageResendChipPressed,
                                  pageBusy && styles.btnDisabled,
                                ]}>
                                {resendBusy ? (
                                  <ActivityIndicator color={BRAND_BLUE} size="small" />
                                ) : (
                                  <Text style={styles.manageResendChipText}>
                                    {t('superAdmin.instituteManageResendAdminEmail')}
                                  </Text>
                                )}
                              </Pressable>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={t('superAdmin.manageRemoveAdmin')}
                                disabled={pageBusy}
                                onPress={() => void removeAdminFromInstitute(a.user_id)}
                                style={({ pressed }) => [
                                  styles.manageRemoveChip,
                                  pressed && styles.manageRemoveChipPressed,
                                  pageBusy && styles.btnDisabled,
                                ]}>
                                {rmBusy ? (
                                  <ActivityIndicator color="#B91C1C" size="small" />
                                ) : (
                                  <Text style={styles.manageRemoveChipText}>
                                    {t('superAdmin.manageRemoveAdmin')}
                                  </Text>
                                )}
                              </Pressable>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          </ScrollView>

          <Modal
            visible={createAdminModalVisible}
            transparent
            animationType="fade"
            onRequestClose={closeCreateAdminModal}>
            <View style={styles.modalRoot}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('superAdmin.manageClose')}
                style={styles.modalBackdrop}
                onPress={closeCreateAdminModal}
                disabled={createAdminSubmitting}
              />
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.modalCenterWrap}>
                <View style={styles.modalCard}>
                  <Text style={styles.modalTitle}>{t('superAdmin.manageSectionCreateAdmin')}</Text>
                  <Text style={styles.modalSubtitle}>{t('superAdmin.manageCreateAdminModalHint')}</Text>

                  {createModalError ? <Text style={styles.modalError}>{createModalError}</Text> : null}

                  <Text style={[styles.instituteFieldLabel, styles.modalFieldLabelFirst]}>
                    {t('superAdmin.manageCreateAdminFirstName')}
                  </Text>
                  <TextInput
                    value={createAdminFirstName}
                    onChangeText={setCreateAdminFirstName}
                    placeholder={t('superAdmin.manageCreateAdminFirstName')}
                    placeholderTextColor="#94A3B8"
                    style={styles.instituteInput}
                    editable={!createAdminSubmitting}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                  <Text style={styles.instituteFieldLabel}>{t('superAdmin.manageCreateAdminLastName')}</Text>
                  <TextInput
                    value={createAdminLastName}
                    onChangeText={setCreateAdminLastName}
                    placeholder={t('superAdmin.manageCreateAdminLastName')}
                    placeholderTextColor="#94A3B8"
                    style={styles.instituteInput}
                    editable={!createAdminSubmitting}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                  <Text style={styles.instituteFieldLabel}>{t('superAdmin.manageCreateAdminEmail')}</Text>
                  <TextInput
                    value={createAdminEmail}
                    onChangeText={setCreateAdminEmail}
                    placeholder={t('superAdmin.manageCreateAdminEmail')}
                    placeholderTextColor="#94A3B8"
                    style={styles.instituteInput}
                    editable={!createAdminSubmitting}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                  />
                  <Text style={styles.instituteFieldLabel}>{t('superAdmin.manageCreateAdminPassword')}</Text>
                  <TextInput
                    value={createAdminPassword}
                    onChangeText={setCreateAdminPassword}
                    placeholder={t('superAdmin.manageCreateAdminPassword')}
                    placeholderTextColor="#94A3B8"
                    style={styles.instituteInput}
                    editable={!createAdminSubmitting}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={styles.manageHint}>{t('superAdmin.manageCreateAdminPasswordHint')}</Text>

                  <View style={styles.modalActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('superAdmin.cancelEditInstitute')}
                      disabled={createAdminSubmitting}
                      onPress={closeCreateAdminModal}
                      style={({ pressed }) => [
                        styles.modalBtnOutline,
                        pressed && styles.modalBtnOutlinePressed,
                        createAdminSubmitting && styles.btnDisabled,
                      ]}>
                      <Text style={styles.modalBtnOutlineText}>{t('superAdmin.cancelEditInstitute')}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('superAdmin.manageCreateAdminSubmit')}
                      disabled={createAdminSubmitting}
                      onPress={() => void submitCreateInstituteAdmin()}
                      style={({ pressed }) => [
                        styles.modalBtnPrimary,
                        pressed && styles.modalBtnPrimaryPressed,
                        createAdminSubmitting && styles.btnDisabled,
                      ]}>
                      {createAdminSubmitting ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.modalBtnPrimaryText}>{t('superAdmin.manageCreateAdminSubmit')}</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              </KeyboardAvoidingView>
            </View>
          </Modal>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
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
  headerSpacer: {
    width: 72,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 4,
    minWidth: 72,
  },
  backRowPressed: {
    opacity: 0.65,
  },
  backText: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
  },
  pagePad: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  pageInstituteName: {
    fontSize: 22,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    marginBottom: 16,
    lineHeight: 28,
    letterSpacing: 0.2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  sectionHeaderTitles: {
    flex: 1,
    minWidth: 160,
  },
  manageSectionTitleFlat: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    letterSpacing: 0.15,
  },
  adminCountCaption: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_MUTED,
    marginTop: 4,
    lineHeight: 18,
  },
  brandSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BRAND_BLUE,
    backgroundColor: '#E3F2FD',
    flexShrink: 0,
  },
  brandSecondaryBtnPressed: {
    backgroundColor: '#DBEAFE',
    borderColor: BRAND_BLUE_DARK,
  },
  brandSecondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND_BLUE,
  },
  adminList: {
    gap: 0,
    marginBottom: 8,
  },
  adminListItem: {
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
  adminListAccent: {
    width: 4,
    borderRadius: 2,
    backgroundColor: BRAND_BLUE,
    marginRight: 12,
    alignSelf: 'stretch',
  },
  adminListMain: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingVertical: 2,
  },
  adminListName: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    lineHeight: 22,
  },
  adminListEmail: {
    fontSize: 14,
    fontWeight: '500',
    color: TEXT_MUTED,
    marginTop: 4,
    lineHeight: 20,
  },
  adminListActions: {
    alignSelf: 'center',
    gap: 8,
    flexShrink: 0,
  },
  manageResendChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    backgroundColor: '#E3F2FD',
    minWidth: 88,
    alignItems: 'center',
  },
  manageResendChipPressed: {
    opacity: 0.82,
  },
  manageResendChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND_BLUE,
  },
  manageRemoveChip: {
    alignSelf: 'stretch',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    flexShrink: 0,
  },
  manageRemoveChipPressed: {
    opacity: 0.82,
  },
  manageRemoveChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B91C1C',
  },
  centeredBusy: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBanner: {
    color: '#B91C1C',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 16,
    lineHeight: 22,
  },
  inlineError: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
    lineHeight: 18,
  },
  inlineSuccess: {
    color: '#15803D',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
    lineHeight: 18,
  },
  adminCredentialsBanner: {
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    borderRadius: 14,
    backgroundColor: '#FFFBEB',
    padding: 14,
    marginBottom: 14,
    gap: 8,
  },
  adminCredentialsBannerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  adminCredentialsBannerTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#92400E',
    lineHeight: 20,
  },
  adminCredentialsBannerClose: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminCredentialsBannerClosePressed: {
    backgroundColor: '#FEF3C7',
  },
  adminCredentialsBannerHint: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 19,
  },
  adminCredentialsBannerShare: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    marginTop: 4,
  },
  adminCredentialsLine: {
    fontSize: 14,
    color: '#0F172A',
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  secondaryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#F8FAFC',
  },
  secondaryBtnPressed: {
    opacity: 0.85,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  instituteFieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    marginBottom: 6,
    marginTop: 10,
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
  manageSectionTitleFirst: {
    marginTop: 2,
  },
  profilesSectionCard: {
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    marginTop: 4,
    backgroundColor: '#F8FAFC',
  },
  profilesSectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    marginBottom: 14,
    letterSpacing: 0.15,
  },
  profilesTabRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  profilesTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BRAND_BLUE,
    backgroundColor: '#FFFFFF',
    minHeight: 48,
  },
  profilesTabBtnSelected: {
    backgroundColor: BRAND_BLUE,
    borderColor: BRAND_BLUE,
  },
  profilesTabBtnPressed: {
    backgroundColor: '#E3F2FD',
  },
  profilesTabBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND_BLUE,
    textAlign: 'center',
  },
  profilesTabBtnTextSelected: {
    color: '#FFFFFF',
  },
  memberCountsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
    overflow: 'hidden',
  },
  memberCountsRowCompact: {
    marginBottom: 0,
  },
  memberCountTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  memberCountDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: SUBTLE_BORDER,
    alignSelf: 'stretch',
  },
  memberCountValue: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    lineHeight: 26,
  },
  memberCountLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_MUTED,
    marginTop: 4,
    textAlign: 'center',
  },
  profilesPanel: {
    marginTop: 2,
  },
  profilesPanelHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  profilesPanelHeaderActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  profilesPanelCollapseBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilesPanelCollapseBtnPressed: {
    backgroundColor: '#E3F2FD',
  },
  profilesPanelHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    flexShrink: 1,
  },
  manageSectionTitle: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 15,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  manageHint: {
    fontSize: 13,
    color: TEXT_MUTED,
    lineHeight: 18,
    marginBottom: 8,
  },
  manageInlineBusy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  modalRoot: {
    flex: 1,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
  },
  modalCenterWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
    pointerEvents: 'box-none',
  },
  modalCard: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
    backgroundColor: PAGE_BG,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    ...Platform.select({
      web: { boxShadow: '0 8px 24px rgba(18, 59, 122, 0.12)' },
      ios: {
        shadowColor: '#041830',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  modalSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: TEXT_MUTED,
    lineHeight: 18,
    marginBottom: 14,
  },
  modalError: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
    lineHeight: 18,
  },
  modalFieldLabelFirst: {
    marginTop: 0,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
    paddingTop: 4,
  },
  modalBtnOutline: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BRAND_BLUE,
    backgroundColor: PAGE_BG,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBtnOutlinePressed: {
    backgroundColor: '#F8FAFC',
    borderColor: BRAND_BLUE_DARK,
  },
  modalBtnOutlineText: {
    fontSize: 15,
    fontWeight: '700',
    color: BRAND_BLUE,
  },
  modalBtnPrimary: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
    minHeight: 48,
    minWidth: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBtnPrimaryPressed: {
    backgroundColor: BRAND_BLUE_DARK,
  },
  modalBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  saveDetailsBtn: {
    marginTop: 20,
    backgroundColor: BRAND_BLUE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  saveDetailsBtnPressed: {
    backgroundColor: BRAND_BLUE_DARK,
  },
  saveDetailsBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  btnDisabled: {
    opacity: 0.55,
  },
});
