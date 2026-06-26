import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import TeacherGroupDetailMenu from '@/src/components/teacher/groupDetail/TeacherGroupDetailMenu';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import { teacherDeletePersonalGroup, teacherUpdatePersonalGroup } from '@/src/services/teacherGroupsApi';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';
import { parseTeacherGroupParams, type TeacherGroupRouteContext } from '@/src/utils/teacherGroupRouteParams';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const BORDER = '#E2E8F0';
const PAGE_SURFACE = '#F8FAFC';

function paramString(v: string | string[] | undefined): string {
  if (v == null) return '';
  return Array.isArray(v) ? (v[0] ?? '') : v;
}

function safeDecode(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
}

export default function TeacherGroupDetailHubScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    title?: string | string[];
    source?: string | string[];
    id?: string | string[];
    description?: string | string[];
  }>();

  const source = paramString(params.source);
  const groupId = paramString(params.id);
  const isPersonal = source === 'personal' && groupId.length > 0;

  const initialTitle = useMemo(() => {
    const raw = paramString(params.title).trim();
    if (!raw) return t('teacherDashboard.groupsDetailFallbackTitle');
    return safeDecode(raw);
  }, [params.title, t]);

  const initialDesc = useMemo(() => safeDecode(paramString(params.description)), [params.description]);

  const [displayTitle, setDisplayTitle] = useState(initialTitle);
  const [storedDesc, setStoredDesc] = useState(initialDesc);

  useEffect(() => {
    setDisplayTitle(initialTitle);
    setStoredDesc(initialDesc);
  }, [initialTitle, initialDesc]);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formBusy, setFormBusy] = useState(false);

  const openEditModal = useCallback(() => {
    setFormName(displayTitle);
    setFormDesc(storedDesc);
    setEditModalVisible(true);
  }, [displayTitle, storedDesc]);

  const closeEditModal = () => {
    if (formBusy) return;
    setEditModalVisible(false);
  };

  const submitEdit = async () => {
    if (!isPersonal) return;
    setFormBusy(true);
    const name = formName.trim();
    const description = formDesc.trim();
    if (!name) {
      setFormBusy(false);
      appAlert(t('teacherDashboard.groupsModalValidationTitle'), t('teacherDashboard.groupsNameRequired'));
      return;
    }

    const { error } = await teacherUpdatePersonalGroup({
      id: groupId,
      name,
      description,
    });
    setFormBusy(false);
    if (error) {
      appAlert(t('teacherDashboard.groupsSaveErrorTitle'), error);
      return;
    }

    setDisplayTitle(name);
    setStoredDesc(description);
    setEditModalVisible(false);
  };

  const confirmDelete = () => {
    if (!isPersonal) return;
    appAlert(
      t('teacherDashboard.groupsDeleteConfirmTitle'),
      t('teacherDashboard.groupsDeleteConfirmBody', { name: displayTitle }),
      [
        { text: t('teacherDashboard.groupsCancel'), style: 'cancel' },
        {
          text: t('teacherDashboard.groupsDeleteConfirmAction'),
          style: 'destructive',
          onPress: () => void runDelete(),
        },
      ],
    );
  };

  const runDelete = async () => {
    const { error } = await teacherDeletePersonalGroup(groupId);
    if (error) {
      appAlert(t('teacherDashboard.groupsSaveErrorTitle'), error);
      return;
    }
    routerBackOrReplace(router, appHref(AppRoutes.teacherDashboard));
  };

  const parsed = parseTeacherGroupParams(params);
  const menuCtx: TeacherGroupRouteContext = {
    source: parsed.source,
    groupId: parsed.groupId.length > 0 ? parsed.groupId : 'draft',
    title: displayTitle,
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardExtraPadding={32}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('teacherDashboard.groupsDetailBackA11y')}
            onPress={() => routerBackOrReplace(router, appHref(AppRoutes.teacherDashboard))}
            style={({ pressed }) => [styles.backRow, pressed && styles.backRowPressed]}>
            <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
            <Text style={styles.backLabel}>{t('auth.back')}</Text>
          </Pressable>
          <Text style={styles.pageTitle} numberOfLines={4}>
            {displayTitle}
          </Text>
          <View style={styles.titleDivider} />
        </View>

        {isPersonal ? (
          <View style={styles.actionsCard}>
            <Pressable
              accessibilityRole="button"
              onPress={openEditModal}
              style={({ pressed }) => [styles.manageBtn, pressed && styles.manageBtnPressed]}>
              <Ionicons name="pencil-outline" size={17} color={BRAND_BLUE} />
              <Text style={styles.manageBtnText}>{t('teacherDashboard.groupsEditPersonal')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={confirmDelete}
              style={({ pressed }) => [styles.manageBtnDanger, pressed && styles.manageBtnPressed]}>
              <Ionicons name="trash-outline" size={17} color="#B91C1C" />
              <Text style={styles.manageBtnTextDanger}>{t('teacherDashboard.groupsDeletePersonal')}</Text>
            </Pressable>
          </View>
        ) : null}

        <TeacherGroupDetailMenu ctx={menuCtx} />
      </KeyboardAwareScrollView>

      <Modal visible={editModalVisible} animationType="slide" transparent onRequestClose={closeEditModal}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalBackdrop} onPress={() => !formBusy && closeEditModal()} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('teacherDashboard.groupsModalEditTitle')}</Text>

            <Text style={styles.modalLabel}>{t('teacherDashboard.groupsNameLabel')}</Text>
            <TextInput
              value={formName}
              onChangeText={setFormName}
              placeholder={t('teacherDashboard.groupsNamePlaceholder')}
              placeholderTextColor="#94A3B8"
              editable={!formBusy}
              style={styles.modalInput}
            />

            <Text style={[styles.modalLabel, styles.modalLabelSp]}>{t('teacherDashboard.groupsDescLabel')}</Text>
            <TextInput
              value={formDesc}
              onChangeText={setFormDesc}
              placeholder={t('teacherDashboard.groupsDescPlaceholder')}
              placeholderTextColor="#94A3B8"
              editable={!formBusy}
              multiline
              style={[styles.modalInput, styles.modalInputMulti]}
            />

            <View style={styles.modalActions}>
              <Pressable
                disabled={formBusy}
                onPress={closeEditModal}
                style={({ pressed }) => [styles.modalSecondary, pressed && styles.modalSecondaryPressed]}>
                <Text style={styles.modalSecondaryText}>{t('teacherDashboard.groupsCancel')}</Text>
              </Pressable>
              <Pressable
                disabled={formBusy}
                onPress={() => void submitEdit()}
                style={({ pressed }) => [styles.modalPrimary, pressed && !formBusy && styles.modalPrimaryPressed]}>
                {formBusy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalPrimaryText}>{t('teacherDashboard.groupsSave')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingBottom: 28,
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: '#FFFFFF',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    paddingVertical: 6,
    paddingRight: 12,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {}),
  },
  backRowPressed: { opacity: 0.75 },
  backLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
  pageTitle: {
    marginTop: 14,
    fontSize: Platform.OS === 'web' ? 32 : 26,
    fontWeight: '900',
    color: BRAND_BLUE_DARK,
    lineHeight: Platform.OS === 'web' ? 40 : 32,
    letterSpacing: -0.4,
  },
  titleDivider: {
    marginTop: 18,
    height: 3,
    width: 56,
    borderRadius: 999,
    backgroundColor: BRAND_BLUE,
  },
  actionsCard: {
    marginHorizontal: 18,
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#FFFFFF',
  },
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: PAGE_SURFACE,
  },
  manageBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  manageBtnPressed: { opacity: 0.88 },
  manageBtnText: { fontSize: 13, fontWeight: '800', color: BRAND_BLUE },
  manageBtnTextDanger: { fontSize: 13, fontWeight: '800', color: '#B91C1C' },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    borderTopWidth: 1.5,
    borderColor: BORDER,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: BRAND_BLUE_DARK, marginBottom: 14 },
  modalLabel: { fontSize: 13, fontWeight: '700', color: BRAND_BLUE_DARK, marginBottom: 6 },
  modalLabelSp: { marginTop: 10 },
  modalInput: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: BRAND_BLUE_DARK,
    backgroundColor: PAGE_SURFACE,
  },
  modalInputMulti: { minHeight: 80, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalSecondary: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: PAGE_SURFACE,
  },
  modalSecondaryPressed: { opacity: 0.85 },
  modalSecondaryText: { fontWeight: '800', fontSize: 15, color: BRAND_BLUE_DARK },
  modalPrimary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
    minHeight: 48,
  },
  modalPrimaryPressed: { opacity: 0.9 },
  modalPrimaryText: { fontWeight: '800', fontSize: 15, color: '#FFFFFF' },
});
