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
  instituteAdminCreateLectureGroup,
  instituteAdminListLectureGroups,
  type LectureGroupRow,
} from '@/src/services/instituteAdminLectureGroupsApi';
import { instituteAdminListTeachers, type InstituteTeacherRow } from '@/src/services/instituteAdminTeachersApi';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const TEXT_MUTED = '#64748B';
const SUBTLE_BORDER = '#E2E8F0';
const PAGE_SURFACE = '#F8FAFC';
const COMPACT_BREAKPOINT = 768;
const LIST_LIMIT = 200;

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

function teacherDisplayName(t: InstituteTeacherRow): string {
  const n = t.full_name?.trim();
  if (n) return n;
  return t.email?.trim() || '—';
}

function formatCreatedAt(iso: string, locale: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function AdminGroupsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isCompact = width < COMPACT_BREAKPOINT;

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [rows, setRows] = useState<LectureGroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [addFormOpen, setAddFormOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [instituteTeachers, setInstituteTeachers] = useState<InstituteTeacherRow[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(true);
  const [primaryTeacherId, setPrimaryTeacherId] = useState<string | null>(null);
  const [teacherPickerOpen, setTeacherPickerOpen] = useState(false);
  const [teacherFilter, setTeacherFilter] = useState('');

  const [exportBusy, setExportBusy] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);

  useEffect(() => {
    const tmr = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(tmr);
  }, [searchInput]);

  const loadGroups = useCallback(async () => {
    setListError(null);
    const { rows: next, error } = await instituteAdminListLectureGroups({
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
      setTeachersLoading(true);
      const { rows, error } = await instituteAdminListTeachers({ search: '', limit: 200, offset: 0 });
      if (!cancelled) {
        setTeachersLoading(false);
        if (error) setInstituteTeachers([]);
        else setInstituteTeachers(rows);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await loadGroups();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadGroups]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadGroups();
    setRefreshing(false);
  }, [loadGroups]);

  const closeAddModal = useCallback(() => {
    setAddFormOpen(false);
    setCreateError(null);
  }, []);

  const onCreate = async () => {
    setCreateError(null);
    const name = newName.trim();
    if (!name) {
      setCreateError(t('adminPortal.groupsNameRequired'));
      return;
    }
    if (!primaryTeacherId) {
      setCreateError(t('adminPortal.groupsPrimaryTeacherRequired'));
      return;
    }
    setCreating(true);
    const { error } = await instituteAdminCreateLectureGroup({
      name,
      description: newDesc.trim() || undefined,
      primary_teacher_user_id: primaryTeacherId,
    });
    setCreating(false);
    if (error) {
      setCreateError(error);
      return;
    }
    setNewName('');
    setNewDesc('');
    setPrimaryTeacherId(null);
    closeAddModal();
    await loadGroups();
  };

  const filteredTeachers = useMemo(() => {
    const q = teacherFilter.trim().toLowerCase();
    if (!q) return instituteTeachers;
    return instituteTeachers.filter(
      (row) =>
        row.email.toLowerCase().includes(q) ||
        (row.full_name ?? '').toLowerCase().includes(q),
    );
  }, [instituteTeachers, teacherFilter]);

  const selectedTeacherLabel = useMemo(() => {
    if (!primaryTeacherId) return null;
    const row = instituteTeachers.find((x) => x.user_id === primaryTeacherId);
    return row ? teacherDisplayName(row) : null;
  }, [instituteTeachers, primaryTeacherId]);

  const locale = i18n.language || 'en';

  const buildCsv = useCallback(
    (data: LectureGroupRow[]) => {
      const header = [
        escapeCsvCell(t('adminPortal.groupsInventoryColIndex')),
        escapeCsvCell(t('adminPortal.groupsInventoryColName')),
        escapeCsvCell(t('adminPortal.groupsInventoryColPrimary')),
        escapeCsvCell(t('adminPortal.groupsInventoryColDescription')),
        escapeCsvCell(t('adminPortal.groupsInventoryColId')),
        escapeCsvCell(t('adminPortal.groupsInventoryColCreated')),
      ].join(',');
      const lines = data.map((item, index) =>
        [
          escapeCsvCell(String(index + 1)),
          escapeCsvCell(item.name),
          escapeCsvCell(item.primary_teacher_full_name ?? ''),
          escapeCsvCell(item.description ?? ''),
          escapeCsvCell(item.id),
          escapeCsvCell(formatCreatedAt(item.created_at, locale)),
        ].join(','),
      );
      return '\uFEFF' + header + '\n' + lines.join('\n');
    },
    [t, locale],
  );

  const buildPrintHtml = useCallback(
    (data: LectureGroupRow[]) => {
      const title = escapeHtml(t('adminPortal.groupsPrintDocumentTitle'));
      const h = [
        escapeHtml(t('adminPortal.groupsInventoryColIndex')),
        escapeHtml(t('adminPortal.groupsInventoryColName')),
        escapeHtml(t('adminPortal.groupsInventoryColPrimary')),
        escapeHtml(t('adminPortal.groupsInventoryColDescription')),
        escapeHtml(t('adminPortal.groupsInventoryColCreated')),
      ];
      const bodyRows = data
        .map(
          (item, index) =>
            `<tr><td>${index + 1}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.primary_teacher_full_name ?? '')}</td><td>${escapeHtml(item.description ?? '')}</td><td>${escapeHtml(formatCreatedAt(item.created_at, locale))}</td></tr>`,
        )
        .join('');
      return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title><style>
        body{font-family:system-ui,-apple-system,sans-serif;padding:24px;color:#0f172a}
        h1{font-size:20px;margin:0 0 16px;color:#00101F}
        table{border-collapse:collapse;width:100%;font-size:13px}
        th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left;vertical-align:top}
        th{background:#f1f5f9;font-weight:700;color:#00101F}
        tr:nth-child(even){background:#f8fafc}
      </style></head><body><h1>${title}</h1><table><thead><tr>${h.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
    },
    [t, locale],
  );

  const onExportExcel = useCallback(async () => {
    if (rows.length === 0 || exportBusy) return;
    setExportBusy(true);
    try {
      const csv = buildCsv(rows);
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `lecture-groups-${stamp}.csv`;

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
          dialogTitle: t('adminPortal.groupsExportExcel'),
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

  const goToManage = (id: string) => {
    router.push({ pathname: '/admin-dashboard/groups/[groupId]', params: { groupId: id } });
  };

  const renderInventoryRow = (item: LectureGroupRow, index: number) => {
    const primary = item.primary_teacher_full_name
      ? t('adminPortal.groupsRowPrimary', { name: item.primary_teacher_full_name })
      : '—';
    const created = formatCreatedAt(item.created_at, locale);

    if (isCompact) {
      return (
        <ScrollFriendlyPressable
          accessibilityRole="button"
          onPress={() => goToManage(item.id)}
          style={styles.invRowCard}
          innerStyle={styles.invRowCardInner}>
          <View style={styles.invRowTop}>
            <Text style={styles.invIndex}>{index + 1}.</Text>
            <Text style={styles.invTitle} numberOfLines={2}>
              {item.name}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={TEXT_MUTED} />
          </View>
          <Text style={styles.invMeta}>{primary}</Text>
          {item.description ? (
            <Text style={styles.invDesc} numberOfLines={3}>
              {item.description}
            </Text>
          ) : null}
          <Text style={styles.invCreated}>
            {t('adminPortal.groupsInventoryColCreated')}: {created}
          </Text>
        </ScrollFriendlyPressable>
      );
    }

    return (
      <ScrollFriendlyPressable
        accessibilityRole="button"
        onPress={() => goToManage(item.id)}
        style={styles.tableRow}
        innerStyle={styles.tableRowInner}>
        <Text style={[styles.cell, styles.cellIndex]}>{index + 1}</Text>
        <Text style={[styles.cell, styles.cellName]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={[styles.cell, styles.cellPrimary]} numberOfLines={2}>
          {item.primary_teacher_full_name ?? '—'}
        </Text>
        <Text style={[styles.cell, styles.cellDesc]} numberOfLines={2}>
          {item.description ?? '—'}
        </Text>
        <Text style={[styles.cell, styles.cellDate]} numberOfLines={2}>
          {created}
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
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => renderInventoryRow(item, index)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND_BLUE} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.screen, isCompact ? styles.screenCompact : styles.screenWide]}
        ListHeaderComponent={
          <>
            {!isCompact ? <Text style={styles.pageTitle}>{t('adminPortal.groupsTitle')}</Text> : null}

            <View style={styles.toolbar}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setAddFormOpen(true);
                  setCreateError(null);
                }}
                style={({ pressed }) => [styles.toolbarPrimary, pressed && styles.toolbarPrimaryPressed]}>
                <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
                <Text style={styles.toolbarPrimaryLabel}>{t('adminPortal.groupsAddNewButton')}</Text>
              </Pressable>
              <View style={styles.toolbarActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('adminPortal.groupsExportExcel')}
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
                  <Text style={styles.toolbarSecondaryLabel}>{t('adminPortal.groupsExportExcel')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('adminPortal.groupsPrintList')}
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
                  <Text style={styles.toolbarSecondaryLabel}>{t('adminPortal.groupsPrintList')}</Text>
                </Pressable>
              </View>
            </View>

            <Text style={styles.inventorySectionTitle}>{t('adminPortal.groupsInventoryHeading')}</Text>
            <Text style={styles.inventorySectionHint}>{t('adminPortal.groupsInventoryHint')}</Text>

            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={20} color={TEXT_MUTED} style={styles.searchIcon} />
              <TextInput
                value={searchInput}
                onChangeText={setSearchInput}
                placeholder={t('adminPortal.groupsSearchPlaceholder')}
                placeholderTextColor={TEXT_MUTED}
                style={styles.searchInput}
              />
            </View>

            {listError ? (
              <View style={styles.banner}>
                <Ionicons name="warning-outline" size={20} color="#B45309" />
                <Text style={styles.bannerText}>{t('adminPortal.groupsLoadError')}</Text>
                <Text style={styles.bannerDetail} selectable>
                  {listError}
                </Text>
              </View>
            ) : null}

            {!isCompact && rows.length > 0 ? (
              <View style={styles.tableWrap}>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.hCell, styles.cellIndex]}>{t('adminPortal.groupsInventoryColIndex')}</Text>
                  <Text style={[styles.hCell, styles.cellName]}>{t('adminPortal.groupsInventoryColName')}</Text>
                  <Text style={[styles.hCell, styles.cellPrimary]}>{t('adminPortal.groupsInventoryColPrimary')}</Text>
                  <Text style={[styles.hCell, styles.cellDesc]}>{t('adminPortal.groupsInventoryColDescription')}</Text>
                  <Text style={[styles.hCell, styles.cellDate]}>{t('adminPortal.groupsInventoryColCreated')}</Text>
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
              <Text style={styles.centerHint}>{t('adminPortal.groupsLoading')}</Text>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {debouncedSearch.length > 0 ? t('adminPortal.groupsEmptySearch') : t('adminPortal.groupsEmpty')}
              </Text>
            </View>
          )
        }
      />

      <Modal visible={addFormOpen} animationType="fade" transparent onRequestClose={closeAddModal}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 48 : 0}>
          <Pressable style={styles.modalBackdrop} onPress={closeAddModal} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.addModalScroll}
            style={styles.addModalScrollView}>
            <View style={styles.addModalCard}>
              <View style={styles.addModalTitleRow}>
                <Text style={styles.modalTitle}>{t('adminPortal.groupsFormTitle')}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={closeAddModal}
                  hitSlop={12}
                  style={({ pressed }) => [styles.addModalClose, pressed && { opacity: 0.7 }]}>
                  <Ionicons name="close" size={26} color={BRAND_BLUE_DARK} />
                </Pressable>
              </View>
              <Text style={styles.label}>{t('adminPortal.groupsNameLabel')}</Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder={t('adminPortal.groupsNamePlaceholder')}
                placeholderTextColor={TEXT_MUTED}
                style={styles.input}
              />
              <Text style={styles.label}>{t('adminPortal.groupsDescLabel')}</Text>
              <TextInput
                value={newDesc}
                onChangeText={setNewDesc}
                placeholder={t('adminPortal.groupsDescPlaceholder')}
                placeholderTextColor={TEXT_MUTED}
                multiline
                style={[styles.input, styles.inputMultiline]}
              />
              <Text style={styles.label}>{t('adminPortal.groupsPrimaryTeacherLabel')}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setTeacherPickerOpen(true)}
                style={({ pressed }) => [styles.selectBtn, pressed && styles.selectBtnPressed]}>
                <Text style={styles.selectBtnText} numberOfLines={1}>
                  {selectedTeacherLabel ?? t('adminPortal.groupsPrimaryTeacherPlaceholder')}
                </Text>
                <Ionicons name="chevron-down" size={20} color={BRAND_BLUE_DARK} />
              </Pressable>
              {teachersLoading ? (
                <Text style={styles.teachersHint}>{t('adminPortal.groupsTeachersLoading')}</Text>
              ) : instituteTeachers.length === 0 ? (
                <Text style={styles.teachersHint}>{t('adminPortal.groupsNoTeachersForPicker')}</Text>
              ) : null}
              {createError ? (
                <Text style={styles.createErr} selectable>
                  {createError}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={creating}
                onPress={() => void onCreate()}
                style={({ pressed }) => [styles.primaryBtn, pressed && !creating && styles.primaryBtnPressed, creating && styles.primaryBtnDisabled]}>
                {creating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnLabel}>{t('adminPortal.groupsAddButton')}</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={teacherPickerOpen} animationType="fade" transparent onRequestClose={() => setTeacherPickerOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setTeacherPickerOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('adminPortal.groupsPrimaryTeacherLabel')}</Text>
            <Text style={styles.modalSub}>{t('adminPortal.groupsPrimaryTeacherModalHint')}</Text>
            <View style={styles.modalSearch}>
              <Ionicons name="search-outline" size={18} color={TEXT_MUTED} />
              <TextInput
                value={teacherFilter}
                onChangeText={setTeacherFilter}
                placeholder={t('adminPortal.teachersSearchPlaceholder')}
                placeholderTextColor={TEXT_MUTED}
                style={styles.modalSearchInput}
              />
            </View>
            <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
              {filteredTeachers.map((row) => (
                <Pressable
                  key={row.user_id}
                  onPress={() => {
                    setPrimaryTeacherId(row.user_id);
                    setTeacherPickerOpen(false);
                    setTeacherFilter('');
                  }}
                  style={({ pressed }) => [styles.modalRow, pressed && styles.modalRowPressed]}>
                  <Text style={styles.modalRowTitle}>{teacherDisplayName(row)}</Text>
                  <Text style={styles.modalRowSub} numberOfLines={1}>
                    {row.email}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              onPress={() => setTeacherPickerOpen(false)}
              style={({ pressed }) => [styles.modalDone, pressed && styles.modalDonePressed]}>
              <Text style={styles.modalDoneText}>{t('adminPortal.groupsPickerDone')}</Text>
            </Pressable>
          </View>
        </View>
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
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  toolbarPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BRAND_BLUE,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  toolbarPrimaryPressed: { opacity: 0.92 },
  toolbarPrimaryLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  toolbarActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
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
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
    fontSize: 16,
    color: '#0F172A',
    backgroundColor: PAGE_SURFACE,
  },
  inputMultiline: {
    minHeight: 88,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  createErr: {
    marginTop: 8,
    fontSize: 13,
    color: '#B45309',
  },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: BRAND_BLUE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnPressed: { opacity: 0.92 },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    minHeight: 48,
    marginBottom: 16,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, color: '#0F172A', paddingVertical: Platform.OS === 'web' ? 10 : 8 },
  banner: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 12,
    gap: 4,
  },
  bannerText: { fontSize: 14, color: '#92400E', fontWeight: '600' },
  bannerDetail: { fontSize: 12, color: '#78350F' },
  centerBox: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  centerHint: { fontSize: 15, color: TEXT_MUTED },
  listContent: { paddingBottom: 24, flexGrow: 1 },
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
  cellIndex: { width: 32, textAlign: 'center', fontVariant: ['tabular-nums'] },
  cellName: { flex: 2.2, minWidth: 0 },
  cellPrimary: { flex: 1.6, minWidth: 0, fontWeight: '600', color: BRAND_BLUE },
  cellDesc: { flex: 2, minWidth: 0, color: TEXT_MUTED },
  cellDate: { flex: 1.4, minWidth: 0, fontSize: 12, color: TEXT_MUTED },
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
  invMeta: { marginTop: 6, fontSize: 13, fontWeight: '700', color: BRAND_BLUE },
  invDesc: { marginTop: 4, fontSize: 14, color: TEXT_MUTED, lineHeight: 20 },
  invCreated: { marginTop: 8, fontSize: 12, color: TEXT_MUTED },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
    backgroundColor: PAGE_SURFACE,
    gap: 8,
  },
  selectBtnPressed: { opacity: 0.9 },
  selectBtnText: { flex: 1, fontSize: 16, color: '#0F172A' },
  teachersHint: { marginTop: 6, fontSize: 13, color: TEXT_MUTED },
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
  addModalScrollView: { zIndex: 2, maxHeight: '100%' },
  addModalScroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 20 },
  addModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    maxHeight: '90%' as unknown as number,
  },
  addModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  addModalClose: { padding: 4 },
  modalCard: {
    maxHeight: '80%' as unknown as number,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    zIndex: 2,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    marginBottom: 6,
    flex: 1,
  },
  modalSub: { fontSize: 13, color: TEXT_MUTED, marginBottom: 12, lineHeight: 18 },
  modalSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 12,
    paddingHorizontal: 10,
    marginBottom: 10,
    gap: 8,
  },
  modalSearchInput: { flex: 1, fontSize: 15, paddingVertical: 8, color: '#0F172A' },
  modalList: { maxHeight: 280 },
  modalRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SUBTLE_BORDER,
  },
  modalRowPressed: { backgroundColor: PAGE_SURFACE },
  modalRowTitle: { fontSize: 16, fontWeight: '700', color: BRAND_BLUE_DARK },
  modalRowSub: { marginTop: 2, fontSize: 13, color: TEXT_MUTED },
  modalDone: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: PAGE_SURFACE,
  },
  modalDonePressed: { opacity: 0.88 },
  modalDoneText: { fontSize: 16, fontWeight: '700', color: BRAND_BLUE_DARK },
  emptyCard: {
    padding: 24,
    borderRadius: 16,
    backgroundColor: PAGE_SURFACE,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
  },
  emptyText: { fontSize: 15, color: TEXT_MUTED, textAlign: 'center', lineHeight: 22 },
});
