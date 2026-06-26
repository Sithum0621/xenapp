import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { KeyboardAwareModalFrame } from '@/src/components/layout/scroll';
import { AppScrollView } from '@/src/components/layout/AppScrollView';
import TeacherRegisterStudentCredentialsView from '@/src/components/teacher/TeacherRegisterStudentCredentialsView';
import type { TeacherDashboardClassRow } from '@/src/services/teacherDashboardApi';
import { teacherStudentEnrollRegister } from '@/src/services/teacherStudentEnrollApi';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';

type Props = {
  visible: boolean;
  groups: TeacherDashboardClassRow[];
  onClose: () => void;
  onRegistered: () => void;
};

function groupKey(row: TeacherDashboardClassRow): string {
  return `${row.source}:${row.id}`;
}

function TeacherRegisterStudentModal({ visible, groups, onClose, onRegistered }: Props) {
  const { t } = useTranslation();
  const ov = (k: string, o?: Record<string, unknown>) => t(`teacherDashboard.overview.${k}`, o);
  const gd = (k: string, o?: Record<string, unknown>) => t(`teacherDashboard.groupDetail.${k}`, o);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{
    username: string;
    password: string;
  } | null>(null);

  const selectedGroup = useMemo(
    () => groups.find((g) => groupKey(g) === selectedKey) ?? null,
    [groups, selectedKey],
  );

  const resetForm = useCallback(() => {
    setFirstName('');
    setLastName('');
    setMobile('');
    setPassword('');
    setSelectedKey('');
    setGroupPickerOpen(false);
    setCreatedCredentials(null);
  }, []);

  useEffect(() => {
    if (!visible) {
      resetForm();
      return;
    }
    if (groups.length === 1) {
      setSelectedKey(groupKey(groups[0]));
    }
  }, [visible, groups, resetForm]);

  const enrollErrorMessage = (code: string | undefined) => {
    const key =
      code === 'already_enrolled'
        ? 'enrollErrAlreadyEnrolled'
        : code === 'username_exists'
          ? 'enrollErrUsernameExists'
          : code === 'invalid_username'
            ? 'enrollErrInvalidUsername'
            : code === 'validation_failed'
              ? 'enrollErrValidation'
              : code === 'network_error' || code === 'invoke_failed' || code === 'edge_http_error'
                ? 'enrollErrNetwork'
                : code === 'unauthorized'
                  ? 'enrollErrSession'
                  : code === 'xen_id_failed'
                    ? 'enrollErrXenId'
                    : 'enrollErrGeneric';
    return gd(key);
  };

  const submit = async () => {
    const first = firstName.trim();
    const last = lastName.trim();
    const phone = mobile.trim();
    const pw = password;

    if (!selectedGroup) {
      appAlert(ov('registerValidationTitle'), ov('registerGroupRequired'));
      return;
    }
    if (!first || !last || !phone || !pw) {
      appAlert(gd('registerValidationTitle'), ov('registerFieldsRequired'));
      return;
    }
    if (pw.length < 6) {
      appAlert(gd('registerValidationTitle'), gd('registerValidationPassword'));
      return;
    }

    setBusy(true);
    try {
      const { ok, error: err, xenStudentId } = await teacherStudentEnrollRegister({
        group_source: selectedGroup.source,
        group_id: selectedGroup.id,
        first_name: first,
        last_name: last,
        username: phone,
        address: '—',
        password: pw,
      });

      if (!ok) {
        appAlert(gd('workspaceError'), enrollErrorMessage(err));
        return;
      }

      if (!xenStudentId) {
        appAlert(gd('workspaceError'), gd('enrollErrXenId'));
        return;
      }

      setCreatedCredentials({ username: xenStudentId, password: pw });
    } catch {
      appAlert(gd('workspaceError'), gd('enrollErrNetwork'));
    } finally {
      setBusy(false);
    }
  };

  const closeAll = () => {
    if (busy) return;
    onClose();
  };

  const finishAfterCredentials = () => {
    setCreatedCredentials(null);
    onClose();
    onRegistered();
  };

  return (
    <>
      <KeyboardAwareModalFrame
        visible={visible}
        animationType="slide"
        onRequestClose={closeAll}
        overlayStyle={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={closeAll} />
        <View style={styles.modalCard}>
            <AppScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {createdCredentials ? (
                <TeacherRegisterStudentCredentialsView
                  username={createdCredentials.username}
                  password={createdCredentials.password}
                  title={gd('registerCredentialsTitle')}
                  subtitle={gd('registerCredentialsSubtitle')}
                  usernameLabel={gd('registerCredentialsUsernameLabel')}
                  usernameFormatHint={gd('registerCredentialsUsernameHint')}
                  passwordLabel={gd('registerCredentialsPasswordLabel')}
                  doneLabel={gd('registerCredentialsDone')}
                  onDone={finishAfterCredentials}
                />
              ) : (
                <>
              <Text style={styles.modalTitle}>{ov('registerFormTitle')}</Text>
              <Text style={styles.modalHint}>{ov('registerFormSubtitle')}</Text>

              <Text style={styles.label}>{ov('registerGroupLabel')}</Text>
              <Pressable
                accessibilityRole="button"
                disabled={busy || groups.length === 0}
                onPress={() => setGroupPickerOpen(true)}
                style={({ pressed }) => [
                  styles.selectField,
                  pressed && !busy && styles.selectFieldPressed,
                  groups.length === 0 && styles.selectFieldDisabled,
                ]}>
                <Text
                  style={[
                    styles.selectFieldText,
                    !selectedGroup && styles.selectFieldPlaceholder,
                  ]}
                  numberOfLines={2}>
                  {selectedGroup
                    ? selectedGroup.name
                    : groups.length === 0
                      ? ov('registerGroupEmpty')
                      : ov('registerGroupPlaceholder')}
                </Text>
                <Ionicons name="chevron-down" size={18} color={TEXT_MUTED} />
              </Pressable>

              <Text style={styles.label}>{gd('registerFirstName')}</Text>
              <TextInput
                value={firstName}
                onChangeText={setFirstName}
                editable={!busy}
                style={styles.input}
                placeholder={gd('registerFirstName')}
              />

              <Text style={styles.label}>{gd('registerLastName')}</Text>
              <TextInput
                value={lastName}
                onChangeText={setLastName}
                editable={!busy}
                style={styles.input}
                placeholder={gd('registerLastName')}
              />

              <Text style={styles.label}>{ov('registerMobileLabel')}</Text>
              <TextInput
                value={mobile}
                onChangeText={setMobile}
                editable={!busy}
                style={styles.input}
                placeholder={ov('registerMobilePlaceholder')}
                keyboardType="phone-pad"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.label}>{gd('registerPassword')}</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                editable={!busy}
                style={styles.input}
                placeholder={gd('registerPassword')}
                secureTextEntry
              />

              <View style={styles.modalActions}>
                <Pressable
                  disabled={busy}
                  onPress={closeAll}
                  style={[styles.secondaryBtn, busy && styles.btnDisabled]}>
                  <Text style={styles.secondaryBtnText}>{t('teacherDashboard.groupsCancel')}</Text>
                </Pressable>
                <Pressable
                  disabled={busy || groups.length === 0}
                  onPress={() => void submit()}
                  style={[styles.primaryBtn, (busy || groups.length === 0) && styles.btnDisabled]}>
                  {busy ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryBtnText}>{gd('registerSubmit')}</Text>
                  )}
                </Pressable>
              </View>
                </>
              )}
            </AppScrollView>
          </View>
      </KeyboardAwareModalFrame>

      <KeyboardAwareModalFrame
        visible={groupPickerOpen}
        onRequestClose={() => setGroupPickerOpen(false)}
        overlayStyle={styles.pickerRoot}>
        <Pressable style={styles.modalBackdrop} onPress={() => setGroupPickerOpen(false)} />
        <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>{ov('registerGroupPickerTitle')}</Text>
            <AppScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              {groups.map((g) => {
                const key = groupKey(g);
                const selected = key === selectedKey;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    onPress={() => {
                      setSelectedKey(key);
                      setGroupPickerOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.pickerRow,
                      selected && styles.pickerRowSelected,
                      pressed && styles.pickerRowPressed,
                    ]}>
                    <View style={styles.pickerRowText}>
                      <Text style={styles.pickerRowName} numberOfLines={2}>
                        {g.name}
                      </Text>
                      {g.instituteName ? (
                        <Text style={styles.pickerRowMeta} numberOfLines={1}>
                          {g.instituteName}
                        </Text>
                      ) : null}
                    </View>
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={20} color={BRAND_BLUE} />
                    ) : null}
                  </Pressable>
                );
              })}
            </AppScrollView>
            <Pressable
              onPress={() => setGroupPickerOpen(false)}
              style={({ pressed }) => [styles.pickerDone, pressed && { opacity: 0.9 }]}>
              <Text style={styles.pickerDoneText}>{ov('registerGroupPickerDone')}</Text>
            </Pressable>
          </View>
      </KeyboardAwareModalFrame>
    </>
  );
}

