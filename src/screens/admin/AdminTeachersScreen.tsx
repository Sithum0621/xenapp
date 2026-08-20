import { Ionicons } from '@expo/vector-icons';
import { EncodingType, cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';

import { NativeFluidFlatList } from '@/src/components/layout/NativeFluidFlatList';
import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';
import { ScrollView } from '@/src/components/layout/scroll';

import {
  instituteAdminAssignTeacher,
  instituteAdminListTeachers,
  instituteAdminSearchTeachersToAssign,
  type InstituteTeacherRow,
} from '@/src/services/instituteAdminTeachersApi';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const TEXT_MUTED = '#64748B';
const SUBTLE_BORDER = '#E2E8F0';
const PAGE_SURFACE = '#F8FAFC';
const COMPACT_BREAKPOINT = 768;
const LIST_LIMIT = 200;

type ModalError = { kind: 'search' | 'assign'; raw: string };

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function displayName(row: InstituteTeacherRow): string {
  const n = row.full_name?.trim();
  if (n) return n;
  return row.email?.trim() || '—';
}

export default function AdminTeachersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isCompact = width < COMPACT_BREAKPOINT;

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [rows, setRows] = useState<InstituteTeacherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [exportBusy, setExportBusy] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalSearchInput, setModalSearchInput] = useState('');
  const [debouncedModalSearch, setDebouncedModalSearch] = useState('');
  const [modalRows, setModalRows] = useState<InstituteTeacherRow[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<ModalError | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedModalSearch(modalSearchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [modalSearchInput]);

  const loadTeachers = useCallback(async () => {
    setListError(null);
    const { rows: next, error } = await instituteAdminListTeachers({
      search: debouncedSearch,
      limit: LIST_LIMIT,
      offset: 0,
    });
    if (error) {
      setListError(error);
      setRows([]);
      return;
    }
    setRows(next);
  }, [debouncedSearch]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await loadTeachers();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTeachers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTeachers();
    setRefreshing(false);
  }, [loadTeachers]);

  const loadModalCandidates = useCallback(async () => {
    setModalError(null);
    setModalLoading(true);
    const { rows: next, error } = await instituteAdminSearchTeachersToAssign({
      search: debouncedModalSearch,
      limit: 30,
    });
    setModalLoading(false);
    if (error) {
      setModalError({ kind: 'search', raw: error });
      setModalRows([]);
      return;
    }
    setModalRows(next);
  }, [debouncedModalSearch]);

  useEffect(() => {
    if (!modalOpen) return;
    void loadModalCandidates();
  }, [modalOpen, debouncedModalSearch, loadModalCandidates]);

  const openModal = () => {
    setModalOpen(true);
    setModalSearchInput('');
    setDebouncedModalSearch('');
    setModalRows([]);
    setModalError(null);
    setModalLoading(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setAssigningId(null);
    setModalError(null);
  };

  const assignTeacher = async (teacherUserId: string) => {
    setModalError(null);
    setAssigningId(teacherUserId);
    const { error } = await instituteAdminAssignTeacher(teacherUserId);
    setAssigningId(null);
    if (error) {
      setModalError({ kind: 'assign', raw: error });
      return;
    }
    setModalRows((prev) => prev.filter((r) => r.user_id !== teacherUserId));
    await loadTeachers();
  };

  const listErrorMessage = useMemo(() => {
    if (!listError) return null;
    const low = listError.toLowerCase();
    if (low.includes('not_institute_admin')) return t('adminPortal.teachersNoInstitute');
    return t('adminPortal.teachersLoadError');
  }, [listError, t]);

  const modalErrorMessage = useMemo(() => {
    if (!modalError) return null;
    const low = modalError.raw.toLowerCase();
    if (low.includes('not_institute_admin')) return t('adminPortal.teachersNoInstitute');
    if (modalError.kind === 'search') return t('adminPortal.teachersModalSearchError');
    if (low.includes('teacher_already_assigned')) return t('adminPortal.teachersTeacherAlreadyAssigned');
    return t('adminPortal.teachersAssignError');
  }, [modalError, t]);

  const buildCsv = useCallback(
    (data: InstituteTeacherRow[]) => {
      const header = [
        escapeCsvCell(t('adminPortal.teachersInventoryColIndex')),
        escapeCsvCell(t('adminPortal.teachersInventoryColName')),
        escapeCsvCell(t('adminPortal.teachersInventoryColEmail')),
        escapeCsvCell(t('adminPortal.teachersInventoryColUserId')),
      ].join(',');
      const lines = data.map((item, index) =>
        [
          escapeCsvCell(String(index + 1)),
          escapeCsvCell(displayName(item)),
          escapeCsvCell(item.email),
          escapeCsvCell(item.user_id),
        ].join(','),
      );
      return '\uFEFF' + header + '\n' + lines.join('\n');
    },
    [t],
  );

  const buildPrintHtml = useCallback(
    (data: InstituteTeacherRow[]) => {
      const title = escapeHtml(t('adminPortal.teachersPrintDocumentTitle'));
      const h = [
        escapeHtml(t('adminPortal.teachersInventoryColIndex')),
        escapeHtml(t('adminPortal.teachersInventoryColName')),
        escapeHtml(t('adminPortal.teachersInventoryColEmail')),
        escapeHtml(t('adminPortal.teachersInventoryColUserId')),
      ];
      const bodyRows = data
        .map(
          (item, index) =>
            `<tr><td>${index + 1}</td><td>${escapeHtml(displayName(item))}</td><td>${escapeHtml(item.email)}</td><td>${escapeHtml(item.user_id)}</td></tr>`,
        )
        .join('');
      return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title><style>
        body{font-family:system-ui,-apple-system,sans-serif;padding:24px;color:#0f172a}
        h1{font-size:20px;margin:0 0 16px;color:#00101F}
        table{border-collapse:collapse;width:100%;font-size:13px}
        th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left;vertical-align:top;word-break:break-all}
        th{background:#f1f5f9;font-weight:700;color:#00101F}
        tr:nth-child(even){background:#f8fafc}
      </style></head><body><h1>${title}</h1><table><thead><tr>${h.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
    },
    [t],
  );

  const onExportExcel = useCallback(async () => {
    if (rows.length === 0 || exportBusy) return;
    setExportBusy(true);
    try {
      const csv = buildCsv(rows);
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `teachers-${stamp}.csv`;

      if (Platform.OS === 'web') {
        if (typeof document !== 'undefined') {
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);
        }
        return;
      }

      const base = cacheDirectory;
      if (!base) return;
      const uri = `${base}${filename}`;
      await writeAsStringAsync(uri, csv, { encoding: EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'text/csv',
          dialogTitle: t('adminPortal.teachersExportExcel'),
          UTI: 'public.comma-separated-values-text',
        });
      }
    } finally {
      setExportBusy(false);
    }
  }, [rows, buildCsv, exportBusy, t]);

  const onPrintList = useCallback(async () => {
    if (rows.length === 0 || printBusy) return;
    setPrintBusy(true);
    try {
      const html = buildPrintHtml(rows);
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          const w = window.open('', '_blank');
          if (w) {
            w.document.write(html);
            w.document.close();
            w.focus();
            w.print();
            w.close();
          }
        }
        return;
      }
      await Print.printAsync({ html });
    } finally {
      setPrintBusy(false);
    }
  }, [rows, buildPrintHtml, printBusy]);

  const goToTeacher = (userId: string) => {
    router.push({ pathname: '/admin-dashboard/teachers/[teacherId]', params: { teacherId: userId } });
  };

  const renderInventoryRow = (item: InstituteTeacherRow, index: number) => {
    const name = displayName(item);
    if (isCompact) {
      return (
        <ScrollFriendlyPressable
          accessibilityRole="button"
          accessibilityLabel={`${name}, ${t('adminPortal.teacherRowOpenDetail')}`}
          onPress={() => goToTeacher(item.user_id)}
          style={styles.invRowCard}
          innerStyle={styles.invRowCardInner}>
          <View style={styles.invRowTop}>
            <Text style={styles.invIndex}>{index + 1}.</Text>
            <Text style={styles.invTitle} numberOfLines={2}>
              {name}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={TEXT_MUTED} />
          </View>
          <Text style={styles.invEmail} numberOfLines={2}>
            {item.email}
          </Text>
          <Text style={styles.invId} numberOfLines={1} selectable>
            {t('adminPortal.teachersInventoryColUserId')}: {item.user_id}
          </Text>
        </ScrollFriendlyPressable>
      );
    }

    return (
      <ScrollFriendlyPressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${t('adminPortal.teacherRowOpenDetail')}`}
        onPress={() => goToTeacher(item.user_id)}
        style={styles.tableRow}
        innerStyle={styles.tableRowInner}>
        <Text style={[styles.cell, styles.cellIndex]}>{index + 1}</Text>
        <Text style={[styles.cell, styles.cellName]} numberOfLines={2}>
          {name}
        </Text>
        <Text style={[styles.cell, styles.cellEmail]} numberOfLines={2}>
          {item.email}
        </Text>
        <Text style={[styles.cell, styles.cellId]} numberOfLines={2} selectable>
          {item.user_id}
        </Text>
        <View style={styles.cellChevron}>
          <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
        </View>
      </ScrollFriendlyPressable>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
      <NativeFluidFlatList
        style={styles.flex}
        data={rows}
        keyExtractor={(item) => item.user_id}
        renderItem={({ item, index }) => renderInventoryRow(item, index)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND_BLUE} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.screen, isCompact ? styles.screenCompact : styles.screenWide]}
        ListHeaderComponent={
          <>
            {!isCompact ? <Text style={styles.pageTitle}>{t('adminPortal.teachersTitle')}</Text> : null}

            <View style={styles.toolbar}>
              <View style={styles.searchWrap}>
                <Ionicons name="search-outline" size={20} color={TEXT_MUTED} style={styles.searchIcon} />
                <TextInput
                  value={searchInput}
                  onChangeText={setSearchInput}
                  placeholder={t('adminPortal.teachersSearchPlaceholder')}
                  placeholderTextColor={TEXT_MUTED}
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                  style={styles.searchInput}
                  accessibilityLabel={t('adminPortal.teachersSearchPlaceholder')}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('adminPortal.teachersAddButton')}
                onPress={openModal}
                style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}>
                <Ionicons name="add" size={22} color="#FFFFFF" />
                <Text style={styles.addBtnLabel}>{t('adminPortal.teachersAddButton')}</Text>
              </Pressable>
            </View>

            <Text style={styles.inventorySectionTitle}>{t('adminPortal.teachersInventoryHeading')}</Text>
            <Text style={styles.inventorySectionHint}>{t('adminPortal.teachersInventoryHint')}</Text>

            <View style={styles.exportToolbar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('adminPortal.teachersExportExcel')}
                disabled={rows.length === 0 || exportBusy}
                onPress={() => void onExportExcel()}
                style={({ pressed }) => [
                  styles.toolbarSecondary,
                  (rows.length === 0 || exportBusy) && styles.toolbarSecondaryDisabled,
                  pressed && rows.length > 0 && !exportBusy && styles.toolbarSecondaryPressed,
                ]}>
                {exportBusy ? (
                  <ActivityIndicator size="small" color={BRAND_BLUE} />
                ) : (
                  <Ionicons name="download-outline" size={20} color={BRAND_BLUE_DARK} />
                )}
                <Text style={styles.toolbarSecondaryLabel}>{t('adminPortal.teachersExportExcel')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('adminPortal.teachersPrintList')}
                disabled={rows.length === 0 || printBusy}
                onPress={() => void onPrintList()}
                style={({ pressed }) => [
                  styles.toolbarSecondary,
                  (rows.length === 0 || printBusy) && styles.toolbarSecondaryDisabled,
                  pressed && rows.length > 0 && !printBusy && styles.toolbarSecondaryPressed,
                ]}>
                {printBusy ? (
                  <ActivityIndicator size="small" color={BRAND_BLUE} />
                ) : (
                  <Ionicons name="print-outline" size={20} color={BRAND_BLUE_DARK} />
                )}
                <Text style={styles.toolbarSecondaryLabel}>{t('adminPortal.teachersPrintList')}</Text>
              </Pressable>
            </View>

            {listErrorMessage ? (
              <View style={styles.banner}>
                <Ionicons name="warning-outline" size={20} color="#B45309" style={styles.bannerIcon} />
                <View style={styles.bannerTextCol}>
                  <Text style={styles.bannerText}>{listErrorMessage}</Text>
                  {listError ? (
                    <Text style={styles.bannerDetail} selectable>
                      {t('adminPortal.teachersErrorDetail')}: {listError}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {!isCompact && rows.length > 0 ? (
              <View style={styles.tableWrap}>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.hCell, styles.cellIndex]}>{t('adminPortal.teachersInventoryColIndex')}</Text>
                  <Text style={[styles.hCell, styles.cellName]}>{t('adminPortal.teachersInventoryColName')}</Text>
                  <Text style={[styles.hCell, styles.cellEmail]}>{t('adminPortal.teachersInventoryColEmail')}</Text>
                  <Text style={[styles.hCell, styles.cellId]}>{t('adminPortal.teachersInventoryColUserId')}</Text>
                  <View style={styles.hCellChevron} />
                </View>
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={BRAND_BLUE} />
              <Text style={styles.centerHint}>{t('adminPortal.teachersLoading')}</Text>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {listError
                  ? t('adminPortal.teachersEmptyWhenError')
                  : debouncedSearch.length > 0
                    ? t('adminPortal.teachersEmptySearch')
                    : t('adminPortal.teachersEmpty')}
              </Text>
            </View>
          )
        }
      />

      <Modal visible={modalOpen} animationType="fade" transparent onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalBackdrop} accessibilityLabel={t('adminPortal.teachersCloseModal')} onPress={closeModal} />
          <View style={styles.modalCard} accessibilityViewIsModal>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('adminPortal.teachersModalTitle')}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('adminPortal.teachersCloseModal')}
                onPress={closeModal}
                style={({ pressed }) => [styles.modalClose, pressed && styles.modalClosePressed]}>
                <Ionicons name="close" size={26} color={BRAND_BLUE_DARK} />
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>{t('adminPortal.teachersModalSubtitle')}</Text>

            <View style={styles.modalSearchWrap}>
              <Ionicons name="search-outline" size={20} color={TEXT_MUTED} style={styles.searchIcon} />
              <TextInput
                value={modalSearchInput}
                onChangeText={setModalSearchInput}
                placeholder={t('adminPortal.teachersModalSearchPlaceholder')}
                placeholderTextColor={TEXT_MUTED}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.searchInput}
              />
            </View>

            {modalErrorMessage ? (
              <View style={styles.banner}>
                <Ionicons name="warning-outline" size={20} color="#B45309" style={styles.bannerIcon} />
                <View style={styles.bannerTextCol}>
                  <Text style={styles.bannerText}>{modalErrorMessage}</Text>
                  {modalError ? (
                    <Text style={styles.bannerDetail} selectable>
                      {t('adminPortal.teachersErrorDetail')}: {modalError.raw}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            <Text style={styles.modalHint}>{t('adminPortal.teachersModalHint')}</Text>

            {modalLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="small" color={BRAND_BLUE} />
              </View>
            ) : (
              <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
                {!modalError && modalRows.length === 0 ? (
                  <Text style={styles.modalEmpty}>{t('adminPortal.teachersModalEmpty')}</Text>
                ) : null}
                {modalRows.map((item) => {
                  const busy = assigningId === item.user_id;
                  return (
                    <View key={item.user_id} style={styles.modalRow}>
                      <View style={styles.modalRowText}>
                        <Text style={styles.modalRowTitle} numberOfLines={1}>
                          {displayName(item)}
                        </Text>
                        <Text style={styles.modalRowSub} numberOfLines={1}>
                          {item.email}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy || assigningId !== null}
                        onPress={() => void assignTeacher(item.user_id)}
                        style={({ pressed }) => [
                          styles.assignBtn,
                          (busy || assigningId !== null) && styles.assignBtnDisabled,
                          pressed && !busy && assigningId === null && styles.assignBtnPressed,
                        ]}>
                        {busy ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.assignBtnLabel}>{t('adminPortal.teachersAssign')}</Text>
                        )}
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    flexGrow: 1,
  },
  screenCompact: { paddingTop: 8, paddingHorizontal: 16 },
  screenWide: { paddingTop: 16 },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    marginBottom: 16,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  searchWrap: {
    flex: 1,
    minWidth: 160,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    minHeight: 48,
  },
  modalSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 14,
    backgroundColor: PAGE_SURFACE,
    paddingHorizontal: 12,
    minHeight: 48,
    marginBottom: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#0F172A',
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND_BLUE,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  addBtnPressed: { opacity: 0.9 },
  addBtnLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  inventorySectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    marginBottom: 4,
  },
  inventorySectionHint: {
    fontSize: 14,
    color: TEXT_MUTED,
    marginBottom: 12,
    lineHeight: 20,
  },
  exportToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
    alignItems: 'center',
  },
  toolbarSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#FFFFFF',
  },
  toolbarSecondaryPressed: { opacity: 0.9 },
  toolbarSecondaryDisabled: { opacity: 0.45 },
  toolbarSecondaryLabel: { fontSize: 14, fontWeight: '700', color: BRAND_BLUE_DARK },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 12,
  },
  bannerIcon: { marginTop: 2 },
  bannerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  bannerText: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
  },
  bannerDetail: {
    marginTop: 6,
    fontSize: 12,
    color: '#78350F',
    lineHeight: 16,
  },
  centerBox: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  centerHint: {
    fontSize: 15,
    color: TEXT_MUTED,
  },
  listContent: { paddingBottom: 8 },
  tableWrap: {
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: PAGE_SURFACE,
    borderBottomWidth: 1.5,
    borderBottomColor: SUBTLE_BORDER,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  hCell: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  hCellChevron: { width: 28 },
  tableRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SUBTLE_BORDER,
    backgroundColor: '#FFFFFF',
  },
  tableRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  tableRowPressed: { backgroundColor: '#F1F5F9' },
  cell: { fontSize: 14, color: '#0F172A', paddingHorizontal: 4 },
  cellIndex: { width: 36, textAlign: 'center', fontVariant: ['tabular-nums'] },
  cellName: { flex: 1.4, minWidth: 0, fontWeight: '700', color: BRAND_BLUE_DARK },
  cellEmail: { flex: 1.6, minWidth: 0, color: TEXT_MUTED },
  cellId: { flex: 1.4, minWidth: 0, fontSize: 12, color: TEXT_MUTED },
  cellChevron: { width: 28, alignItems: 'center', justifyContent: 'center' },
  invRowCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    overflow: 'hidden',
  },
  invRowCardInner: {
    padding: 14,
  },
  invRowCardPressed: { backgroundColor: '#F8FAFC' },
  invRowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  invIndex: { fontSize: 14, fontWeight: '800', color: TEXT_MUTED, width: 28 },
  invTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: BRAND_BLUE_DARK },
  invEmail: { marginTop: 8, fontSize: 14, color: TEXT_MUTED },
  invId: { marginTop: 6, fontSize: 11, color: TEXT_MUTED },
  emptyCard: {
    marginTop: 8,
    padding: 24,
    borderRadius: 16,
    backgroundColor: PAGE_SURFACE,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
  },
  emptyText: {
    fontSize: 15,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  modalCard: {
    zIndex: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    maxHeight: '88%' as unknown as number,
    width: '100%' as unknown as number,
    maxWidth: 520,
    alignSelf: 'center',
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    ...Platform.select({
      web: { boxShadow: '0 16px 48px rgba(15, 23, 42, 0.12)' } as object,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
        elevation: 12,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  modalTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
  },
  modalClose: {
    padding: 4,
    borderRadius: 10,
  },
  modalClosePressed: {
    backgroundColor: PAGE_SURFACE,
  },
  modalSubtitle: {
    fontSize: 14,
    color: TEXT_MUTED,
    lineHeight: 20,
    marginBottom: 14,
  },
  modalHint: {
    fontSize: 13,
    color: TEXT_MUTED,
    marginBottom: 10,
    lineHeight: 18,
  },
  modalLoading: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  modalList: {
    maxHeight: 320,
  },
  modalEmpty: {
    textAlign: 'center',
    color: TEXT_MUTED,
    paddingVertical: 24,
    fontSize: 15,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SUBTLE_BORDER,
  },
  modalRowText: { flex: 1, minWidth: 0 },
  modalRowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  modalRowSub: {
    marginTop: 2,
    fontSize: 14,
    color: TEXT_MUTED,
  },
  assignBtn: {
    backgroundColor: BRAND_BLUE,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignBtnPressed: { opacity: 0.92 },
  assignBtnDisabled: { opacity: 0.55 },
  assignBtnLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
