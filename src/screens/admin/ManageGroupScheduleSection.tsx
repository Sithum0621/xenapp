import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ScrollView } from '@/src/components/layout/scroll';
import {
  ScheduleDatePickerField,
  ScheduleTimePickerField,
} from '@/src/components/teacher/groupDetail/SchedulePickerFields';

import {
  instituteAdminCreateGroupSchedule,
  instituteAdminDeleteGroupSchedule,
  instituteAdminListGroupSchedules,
  type GroupScheduleRow,
} from '@/src/services/instituteAdminGroupSchedulesApi';
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
import { formatScheduleClockTime } from '@/src/services/instituteAdminDashboardApi';
import { mapScheduleDbError } from '@/src/utils/scheduleTimeValidation';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const TEXT_MUTED = '#64748B';
const SUBTLE_BORDER = '#E2E8F0';
const PAGE_SURFACE = '#F8FAFC';

const DOW_ORDER = [0, 1, 2, 3, 4, 5, 6];

const WEEKDAY_KEYS = [
  'scheduleWeekday0',
  'scheduleWeekday1',
  'scheduleWeekday2',
  'scheduleWeekday3',
  'scheduleWeekday4',
  'scheduleWeekday5',
  'scheduleWeekday6',
] as const;

type Props = {
  lectureGroupId: string;
};