export default memo(TeacherRegisterStudentModal);

const styles = StyleSheet.create({
  modalRoot: {
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  modalCard: {
    maxHeight: '92%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: Platform.OS === 'ios' ? 28 : 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    marginBottom: 6,
  },
  modalHint: {
    fontSize: 13,
    color: TEXT_MUTED,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: TEXT_MUTED,
    marginBottom: 6,
    marginTop: 4,
  },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  selectFieldPressed: { backgroundColor: '#EFF6FF' },
  selectFieldDisabled: { opacity: 0.6 },
  selectFieldText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
  selectFieldPlaceholder: {
    color: TEXT_MUTED,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: BRAND_BLUE_DARK,
    marginBottom: 4,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    marginBottom: 4,
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    fontSize: 14,
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  primaryBtnText: {
    fontWeight: '800',
    color: '#FFFFFF',
    fontSize: 14,
  },
  btnDisabled: { opacity: 0.65 },
  pickerRoot: {
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  pickerCard: {
    maxHeight: '70%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    marginBottom: 10,
  },
  pickerList: {
    maxHeight: 320,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 8,
  },
  pickerRowSelected: {
    borderColor: BRAND_BLUE,
    backgroundColor: '#EFF6FF',
  },
  pickerRowPressed: { opacity: 0.92 },
  pickerRowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pickerRowName: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  pickerRowMeta: {
    fontSize: 11,
    color: TEXT_MUTED,
    fontWeight: '600',
  },
  pickerDone: {
    marginTop: 8,
    backgroundColor: BRAND_BLUE,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  pickerDoneText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
});
