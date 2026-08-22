import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

import {
  deletePersonalRosterEntry,
  fetchInstituteStudents,
  fetchPersonalRoster,
} from '@/src/services/teacherGroupWorkspaceApi';
import { teacherStudentEnrollAddByNameMobile } from '@/src/services/teacherStudentEnrollApi';
import { paramString, type TeacherGroupRouteContext } from '@/src/utils/teacherGroupRouteParams';
import {
  parseSriLankaMobile,
  sanitizeSriLankaMobileInput,
} from '@/src/utils/sriLankaMobile';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const BORDER = '#E2E8F0';
const PAGE_SURFACE = '#F8FAFC';
const TEXT_MUTED = '#64748B';

type Props = { ctx: TeacherGroupRouteContext };

function groupSource(ctx: TeacherGroupRouteContext): 'personal' | 'institute' {
  return ctx.source === 'institute' ? 'institute' : 'personal';
}

export default function TeacherGroupStudentsPanel({ ctx }: Props) {
  const { action } = useLocalSearchParams<{ action?: string | string[] }>();
  const { t } = useTranslation();
  const gd = (k: string, o?: Record<string, unknown>) => t(`teacherDashboard.groupDetail.${k}`, o);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [instituteRows, setInstituteRows] = useState<{ id: string; name: string }[]>([]);
  const [personalRows, setPersonalRows] = useState<{ id: string; name: string }[]>([]);

  const [scanOpen, setScanOpen] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [linkMobile, setLinkMobile] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (ctx.source === 'institute') {
      const { rows, error: e } = await fetchInstituteStudents(ctx.groupId);
      if (e) setError(e);
      else setInstituteRows(rows.map((r) => ({ id: r.student_user_id, name: r.full_name })));
      setPersonalRows([]);
    } else {
      const { rows, error: e } = await fetchPersonalRoster(ctx.groupId);
      if (e) setError(e);
      else setPersonalRows(rows.map((r) => ({ id: r.id, name: r.display_name })));
      setInstituteRows([]);
    }
    setLoading(false);
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (paramString(action).toLowerCase() === 'register') {
      setScanOpen(true);
    }
  }, [action]);

  const rows = ctx.source === 'institute' ? instituteRows : personalRows;

  const openAdd = () => {
    setStudentName('');
    setLinkMobile('');
    setScanOpen(true);
  };

  const closeAdd = () => {
    if (linkBusy) return;
    setScanOpen(false);
    setStudentName('');
    setLinkMobile('');
  };

  const enrollErrorMessage = (code: string | undefined) => {
    const key =
      code === 'already_enrolled'
        ? 'enrollErrAlreadyEnrolled'
        : code === 'username_exists'
          ? 'enrollErrUsernameExists'
          : code === 'invalid_username'
            ? 'enrollErrInvalidUsername'
            : code === 'not_a_student_account'
              ? 'enrollErrNotStudent'
              : code === 'student_not_found'
                ? 'enrollErrStudentNotFound'
                : code === 'validation_failed'
                  ? 'enrollErrValidation'
                  : code === 'network_error' ||
                      code === 'invoke_failed' ||
                      code === 'edge_http_error'
                    ? 'enrollErrNetwork'
                    : code === 'unauthorized'
                      ? 'enrollErrSession'
                      : code === 'card_owned_by_other'
                          ? 'enrollErrCardOwned'
                          : code === 'server_misconfigured'
                          ? 'enrollErrGeneric'
                          : code === 'signup_failed' ||
                              code === 'enroll_failed' ||
                              code === 'profile_update_failed'
                            ? 'enrollErrSignup'
                            : 'enrollErrGeneric';
    return gd(key);
  };

  const submitAddStudent = async () => {
    const name = studentName.trim();
    const phone = parseSriLankaMobile(linkMobile);
    if (!name || !phone) {
      appAlert(gd('registerValidationTitle'), gd('addStudentNameMobileRequired'));
      return;
    }

    setLinkBusy(true);
    try {
      const result = await teacherStudentEnrollAddByNameMobile({
        group_source: groupSource(ctx),
        group_id: ctx.groupId,
        full_name: name,
        mobile_number: phone,
      });

      if (!result.ok) {
        const detail =
          typeof result.detail === 'string' && result.detail.trim()
            ? `\n(${result.detail.trim()})`
            : result.error
              ? `\n(${result.error})`
              : '';
        appAlert(gd('workspaceError'), `${enrollErrorMessage(result.error)}${detail}`);
        return;
      }

      setScanOpen(false);
      setStudentName('');
      setLinkMobile('');
      void load();
    } catch {
      appAlert(gd('workspaceError'), gd('enrollErrNetwork'));
    } finally {
      setLinkBusy(false);
    }
  };

  const removePersonal = (id: string, name: string) => {
    appAlert(gd('removeStudentTitle'), gd('removeStudentBody', { name }), [
      { text: t('teacherDashboard.groupsCancel'), style: 'cancel' },
      {
        text: gd('removeStudentAction'),
        style: 'destructive',
        onPress: async () => {
          const { error: e } = await deletePersonalRosterEntry(id);
          if (e) {
            appAlert(gd('workspaceError'), e);
            return;
          }
          void load();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={BRAND_BLUE} />
        <Text style={styles.loaderText}>{gd('workspaceLoading')}</Text>
      </View>
    );
  }

  return (
    <View>
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load()} style={styles.retrySmall}>
            <Text style={styles.retrySmallText}>{gd('workspaceRetry')}</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable onPress={openAdd} style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.9 }]}>
        <Ionicons name="person-add-outline" size={20} color={BRAND_BLUE} />
        <Text style={styles.addBtnText}>{gd('addStudent')}</Text>
      </Pressable>

      <Text style={styles.meta}>{gd('rosterCount', { count: rows.length })}</Text>

      {rows.length === 0 ? (
        <Text style={styles.empty}>{gd('studentsEmpty')}</Text>
      ) : (
        rows.map((s) => (
          <View key={s.id} style={styles.row}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{s.name.trim().charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {s.name}
            </Text>
            {ctx.source === 'personal' ? (
              <Pressable
                onPress={() => removePersonal(s.id, s.name)}
                style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.88 }]}>
                <Ionicons name="person-remove-outline" size={18} color="#B91C1C" />
                <Text style={styles.removeText}>{gd('removeStudentAction')}</Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}

      <Modal visible={scanOpen} transparent animationType="fade" onRequestClose={closeAdd}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeAdd} />
          <View style={[styles.modalCard, styles.modalCardTall]}>
            {linkBusy ? (
              <View style={styles.linkBusy}>
                <ActivityIndicator color={BRAND_BLUE} size="large" />
                <Text style={styles.linkBusyText}>{gd('linkEnrolling')}</Text>
              </View>
            ) : (
              <View style={styles.mobileStep}>
                <Text style={styles.mobileTitle}>{gd('addStudent')}</Text>
                <Text style={styles.mobileLabel}>{gd('addStudentNameLabel')}</Text>
                <TextInput
                  value={studentName}
                  onChangeText={setStudentName}
                  placeholder={gd('addStudentNamePlaceholder')}
                  autoCapitalize="words"
                  autoComplete="off"
                  textContentType="none"
                  style={styles.mobileInput}
                />
                <Text style={styles.mobileLabel}>{gd('linkMobileLabel')}</Text>
                <TextInput
                  value={linkMobile}
                  onChangeText={(text) => setLinkMobile(sanitizeSriLankaMobileInput(text))}
                  placeholder={gd('linkMobilePlaceholder')}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  style={styles.mobileInput}
                />
                <View style={styles.mobileActions}>
                  <Pressable onPress={closeAdd} style={styles.mobileSecondary} disabled={linkBusy}>
                    <Text style={styles.mobileSecondaryText}>{t('teacherDashboard.groupsCancel')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void submitAddStudent()}
                    disabled={linkBusy}
                    style={[styles.mobilePrimary, linkBusy && { opacity: 0.7 }]}>
                    <Text style={styles.mobilePrimaryText}>{gd('addStudent')}</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { paddingVertical: 24, alignItems: 'center', gap: 8 },
  loaderText: { color: TEXT_MUTED, fontWeight: '600' },
  errorBanner: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 12,
  },
  errorText: { fontSize: 12, color: '#991B1B', fontWeight: '600' },
  retrySmall: { marginTop: 8, alignSelf: 'flex-start' },
  retrySmallText: { color: BRAND_BLUE, fontWeight: '800', fontSize: 13 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: BRAND_BLUE,
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: '#E3F2FD',
  },
  addBtnText: { fontSize: 15, fontWeight: '800', color: BRAND_BLUE },
  meta: {
    marginTop: 14,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_MUTED,
  },
  empty: { fontSize: 14, color: TEXT_MUTED, fontWeight: '600', marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '800', color: BRAND_BLUE_DARK },
  name: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '700', color: BRAND_BLUE_DARK },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  removeText: { fontSize: 12, fontWeight: '800', color: '#B91C1C' },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  modalCard: {
    marginHorizontal: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
    zIndex: 1,
    maxHeight: '88%',
  },
  modalCardTall: { maxHeight: '92%' },
  linkBusy: { paddingVertical: 40, alignItems: 'center', gap: 12 },
  linkBusyText: { fontSize: 14, fontWeight: '700', color: TEXT_MUTED },
  mobileStep: { gap: 8 },
  mobileTitle: { fontSize: 17, fontWeight: '800', color: BRAND_BLUE_DARK },
  mobileLabel: { fontSize: 12, fontWeight: '700', color: TEXT_MUTED, marginTop: 4 },
  mobileInput: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: PAGE_SURFACE,
    color: BRAND_BLUE_DARK,
  },
  mobileActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  mobileSecondary: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingVertical: 12,
    alignItems: 'center',
  },
  mobileSecondaryText: { fontWeight: '800', color: BRAND_BLUE_DARK, fontSize: 14 },
  mobilePrimary: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
    paddingVertical: 12,
    alignItems: 'center',
  },
  mobilePrimaryText: { fontWeight: '800', color: '#FFFFFF', fontSize: 14 },
});
