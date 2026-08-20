import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import {
  ScheduleDatePickerField,
  ScheduleTimePickerField,
} from '@/src/components/teacher/groupDetail/SchedulePickerFields';
import {
  deleteSchedule,
  fetchSchedules,
  insertOneTimeSchedule,
  insertWeeklySchedule,
} from '@/src/services/teacherGroupWorkspaceApi';
import { formatScheduleClockTime } from '@/src/services/instituteAdminDashboardApi';
import type { TeacherGroupRouteContext } from '@/src/utils/teacherGroupRouteParams';
import { jsDowToWeekdayKey, type WeekdayKey } from '@/src/utils/teacherGroupRouteParams';
import {
  clock24ToTime12Parts,
  combineDateParts,
  combineTime12Parts,
  filterActiveScheduleListRows,
  todayDateParts,
  validateCombinedTimes,
  type ScheduleDateParts,
  type ScheduleTime12Parts,
} from '@/src/utils/scheduleFormParts';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const BORDER = '#E2E8F0';
const PAGE_SURFACE = '#F8FAFC';
const TEXT_MUTED = '#64748B';

const WEEKDAY_KEYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

type Props = { ctx: TeacherGroupRouteContext };

export default function TeacherGroupSchedulePanel({ ctx }: Props) {
  const { t, i18n } = useTranslation();
  const gd = (k: string, o?: Record<string, unknown>) => t(`teacherDashboard.groupDetail.${k}`, o);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchSchedules>>['rows']>([]);

  const [regularDay, setRegularDay] = useState<WeekdayKey>('mon');
  const [regularStartParts, setRegularStartParts] = useState<ScheduleTime12Parts>(() =>
    clock24ToTime12Parts('09:00'),
  );
  const [regularEndParts, setRegularEndParts] = useState<ScheduleTime12Parts>(() =>
    clock24ToTime12Parts('10:00'),
  );

  const [extraDateParts, setExtraDateParts] = useState<ScheduleDateParts>(() => todayDateParts());
  const [extraStartParts, setExtraStartParts] = useState<ScheduleTime12Parts>(() =>
    clock24ToTime12Parts('15:30'),
  );
  const [extraEndParts, setExtraEndParts] = useState<ScheduleTime12Parts>(() =>
    clock24ToTime12Parts('16:30'),
  );
  const [weeklyFormErr, setWeeklyFormErr] = useState<string | null>(null);
  const [extraFormErr, setExtraFormErr] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [savingWeekly, setSavingWeekly] = useState(false);
  const [savingExtra, setSavingExtra] = useState(false);
  const [weeklyFormOpen, setWeeklyFormOpen] = useState(false);
  const [listNow, setListNow] = useState(() => new Date());

  const visibleRows = useMemo(
    () => filterActiveScheduleListRows(rows, listNow),
    [rows, listNow],
  );

  useEffect(() => {
    const timer = setInterval(() => setListNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const scheduleErrorMessage = (code: string) => {
    switch (code) {
      case 'schedule_time_conflict':
        return gd('scheduleTimeConflict');
      case 'schedule_end_before_start':
        return gd('scheduleEndBeforeStart');
      case 'schedule_invalid_date':
      case 'invalid_date':
        return gd('scheduleDateInvalid');
      case 'invalid_time':
        return gd('scheduleInvalidTime12');
      case 'end_before_start':
        return gd('scheduleEndBeforeStart');
      case 'schedule_not_found':
        return gd('scheduleNotFound');
      default:
        return code;
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { rows: r, error: e } = await fetchSchedules(ctx);
    if (e) setError(e);
    else setRows(r);
    setLoading(false);
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  const onDelete = (id: string) => {
    setDeleteTargetId(id);
  };

  const closeDeleteModal = () => {
    if (deletingId) return;
    setDeleteTargetId(null);
  };

  const confirmDelete = () => {
    if (!deleteTargetId || deletingId) return;
    const id = deleteTargetId;
    setDeletingId(id);
    void (async () => {
      const { error: delErr } = await deleteSchedule(id);
      setDeletingId(null);
      setDeleteTargetId(null);
      if (delErr) {
        const msg = scheduleErrorMessage(delErr);
        appAlert(gd('workspaceError'), msg);
        return;
      }
      void load();
    })();
  };

  const pickerLabels = {
    date: gd('schedulePickDate'),
    time: gd('schedulePickTime'),
    done: gd('schedulePickerDone'),
    cancel: gd('scheduleFormCancel'),
  };
  const ampmLabels = { am: gd('scheduleAm'), pm: gd('schedulePm') };

  const saveWeekly = async () => {
    setWeeklyFormErr(null);

    const startResult = combineTime12Parts(regularStartParts);
    if ('error' in startResult) {
      setWeeklyFormErr(scheduleErrorMessage(startResult.error));
      return;
    }

    const endResult = combineTime12Parts(regularEndParts);
    if ('error' in endResult) {
      setWeeklyFormErr(scheduleErrorMessage(endResult.error));
      return;
    }

    const timeErr = validateCombinedTimes(startResult.hhmm, endResult.hhmm);
    if (timeErr) {
      setWeeklyFormErr(scheduleErrorMessage(timeErr));
      return;
    }

    setSavingWeekly(true);
    const { error: err } = await insertWeeklySchedule(
      ctx,
      regularDay,
      startResult.hhmm,
      endResult.hhmm,
    );
    setSavingWeekly(false);
    if (err) {
      setWeeklyFormErr(scheduleErrorMessage(err));
      return;
    }
    appAlert(gd('scheduleSavedTitle'), gd('scheduleSavedBodySynced'));
    setWeeklyFormOpen(false);
    setWeeklyFormErr(null);
    setRegularStartParts(clock24ToTime12Parts('09:00'));
    setRegularEndParts(clock24ToTime12Parts('10:00'));
    void load();
  };

  const saveExtra = async () => {
    setExtraFormErr(null);

    const dateResult = combineDateParts(extraDateParts);
    if ('error' in dateResult) {
      setExtraFormErr(scheduleErrorMessage(dateResult.error));
      return;
    }

    const startResult = combineTime12Parts(extraStartParts);
    if ('error' in startResult) {
      setExtraFormErr(scheduleErrorMessage(startResult.error));
      return;
    }

    const endResult = combineTime12Parts(extraEndParts);
    if ('error' in endResult) {
      setExtraFormErr(scheduleErrorMessage(endResult.error));
      return;
    }

    const timeErr = validateCombinedTimes(startResult.hhmm, endResult.hhmm);
    if (timeErr) {
      setExtraFormErr(scheduleErrorMessage(timeErr));
      return;
    }

    setSavingExtra(true);
    const { error: err } = await insertOneTimeSchedule(
      ctx,
      dateResult.iso,
      startResult.hhmm,
      endResult.hhmm,
    );
    setSavingExtra(false);
    if (err) {
      setExtraFormErr(scheduleErrorMessage(err));
      return;
    }
    setExtraDateParts(todayDateParts());
    setExtraStartParts(clock24ToTime12Parts('15:30'));
    setExtraEndParts(clock24ToTime12Parts('16:30'));
    appAlert(gd('scheduleSavedTitle'), gd('scheduleSavedBodySynced'));
    void load();
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
    <>
    <View>
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load()} style={styles.retrySmall}>
            <Text style={styles.retrySmallText}>{gd('workspaceRetry')}</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>{gd('scheduleListHeading')}</Text>
      {visibleRows.length === 0 ? (
        <Text style={styles.empty}>{gd('scheduleEmpty')}</Text>
      ) : (
        visibleRows.map((r) => (
          <View key={r.id} style={styles.row}>
            <View style={styles.rowBody}>
              <Text style={styles.rowKind}>
                {r.kind === 'recurring_weekly' ? gd('scheduleKindWeekly') : gd('scheduleKindOnce')}
              </Text>
              <Text style={styles.rowDetail}>
                {r.kind === 'recurring_weekly'
                  ? t(
                      `teacherDashboard.groupDetail.weekdayShort.${
                        jsDowToWeekdayKey(r.day_of_week ?? -1) ?? 'mon'
                      }`,
                    )
                  : r.class_date ?? '—'}{' '}
                · {formatScheduleClockTime(r.start_time, i18n.language)}–
                {formatScheduleClockTime(r.end_time, i18n.language)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={gd('scheduleDeleteConfirm')}
              disabled={deletingId === r.id}
              onPress={() => onDelete(r.id)}
              style={({ pressed }) => [styles.trashBtn, pressed && { opacity: 0.85 }]}>
              {deletingId === r.id ? (
                <ActivityIndicator size="small" color="#B91C1C" />
              ) : (
                <Ionicons name="trash-outline" size={18} color="#B91C1C" />
              )}
            </Pressable>
          </View>
        ))
      )}

      {!weeklyFormOpen ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setWeeklyFormOpen(true)}
          style={({ pressed }) => [styles.revealBtn, styles.sp, pressed && styles.revealBtnPressed]}>
          <Ionicons name="add-circle-outline" size={18} color={BRAND_BLUE} />
          <Text style={styles.revealBtnText}>{gd('addWeeklySchedule')}</Text>
        </Pressable>
      ) : (
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>{gd('regularClassHeading')}</Text>
          <Text style={styles.label}>{gd('dayOfWeek')}</Text>
          <View style={styles.dayChips}>
            {WEEKDAY_KEYS.map((d) => {
              const selected = regularDay === d;
              return (
                <Pressable
                  key={d}
                  onPress={() => setRegularDay(d)}
                  style={({ pressed }) => [
                    styles.dayChip,
                    selected && styles.dayChipSelected,
                    pressed && styles.dayChipPressed,
                  ]}>
                  <Text style={[styles.dayChipText, selected && styles.dayChipTextSel]}>
                    {t(`teacherDashboard.groupDetail.weekdayShort.${d}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.label}>{gd('timeStart')}</Text>
          <ScheduleTimePickerField
            value={regularStartParts}
            onChange={setRegularStartParts}
            editable={!savingWeekly}
            placeholder={pickerLabels.time}
            doneLabel={pickerLabels.done}
            cancelLabel={pickerLabels.cancel}
            ampmLabels={ampmLabels}
            locale={i18n.language}
          />
          <Text style={styles.label}>{gd('timeEnd')}</Text>
          <ScheduleTimePickerField
            value={regularEndParts}
            onChange={setRegularEndParts}
            editable={!savingWeekly}
            placeholder={pickerLabels.time}
            doneLabel={pickerLabels.done}
            cancelLabel={pickerLabels.cancel}
            ampmLabels={ampmLabels}
            locale={i18n.language}
          />
          {weeklyFormErr ? <Text style={styles.formErr}>{weeklyFormErr}</Text> : null}

          <View style={styles.formActions}>
            <Pressable
              disabled={savingWeekly}
              onPress={() => {
                setWeeklyFormOpen(false);
                setWeeklyFormErr(null);
              }}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && !savingWeekly && styles.revealBtnPressed,
                savingWeekly && styles.primaryDisabled,
              ]}>
              <Text style={styles.secondaryBtnText}>{gd('scheduleFormCancel')}</Text>
            </Pressable>
            <Pressable
              disabled={savingWeekly}
              onPress={() => void saveWeekly()}
              style={({ pressed }) => [
                styles.primary,
                styles.primaryInline,
                pressed && !savingWeekly && { opacity: 0.9 },
                savingWeekly && styles.primaryDisabled,
              ]}>
              {savingWeekly ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
                  <Text style={styles.primaryText}>{gd('scheduleSave')}</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>{gd('extraClassHeading')}</Text>
      <Text style={styles.label}>{gd('specificDate')}</Text>
      <ScheduleDatePickerField
        value={extraDateParts}
        onChange={setExtraDateParts}
        editable={!savingExtra}
        placeholder={pickerLabels.date}
        doneLabel={pickerLabels.done}
        locale={i18n.language}
      />

      <Text style={styles.label}>{gd('timeStart')}</Text>
      <ScheduleTimePickerField
        value={extraStartParts}
        onChange={setExtraStartParts}
        editable={!savingExtra}
        placeholder={pickerLabels.time}
        doneLabel={pickerLabels.done}
        cancelLabel={pickerLabels.cancel}
        ampmLabels={ampmLabels}
        locale={i18n.language}
      />

      <Text style={styles.label}>{gd('timeEnd')}</Text>
      <ScheduleTimePickerField
        value={extraEndParts}
        onChange={setExtraEndParts}
        editable={!savingExtra}
        placeholder={pickerLabels.time}
        doneLabel={pickerLabels.done}
        cancelLabel={pickerLabels.cancel}
        ampmLabels={ampmLabels}
        locale={i18n.language}
      />
      {extraFormErr ? <Text style={styles.formErr}>{extraFormErr}</Text> : null}

      <Pressable
        disabled={savingExtra}
        onPress={() => void saveExtra()}
        style={({ pressed }) => [styles.primary, pressed && !savingExtra && { opacity: 0.9 }, savingExtra && styles.primaryDisabled]}>
        {savingExtra ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <>
            <Ionicons name="calendar-outline" size={18} color="#FFF" />
            <Text style={styles.primaryText}>{gd('scheduleSave')}</Text>
          </>
        )}
      </Pressable>
    </View>

    <Modal
      visible={deleteTargetId != null}
      transparent
      animationType="fade"
      onRequestClose={closeDeleteModal}>
      <View style={styles.modalOverlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={gd('scheduleDeleteNo')}
          onPress={closeDeleteModal}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{gd('scheduleDeleteTitle')}</Text>
          <Text style={styles.modalSub}>{gd('scheduleDeleteBody')}</Text>
          <View style={styles.modalActionsRow}>
            <Pressable
              accessibilityRole="button"
              disabled={Boolean(deletingId)}
              onPress={closeDeleteModal}
              style={({ pressed }) => [
                styles.modalBtnSecondary,
                pressed && !deletingId && styles.modalBtnPressed,
                deletingId && styles.modalBtnDisabled,
              ]}>
              <Text style={styles.modalBtnSecondaryText}>{gd('scheduleDeleteNo')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={Boolean(deletingId)}
              onPress={confirmDelete}
              style={({ pressed }) => [
                styles.modalBtnDestructive,
                pressed && !deletingId && styles.modalBtnPressed,
                deletingId && styles.modalBtnDisabled,
              ]}>
              {deletingId ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.modalBtnDestructiveText}>{gd('scheduleDeleteYes')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
    </>
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
  sectionTitle: { fontSize: 15, fontWeight: '800', color: BRAND_BLUE_DARK, marginBottom: 8 },
  sp: { marginTop: 16 },
  empty: { color: TEXT_MUTED, fontWeight: '600', marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowKind: { fontSize: 12, fontWeight: '800', color: BRAND_BLUE, textTransform: 'uppercase' },
  rowDetail: { fontSize: 14, fontWeight: '600', color: BRAND_BLUE_DARK, marginTop: 2 },
  trashBtn: { padding: 8, ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {}) },
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 8, marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: PAGE_SURFACE,
    color: BRAND_BLUE_DARK,
  },
  dayChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: PAGE_SURFACE,
  },
  dayChipSelected: { borderColor: BRAND_BLUE, backgroundColor: '#E3F2FD' },
  dayChipPressed: { opacity: 0.88 },
  dayChipText: { fontSize: 12, fontWeight: '700', color: TEXT_MUTED },
  dayChipTextSel: { color: BRAND_BLUE_DARK },
  primary: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BRAND_BLUE,
    borderRadius: 12,
    paddingVertical: 12,
  },
  primaryInline: { marginTop: 0, flex: 1 },
  revealBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: BRAND_BLUE,
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: '#E3F2FD',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {}),
  },
  revealBtnPressed: { opacity: 0.88 },
  revealBtnText: { color: BRAND_BLUE, fontWeight: '800', fontSize: 15 },
  formCard: {
    marginTop: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  formActions: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  secondaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {}),
  },
  secondaryBtnText: { color: BRAND_BLUE_DARK, fontWeight: '800', fontSize: 15 },
  primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  primaryDisabled: { opacity: 0.65 },
  formErr: { marginTop: 8, fontSize: 13, color: '#B91C1C', fontWeight: '600', lineHeight: 18 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginVertical: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
  },
  modalSub: {
    marginTop: 8,
    fontSize: 14,
    color: TEXT_MUTED,
    lineHeight: 20,
  },
  modalActionsRow: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  modalBtnSecondary: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {}),
  },
  modalBtnSecondaryText: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
  },
  modalBtnDestructive: {
    backgroundColor: '#B42318',
    borderRadius: 12,
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {}),
  },
  modalBtnDestructiveText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalBtnPressed: { opacity: 0.88 },
  modalBtnDisabled: { opacity: 0.6 },
});
