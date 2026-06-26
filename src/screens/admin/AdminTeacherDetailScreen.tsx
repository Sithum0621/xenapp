import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { ActivityIndicator, Modal, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { ScrollView } from '@/src/components/layout/scroll';

import { appHref } from '@/src/navigation/AppNavigator';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';
import {
  instituteAdminGetTeacherProfile,
  instituteAdminListLectureGroupStudents,
  instituteAdminListTeacherLectureGroups,
  type LectureGroupStudentRow,
  type LectureGroupRow,
} from '@/src/services/instituteAdminLectureGroupsApi';
import { useAdminLayout } from '@/src/hooks/useAdminLayout';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const TEXT_MUTED = '#64748B';
const SUBTLE_BORDER = '#E2E8F0';
const PAGE_SURFACE = '#F8FAFC';
export default function AdminTeacherDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { contentPadding } = useAdminLayout();
  const params = useLocalSearchParams<{ teacherId: string | string[] }>();
  const teacherId = useMemo(() => {
    const raw = params.teacherId;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params.teacherId]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [assignedGroups, setAssignedGroups] = useState<LectureGroupRow[]>([]);

  const [studentsModalGroup, setStudentsModalGroup] = useState<LectureGroupRow | null>(null);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsRows, setStudentsRows] = useState<LectureGroupStudentRow[]>([]);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentsModalGroup) return;
    let cancelled = false;
    setStudentsLoading(true);
    setStudentsRows([]);
    setStudentsError(null);
    void (async () => {
      const res = await instituteAdminListLectureGroupStudents(studentsModalGroup.id);
      if (cancelled) return;
      setStudentsLoading(false);
      setStudentsRows(res.rows);
      setStudentsError(res.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [studentsModalGroup]);

  const load = useCallback(async () => {
    if (!teacherId) {
      setError('missing_id');
      setLoading(false);
      return;
    }
    setError(null);
    const [profileRes, assignedRes] = await Promise.all([
      instituteAdminGetTeacherProfile(teacherId),
      instituteAdminListTeacherLectureGroups(teacherId),
    ]);

    if (profileRes.error || !profileRes.row) {
      setError(profileRes.error ?? 'not_found');
      setEmail('');
      setFullName('');
      setAssignedGroups([]);
      return;
    }

    setEmail(profileRes.row.email);
    setFullName(profileRes.row.full_name);
    setError(null);
    setAssignedGroups(assignedRes.error ? [] : assignedRes.rows);
  }, [teacherId]);

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openStudentsModal = useCallback((g: LectureGroupRow) => {
    setStudentsModalGroup(g);
  }, []);

  const closeStudentsModal = useCallback(() => {
    setStudentsModalGroup(null);
  }, []);

  const displayName = fullName?.trim() || email || '—';

  if (!teacherId) {
    return (
      <View style={styles.centerBox}>
        <Text style={styles.muted}>{t('adminPortal.teacherDetailInvalid')}</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color={BRAND_BLUE} />
        <Text style={styles.muted}>{t('adminPortal.teachersLoading')}</Text>
      </View>
    );
  }

  const hasProfile = Boolean(email.trim() || fullName.trim());

  if (!hasProfile && error) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, contentPadding]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => routerBackOrReplace(router, appHref('/admin-dashboard/teachers'))}
          style={({ pressed }) => [styles.backRow, pressed && styles.backRowPressed]}>
          <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
          <Text style={styles.backLabel}>{t('adminPortal.teacherDetailBack')}</Text>
        </Pressable>
        <View style={styles.banner}>
          <Ionicons name="warning-outline" size={20} color="#B45309" style={styles.bannerIcon} />
          <View style={styles.bannerCol}>
            <Text style={styles.bannerText}>{t('adminPortal.teacherDetailLoadError')}</Text>
            <Text style={styles.bannerDetail} selectable>
              {error}
            </Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, contentPadding]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND_BLUE} />}>
        <Pressable
          accessibilityRole="button"
          onPress={() => routerBackOrReplace(router, appHref('/admin-dashboard/teachers'))}
          style={({ pressed }) => [styles.backRow, pressed && styles.backRowPressed]}>
          <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
          <Text style={styles.backLabel}>{t('adminPortal.teacherDetailBack')}</Text>
        </Pressable>

        {error && hasProfile ? (
          <View style={styles.banner}>
            <Ionicons name="warning-outline" size={20} color="#B45309" style={styles.bannerIcon} />
            <View style={styles.bannerCol}>
              <Text style={styles.bannerText}>{t('adminPortal.teacherDetailLoadError')}</Text>
              <Text style={styles.bannerDetail} selectable>
                {error}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={32} color={BRAND_BLUE} />
          </View>
          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profileEmail}>{email}</Text>
        </View>

        <Text style={styles.sectionTitle}>{t('adminPortal.teacherDetailGroupsHeading')}</Text>
        <Text style={styles.sectionHint}>{t('adminPortal.teacherDetailGroupsHint')}</Text>

        {assignedGroups.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t('adminPortal.teacherDetailNoGroups')}</Text>
          </View>
        ) : (
          assignedGroups.map((g) => (
            <Pressable
              key={g.id}
              accessibilityRole="button"
              accessibilityLabel={t('adminPortal.teacherDetailOpenGroupStudentsA11y', { name: g.name })}
              onPress={() => openStudentsModal(g)}
              style={({ pressed }) => [styles.groupCard, pressed && styles.groupCardPressed]}>
              <View style={styles.groupCardHeader}>
                <Text style={styles.groupName}>{g.name}</Text>
                <View style={styles.groupCardRight}>
                  {g.is_primary ? (
                    <View style={styles.primaryBadge}>
                      <Text style={styles.primaryBadgeText}>{t('adminPortal.groupPrimaryBadge')}</Text>
                    </View>
                  ) : null}
                  <Ionicons name="chevron-forward" size={20} color={TEXT_MUTED} />
                </View>
              </View>
              {g.description ? <Text style={styles.groupDesc}>{g.description}</Text> : null}
            </Pressable>
          ))
        )}
      </ScrollView>

      <Modal
        visible={studentsModalGroup != null}
        animationType="fade"
        transparent
        onRequestClose={closeStudentsModal}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeStudentsModal} accessibilityLabel={t('adminPortal.teachersCloseModal')} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle} numberOfLines={2}>
                {studentsModalGroup
                  ? t('adminPortal.teacherDetailGroupStudentsTitle', { name: studentsModalGroup.name })
                  : ''}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={closeStudentsModal}
                hitSlop={12}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.modalCloseBtnPressed]}>
                <Ionicons name="close" size={26} color={BRAND_BLUE_DARK} />
              </Pressable>
            </View>
            <Text style={styles.modalSub}>{t('adminPortal.teacherDetailGroupStudentsSubtitle')}</Text>

            {studentsLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={BRAND_BLUE} />
                <Text style={styles.modalLoadingText}>{t('adminPortal.teacherDetailGroupStudentsLoading')}</Text>
              </View>
            ) : studentsError ? (
              <View style={styles.modalErrorBox}>
                <Text style={styles.modalErrorText} selectable>
                  {studentsError}
                </Text>
              </View>
            ) : studentsRows.length === 0 ? (
              <Text style={styles.modalEmpty}>{t('adminPortal.teacherDetailGroupStudentsEmpty')}</Text>
            ) : (
              <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
                {studentsRows.map((s) => (
                  <View key={s.user_id} style={styles.studentRow}>
                    <Text style={styles.studentName}>{s.full_name?.trim() || s.email || '—'}</Text>
                    {s.email ? (
                      <Text style={styles.studentEmail} numberOfLines={1}>
                        {s.email}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            )}

            <Pressable
              onPress={closeStudentsModal}
              style={({ pressed }) => [styles.modalDone, pressed && styles.modalDonePressed]}>
              <Text style={styles.modalDoneText}>{t('adminPortal.teachersCloseModal')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
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
    marginBottom: 16,
  },
  bannerIcon: { marginTop: 2 },
  bannerCol: { flex: 1, minWidth: 0 },
  bannerText: { fontSize: 14, color: '#92400E', fontWeight: '600' },
  bannerDetail: { marginTop: 4, fontSize: 12, color: '#78350F' },
  profileCard: {
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#FFFFFF',
    marginBottom: 24,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    textAlign: 'center',
  },
  profileEmail: { marginTop: 4, fontSize: 15, color: TEXT_MUTED },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    marginBottom: 6,
  },
  sectionHint: {
    fontSize: 14,
    color: TEXT_MUTED,
    marginBottom: 14,
    lineHeight: 20,
  },
  groupCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PAGE_SURFACE,
    marginBottom: 10,
  },
  groupCardPressed: { opacity: 0.92 },
  groupCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  groupCardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupName: { flex: 1, fontSize: 16, fontWeight: '700', color: BRAND_BLUE_DARK },
  primaryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: BRAND_BLUE,
  },
  primaryBadgeText: { fontSize: 12, fontWeight: '800', color: BRAND_BLUE_DARK },
  groupDesc: { marginTop: 4, fontSize: 14, color: TEXT_MUTED },
  emptyCard: {
    padding: 20,
    borderRadius: 14,
    backgroundColor: PAGE_SURFACE,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    marginBottom: 16,
  },
  emptyText: { fontSize: 15, color: TEXT_MUTED, textAlign: 'center', lineHeight: 22 },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  modalCard: {
    zIndex: 2,
    maxHeight: '80%' as unknown as number,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 6,
  },
  modalTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
  },
  modalCloseBtn: { padding: 4, marginTop: -4, marginRight: -4 },
  modalCloseBtnPressed: { opacity: 0.7 },
  modalSub: {
    fontSize: 13,
    color: TEXT_MUTED,
    marginBottom: 14,
    lineHeight: 18,
  },
  modalLoading: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 12,
  },
  modalLoadingText: { fontSize: 14, color: TEXT_MUTED },
  modalErrorBox: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 12,
  },
  modalErrorText: { fontSize: 13, color: '#78350F' },
  modalEmpty: {
    fontSize: 15,
    color: TEXT_MUTED,
    textAlign: 'center',
    paddingVertical: 20,
    lineHeight: 22,
  },
  modalList: { maxHeight: 320, marginBottom: 8 },
  studentRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SUBTLE_BORDER,
  },
  studentName: { fontSize: 16, fontWeight: '600', color: BRAND_BLUE_DARK },
  studentEmail: { marginTop: 2, fontSize: 13, color: TEXT_MUTED },
  modalDone: {
    marginTop: 8,
    backgroundColor: BRAND_BLUE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalDonePressed: { opacity: 0.9 },
  modalDoneText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