export default function ManageGroupScheduleSection({ lectureGroupId }: Props) {
  const { t, i18n } = useTranslation();

  const [rows, setRows] = useState<GroupScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listErr, setListErr] = useState<string | null>(null);

  const [recDay, setRecDay] = useState<number>(1);
  const [recStartParts, setRecStartParts] = useState<ScheduleTime12Parts>(() =>
    clock24ToTime12Parts('09:00'),
  );
  const [recEndParts, setRecEndParts] = useState<ScheduleTime12Parts>(() =>
    clock24ToTime12Parts('10:30'),
  );
  const [recSaving, setRecSaving] = useState(false);
  const [recFormErr, setRecFormErr] = useState<string | null>(null);

  const [extraDateParts, setExtraDateParts] = useState<ScheduleDateParts>(() => todayDateParts());
  const [extraStartParts, setExtraStartParts] = useState<ScheduleTime12Parts>(() =>
    clock24ToTime12Parts('14:00'),
  );
  const [extraEndParts, setExtraEndParts] = useState<ScheduleTime12Parts>(() =>
    clock24ToTime12Parts('16:00'),
  );
  const [extraSaving, setExtraSaving] = useState(false);
  const [extraFormErr, setExtraFormErr] = useState<string | null>(null);

  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [listNow, setListNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setListNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    setListErr(null);
    const { rows: next, error } = await instituteAdminListGroupSchedules(lectureGroupId);
    if (error) {
      setListErr(error);
      setRows([]);
      return;
    }
    setRows(next);
  }, [lectureGroupId]);

  useEffect(() => {
    let c = false;
    void (async () => {
      setLoading(true);
      await load();
      if (!c) setLoading(false);
    })();
    return () => {
      c = true;
    };
  }, [load]);

  const dayLabel = useCallback((d: number) => t(`adminPortal.${WEEKDAY_KEYS[d]}`), [t]);

  const scheduleFormMessage = (code: string) => {
    switch (code) {
      case 'schedule_time_conflict':
        return t('adminPortal.scheduleTimeConflict');
      case 'schedule_end_before_start':
      case 'end_before_start':
        return t('adminPortal.scheduleEndBeforeStart');
      case 'invalid_date':
      case 'schedule_invalid_date':
        return t('adminPortal.scheduleInvalidDate');
      case 'invalid_time':
        return t('adminPortal.scheduleInvalidTime12');
      default:
        return code;
    }
  };

  const pickerLabels = {
    date: t('adminPortal.schedulePickDate'),
    time: t('adminPortal.schedulePickTime'),
    done: t('adminPortal.schedulePickerDone'),
    cancel: t('adminPortal.scheduleCancel'),
  };
  const ampmLabels = { am: t('adminPortal.scheduleAm'), pm: t('adminPortal.schedulePm') };

  const recurringRows = useMemo(
    () => rows.filter((r) => r.kind === 'recurring_weekly').sort((a, b) => (a.day_of_week ?? 0) - (b.day_of_week ?? 0)),
    [rows],
  );
  const extraRows = useMemo(
    () =>
      filterActiveScheduleListRows(
        rows.filter((r) => r.kind === 'one_time'),
        listNow,
      ).sort((a, b) => (a.class_date ?? '').localeCompare(b.class_date ?? '')),
    [rows, listNow],
  );

  const formatRange = (s: string, e: string) =>
    `${formatScheduleClockTime(s, i18n.language)} – ${formatScheduleClockTime(e, i18n.language)}`;

  const addRecurring = async () => {
    setRecFormErr(null);

    const startResult = combineTime12Parts(recStartParts);
    if ('error' in startResult) {
      setRecFormErr(scheduleFormMessage(startResult.error));
      return;
    }

    const endResult = combineTime12Parts(recEndParts);
    if ('error' in endResult) {
      setRecFormErr(scheduleFormMessage(endResult.error));
      return;
    }

    const timeErr = validateCombinedTimes(startResult.hhmm, endResult.hhmm);
    if (timeErr) {
      setRecFormErr(scheduleFormMessage(timeErr));
      return;
    }

    setRecSaving(true);
    const { error } = await instituteAdminCreateGroupSchedule({
      lecture_group_id: lectureGroupId,
      kind: 'recurring_weekly',
      schedule_year: new Date().getFullYear(),
      day_of_week: recDay,
      start_time: startResult.hhmm,
      end_time: endResult.hhmm,
    });
    setRecSaving(false);
    if (error) {
      setRecFormErr(scheduleFormMessage(mapScheduleDbError(error)));
      return;
    }
    await load();
  };

  const addExtra = async () => {
    setExtraFormErr(null);

    const dateResult = combineDateParts(extraDateParts);
    if ('error' in dateResult) {
      setExtraFormErr(scheduleFormMessage(dateResult.error));
      return;
    }

    const startResult = combineTime12Parts(extraStartParts);
    if ('error' in startResult) {
      setExtraFormErr(scheduleFormMessage(startResult.error));
      return;
    }

    const endResult = combineTime12Parts(extraEndParts);
    if ('error' in endResult) {
      setExtraFormErr(scheduleFormMessage(endResult.error));
      return;
    }

    const timeErr = validateCombinedTimes(startResult.hhmm, endResult.hhmm);
    if (timeErr) {
      setExtraFormErr(scheduleFormMessage(timeErr));
      return;
    }

    setExtraSaving(true);
    const { error } = await instituteAdminCreateGroupSchedule({
      lecture_group_id: lectureGroupId,
      kind: 'one_time',
      class_date: dateResult.iso,
      start_time: startResult.hhmm,
      end_time: endResult.hhmm,
    });
    setExtraSaving(false);
    if (error) {
      setExtraFormErr(scheduleFormMessage(mapScheduleDbError(error)));
      return;
    }
    setExtraDateParts({ ...todayDateParts(), day: '' });
    setExtraStartParts(clock24ToTime12Parts('14:00'));
    setExtraEndParts(clock24ToTime12Parts('16:00'));
    await load();
  };

  const confirmDelete = (id: string) => {
    const run = () => {
      setActionBusy(id);
      void (async () => {
        const { error } = await instituteAdminDeleteGroupSchedule(id);
        setActionBusy(null);
        if (!error) await load();
        else appAlert(t('adminPortal.scheduleDeleteErrorTitle'), error);
      })();
    };
    appAlert(t('adminPortal.scheduleDeleteConfirmTitle'), t('adminPortal.scheduleDeleteConfirm'), [
      { text: t('adminPortal.scheduleCancel'), style: 'cancel' },
      { text: t('adminPortal.scheduleDelete'), style: 'destructive', onPress: run },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={BRAND_BLUE} />
        <Text style={styles.muted}>{t('adminPortal.scheduleLoading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {listErr ? (
        <View style={styles.banner}>
          <Ionicons name="warning-outline" size={18} color="#B45309" />
          <Text style={styles.bannerText}>{listErr}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>{t('adminPortal.manageGroupScheduleTitle')}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('adminPortal.manageGroupRecurringTitle')}</Text>
        <Text style={styles.cardHint}>{t('adminPortal.manageGroupRecurringHint')}</Text>
        <Text style={styles.label}>{t('adminPortal.manageGroupDayLabel')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dayRow}
          {...(Platform.OS === 'web' ? { dataSet: { touchScroll: 'horizontal' } } : {})}>
          {DOW_ORDER.map((d) => (
            <Pressable
              key={d}
              onPress={() => setRecDay(d)}
              style={({ pressed }) => [
                styles.dayChip,
                recDay === d && styles.dayChipOn,
                pressed && styles.dayChipPressed,
              ]}>
              <Text style={[styles.dayChipText, recDay === d && styles.dayChipTextOn]} numberOfLines={1}>
                {dayLabel(d)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={styles.label}>{t('adminPortal.manageGroupStartTime')}</Text>
        <ScheduleTimePickerField
          value={recStartParts}
          onChange={setRecStartParts}
          editable={!recSaving}
          placeholder={pickerLabels.time}
          doneLabel={pickerLabels.done}
          cancelLabel={pickerLabels.cancel}
          ampmLabels={ampmLabels}
          locale={i18n.language}
        />
        <Text style={styles.label}>{t('adminPortal.manageGroupEndTime')}</Text>
        <ScheduleTimePickerField
          value={recEndParts}
          onChange={setRecEndParts}
          editable={!recSaving}
          placeholder={pickerLabels.time}
          doneLabel={pickerLabels.done}
          cancelLabel={pickerLabels.cancel}
          ampmLabels={ampmLabels}
          locale={i18n.language}
        />
        {recFormErr ? <Text style={styles.formErr}>{recFormErr}</Text> : null}
        <Pressable
          disabled={recSaving}
          onPress={() => void addRecurring()}
          style={({ pressed }) => [styles.primaryBtn, pressed && !recSaving && styles.primaryBtnPressed, recSaving && styles.btnDisabled]}>
          {recSaving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.primaryBtnText}>{t('adminPortal.scheduleSave')}</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('adminPortal.manageGroupExtraTitle')}</Text>
        <Text style={styles.cardHint}>{t('adminPortal.manageGroupExtraHint')}</Text>
        <Text style={styles.label}>{t('adminPortal.manageGroupClassDate')}</Text>
        <ScheduleDatePickerField
          value={extraDateParts}
          onChange={setExtraDateParts}
          editable={!extraSaving}
          placeholder={pickerLabels.date}
          doneLabel={pickerLabels.done}
          locale={i18n.language}
        />
        <Text style={styles.label}>{t('adminPortal.manageGroupStartTime')}</Text>
        <ScheduleTimePickerField
          value={extraStartParts}
          onChange={setExtraStartParts}
          editable={!extraSaving}
          placeholder={pickerLabels.time}
          doneLabel={pickerLabels.done}
          cancelLabel={pickerLabels.cancel}
          ampmLabels={ampmLabels}
          locale={i18n.language}
        />
        <Text style={styles.label}>{t('adminPortal.manageGroupEndTime')}</Text>
        <ScheduleTimePickerField
          value={extraEndParts}
          onChange={setExtraEndParts}
          editable={!extraSaving}
          placeholder={pickerLabels.time}
          doneLabel={pickerLabels.done}
          cancelLabel={pickerLabels.cancel}
          ampmLabels={ampmLabels}
          locale={i18n.language}
        />
        {extraFormErr ? <Text style={styles.formErr}>{extraFormErr}</Text> : null}
        <Pressable
          disabled={extraSaving}
          onPress={() => void addExtra()}
          style={({ pressed }) => [styles.primaryBtn, pressed && !extraSaving && styles.primaryBtnPressed, extraSaving && styles.btnDisabled]}>
          {extraSaving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.primaryBtnText}>{t('adminPortal.scheduleSave')}</Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.overviewTitle}>{t('adminPortal.manageGroupOverviewTitle')}</Text>

      <View style={styles.overviewCard}>
        <Text style={styles.overviewSub}>{t('adminPortal.manageGroupOverviewRecurring')}</Text>
        {recurringRows.length === 0 ? (
          <Text style={styles.emptyLine}>{t('adminPortal.manageGroupNoRecurring')}</Text>
        ) : (
          recurringRows.map((r) => (
            <View key={r.id} style={styles.overviewRow}>
              <View style={styles.overviewMain}>
                <Text style={styles.overviewStrong}>{dayLabel(r.day_of_week ?? 0)}</Text>
                <Text style={styles.overviewMuted}>{formatRange(r.start_time, r.end_time)}</Text>
              </View>
              <Pressable
                accessibilityLabel={t('adminPortal.manageGroupDeleteSchedule')}
                disabled={actionBusy === r.id}
                onPress={() => confirmDelete(r.id)}
                style={styles.trashBtn}>
                {actionBusy === r.id ? (
                  <ActivityIndicator size="small" color={BRAND_BLUE} />
                ) : (
                  <Ionicons name="trash-outline" size={20} color="#B91C1C" />
                )}
              </Pressable>
            </View>
          ))
        )}
      </View>

      <View style={styles.overviewCard}>
        <Text style={styles.overviewSub}>{t('adminPortal.manageGroupOverviewExtra')}</Text>
        {extraRows.length === 0 ? (
          <Text style={styles.emptyLine}>{t('adminPortal.manageGroupNoExtra')}</Text>
        ) : (
          extraRows.map((r) => (
              <View key={r.id} style={styles.overviewRow}>
                <View style={styles.overviewMain}>
                  <Text style={styles.overviewStrong}>{r.class_date}</Text>
                  <Text style={styles.overviewMuted}>{formatRange(r.start_time, r.end_time)}</Text>
                </View>
                <Pressable
                  accessibilityLabel={t('adminPortal.manageGroupDeleteSchedule')}
                  disabled={actionBusy === r.id}
                  onPress={() => confirmDelete(r.id)}
                  style={styles.trashBtn}>
                  {actionBusy === r.id ? (
                    <ActivityIndicator size="small" color={BRAND_BLUE} />
                  ) : (
                    <Ionicons name="trash-outline" size={20} color="#B91C1C" />
                  )}
              </Pressable>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, gap: 0 },
  loadingBox: { paddingVertical: 24, alignItems: 'center', gap: 8 },
  muted: { color: TEXT_MUTED, fontSize: 14 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 12,
  },
  bannerText: { flex: 1, fontSize: 13, color: '#92400E' },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    marginBottom: 12,
  },
  card: {
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#FFFFFF',
    marginBottom: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: BRAND_BLUE_DARK, marginBottom: 4 },
  cardHint: { fontSize: 13, color: TEXT_MUTED, marginBottom: 12, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '700', color: BRAND_BLUE_DARK, marginBottom: 6 },
  dayRow: { flexDirection: 'row', gap: 8, marginBottom: 12, paddingVertical: 4 },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PAGE_SURFACE,
  },
  dayChipOn: {
    borderColor: BRAND_BLUE,
    backgroundColor: '#EFF6FF',
  },
  dayChipPressed: { opacity: 0.9 },
  dayChipText: { fontSize: 13, fontWeight: '600', color: BRAND_BLUE_DARK },
  dayChipTextOn: { color: BRAND_BLUE_DARK },
  timeRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  timeField: { flex: 1 },
  input: {
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 10,
    paddingHorizontal: 10,
    minHeight: 44,
    fontSize: 16,
    color: '#0F172A',
    backgroundColor: PAGE_SURFACE,
  },
  timeHint: { fontSize: 12, color: TEXT_MUTED, marginBottom: 8 },
  formErr: { fontSize: 13, color: '#B45309', marginBottom: 8 },
  primaryBtn: {
    marginTop: 4,
    backgroundColor: BRAND_BLUE,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnPressed: { opacity: 0.92 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
  overviewTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    marginTop: 4,
    marginBottom: 10,
  },
  overviewCard: {
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 14,
    padding: 12,
    backgroundColor: PAGE_SURFACE,
    marginBottom: 12,
  },
  overviewSub: {
    fontSize: 14,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    marginBottom: 10,
  },
  emptyLine: { fontSize: 14, color: TEXT_MUTED, fontStyle: 'italic' },
  overviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SUBTLE_BORDER,
  },
  overviewRowPast: { opacity: 0.75 },
  overviewMain: { flex: 1, minWidth: 0 },
  overviewStrong: { fontSize: 15, fontWeight: '700', color: BRAND_BLUE_DARK },
  overviewMuted: { fontSize: 14, color: TEXT_MUTED, marginTop: 2 },
  textPast: { color: TEXT_MUTED },
  pastBadge: { marginTop: 4, fontSize: 11, fontWeight: '700', color: '#92400E' },
  trashBtn: { padding: 8 },
});
