import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import {
  fetchAttendanceMarksForSession,
  fetchAttendanceSlotsForDate,
  fetchInstituteStudents,
  fetchPersonalRoster,
  saveAttendanceForSlot,
  type TeacherAttendanceSlot,
} from '@/src/services/teacherGroupWorkspaceApi';
import type { TeacherGroupRouteContext } from '@/src/utils/teacherGroupRouteParams';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const BORDER = '#E2E8F0';
const PAGE_SURFACE = '#F8FAFC';
const TEXT_MUTED = '#64748B';
const PRESENT = '#16A34A';
const ABSENT = '#DC2626';

type RosterRow = { key: string; name: string; student_user_id?: string; personal_roster_id?: string };

type Props = { ctx: TeacherGroupRouteContext };

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function slotLabel(slot: TeacherAttendanceSlot, gd: (k: string) => string): string {
  const kind =
    slot.kind === 'one_time' ? gd('attendanceSlotExtra') : gd('attendanceSlotWeekly');
  return `${kind} · ${slot.start_time}–${slot.end_time}`;
}

export default function TeacherGroupAttendancePanel({ ctx }: Props) {
  const { t } = useTranslation();
  const gd = (k: string, o?: Record<string, unknown>) => t(`teacherDashboard.groupDetail.${k}`, o);

  const [sessionDate, setSessionDate] = useState(todayIso);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<TeacherAttendanceSlot[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [presentByKey, setPresentByKey] = useState<Record<string, boolean>>({});

  const selectedSlot = useMemo(
    () => slots.find((s) => s.schedule_id === selectedScheduleId) ?? null,
    [slots, selectedScheduleId],
  );

  const loadRoster = useCallback(async () => {
    if (ctx.source === 'institute') {
      const { rows, error: e } = await fetchInstituteStudents(ctx.groupId);
      if (e) return { rows: [] as RosterRow[], error: e };
      return {
        rows: rows.map((r) => ({
          key: r.student_user_id,
          name: r.full_name,
          student_user_id: r.student_user_id,
        })),
        error: null,
      };
    }
    const { rows, error: e } = await fetchPersonalRoster(ctx.groupId);
    if (e) return { rows: [] as RosterRow[], error: e };
    return {
      rows: rows.map((r) => ({
        key: r.id,
        name: r.display_name,
        personal_roster_id: r.id,
        student_user_id: r.student_user_id ?? undefined,
      })),
      error: null,
    };
  }, [ctx]);

  const applyMarks = useCallback(
    (rows: RosterRow[], marks: { student_user_id: string | null; personal_roster_id: string | null; present: boolean }[]) => {
      const next: Record<string, boolean> = {};
      for (const row of rows) {
        const hit = marks.find(
          (m) =>
            (row.personal_roster_id && m.personal_roster_id === row.personal_roster_id) ||
            (row.student_user_id && m.student_user_id === row.student_user_id),
        );
        next[row.key] = hit ? hit.present : true;
      }
      setPresentByKey(next);
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [{ slots: slotRows, error: slotErr }, rosterRes] = await Promise.all([
      fetchAttendanceSlotsForDate(ctx, sessionDate),
      loadRoster(),
    ]);

    if (slotErr) {
      setError(slotErr);
      setSlots([]);
      setLoading(false);
      return;
    }
    if (rosterRes.error) {
      setError(rosterRes.error);
      setSlots([]);
      setLoading(false);
      return;
    }

    setSlots(slotRows);
    setRoster(rosterRes.rows);

    const pick =
      selectedScheduleId && slotRows.some((s) => s.schedule_id === selectedScheduleId)
        ? selectedScheduleId
        : slotRows[0]?.schedule_id ?? null;
    setSelectedScheduleId(pick);

    const slot = slotRows.find((s) => s.schedule_id === pick);
    if (slot?.session_id) {
      const { marks, error: me } = await fetchAttendanceMarksForSession(slot.session_id);
      if (me) setError(me);
      else applyMarks(rosterRes.rows, marks);
    } else {
      const defaults: Record<string, boolean> = {};
      for (const row of rosterRes.rows) defaults[row.key] = true;
      setPresentByKey(defaults);
    }

    setLoading(false);
  }, [applyMarks, ctx, loadRoster, selectedScheduleId, sessionDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectSlot = async (scheduleId: string) => {
    setSelectedScheduleId(scheduleId);
    const slot = slots.find((s) => s.schedule_id === scheduleId);
    if (!slot) return;
    if (slot.session_id) {
      const { marks, error: me } = await fetchAttendanceMarksForSession(slot.session_id);
      if (me) {
        setError(me);
        return;
      }
      applyMarks(roster, marks);
    } else {
      const defaults: Record<string, boolean> = {};
      for (const row of roster) defaults[row.key] = true;
      setPresentByKey(defaults);
    }
  };

  const setPresent = (key: string, present: boolean) => {
    setPresentByKey((prev) => ({ ...prev, [key]: present }));
  };

  const markAll = (present: boolean) => {
    setPresentByKey((prev) => {
      const next = { ...prev };
      for (const row of roster) next[row.key] = present;
      return next;
    });
  };

  const save = async () => {
    if (!selectedSlot) return;
    setSaving(true);
    const marks = roster.map((row) => ({
      present: presentByKey[row.key] ?? false,
      ...(row.student_user_id ? { student_user_id: row.student_user_id } : {}),
      ...(row.personal_roster_id ? { personal_roster_id: row.personal_roster_id } : {}),
    }));

    const { error: saveErr } = await saveAttendanceForSlot(
      ctx,
      selectedSlot.schedule_id,
      sessionDate,
      marks,
    );
    setSaving(false);
    if (saveErr) {
      appAlert(gd('attendanceSaveErrorTitle'), saveErr);
      return;
    }
    appAlert(gd('attendanceSavedTitle'), gd('attendanceSavedBody'));
    void load();
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND_BLUE} />
        <Text style={styles.muted}>{gd('workspaceLoading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{gd('workspaceError')}</Text>
        <Text style={styles.muted}>{error}</Text>
        <Pressable onPress={() => void load()} style={styles.retryBtn}>
          <Text style={styles.retryText}>{gd('workspaceRetry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.dateRow}>
        <Pressable
          accessibilityLabel={gd('attendancePrevDay')}
          onPress={() => setSessionDate((d) => shiftDate(d, -1))}
          style={styles.dateNav}>
          <Ionicons name="chevron-back" size={20} color={BRAND_BLUE_DARK} />
        </Pressable>
        <Text style={styles.dateLabel}>{sessionDate}</Text>
        <Pressable
          accessibilityLabel={gd('attendanceNextDay')}
          onPress={() => setSessionDate((d) => shiftDate(d, 1))}
          style={styles.dateNav}>
          <Ionicons name="chevron-forward" size={20} color={BRAND_BLUE_DARK} />
        </Pressable>
        <Pressable onPress={() => setSessionDate(todayIso())} style={styles.todayBtn}>
          <Text style={styles.todayBtnText}>{gd('attendanceToday')}</Text>
        </Pressable>
      </View>

      {slots.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={28} color={TEXT_MUTED} />
          <Text style={styles.emptyTitle}>{gd('attendanceNoSlots')}</Text>
          <Text style={styles.muted}>{gd('attendanceNoSlotsHint')}</Text>
        </View>
      ) : (
        <>
          <Text style={styles.sectionLabel}>{gd('attendancePickClass')}</Text>
          <View style={styles.slotList}>
            {slots.map((slot) => {
              const active = slot.schedule_id === selectedScheduleId;
              return (
                <Pressable
                  key={slot.schedule_id}
                  onPress={() => void selectSlot(slot.schedule_id)}
                  style={[styles.slotChip, active && styles.slotChipActive]}>
                  <Text style={[styles.slotChipText, active && styles.slotChipTextActive]}>
                    {slotLabel(slot, gd)}
                  </Text>
                  {slot.marked_count > 0 ? (
                    <Text style={[styles.slotMeta, active && styles.slotMetaActive]}>
                      {gd('attendanceSlotMarked', {
                        present: slot.present_count,
                        total: slot.marked_count,
                      })}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {roster.length === 0 ? (
            <Text style={styles.muted}>{gd('studentsEmpty')}</Text>
          ) : (
            <>
              <View style={styles.bulkRow}>
                <Pressable onPress={() => markAll(true)} style={styles.bulkBtn}>
                  <Text style={styles.bulkBtnText}>{gd('attendanceMarkAllPresent')}</Text>
                </Pressable>
                <Pressable onPress={() => markAll(false)} style={styles.bulkBtnOutline}>
                  <Text style={styles.bulkBtnOutlineText}>{gd('attendanceMarkAllAbsent')}</Text>
                </Pressable>
              </View>

              {roster.map((row) => {
                const present = presentByKey[row.key] ?? true;
                return (
                  <View key={row.key} style={styles.studentRow}>
                    <Text style={styles.studentName} numberOfLines={2}>
                      {row.name}
                    </Text>
                    <View style={styles.toggleRow}>
                      <Pressable
                        onPress={() => setPresent(row.key, true)}
                        style={[styles.toggleBtn, present && styles.togglePresent]}>
                        <Text style={[styles.toggleLabel, present && styles.toggleLabelOn]}>
                          {gd('attendancePresent')}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setPresent(row.key, false)}
                        style={[styles.toggleBtn, !present && styles.toggleAbsent]}>
                        <Text style={[styles.toggleLabel, !present && styles.toggleLabelOn]}>
                          {gd('attendanceAbsent')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}

              <Pressable
                disabled={saving || !selectedSlot}
                onPress={() => void save()}
                style={({ pressed }) => [styles.saveBtn, pressed && !saving && styles.saveBtnPressed]}>
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>{gd('attendanceSave')}</Text>
                )}
              </Pressable>
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  centered: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  muted: { fontSize: 13, color: TEXT_MUTED, fontWeight: '600', textAlign: 'center' },
  errorText: { fontSize: 15, fontWeight: '800', color: BRAND_BLUE_DARK },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: PAGE_SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  retryText: { fontWeight: '800', color: BRAND_BLUE },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 10,
  },
  dateNav: { padding: 6 },
  dateLabel: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: BRAND_BLUE_DARK },
  todayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: PAGE_SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  todayBtnText: { fontSize: 12, fontWeight: '800', color: BRAND_BLUE },
  emptyCard: {
    alignItems: 'center',
    gap: 8,
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: BRAND_BLUE_DARK },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: BRAND_BLUE_DARK, marginTop: 4 },
  slotList: { gap: 8 },
  slotChip: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
  },
  slotChipActive: { borderColor: BRAND_BLUE, backgroundColor: '#EFF6FF' },
  slotChipText: { fontSize: 14, fontWeight: '800', color: BRAND_BLUE_DARK },
  slotChipTextActive: { color: BRAND_BLUE },
  slotMeta: { marginTop: 4, fontSize: 12, fontWeight: '600', color: TEXT_MUTED },
  slotMetaActive: { color: BRAND_BLUE },
  bulkRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  bulkBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: PRESENT,
    alignItems: 'center',
  },
  bulkBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  bulkBtnOutline: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
  },
  bulkBtnOutlineText: { color: ABSENT, fontWeight: '800', fontSize: 12 },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
  },
  studentName: { flex: 1, fontSize: 14, fontWeight: '700', color: BRAND_BLUE_DARK },
  toggleRow: { flexDirection: 'row', gap: 6 },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: PAGE_SURFACE,
  },
  togglePresent: { borderColor: PRESENT, backgroundColor: '#DCFCE7' },
  toggleAbsent: { borderColor: ABSENT, backgroundColor: '#FEE2E2' },
  toggleLabel: { fontSize: 11, fontWeight: '800', color: TEXT_MUTED },
  toggleLabelOn: { color: BRAND_BLUE_DARK },
  saveBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  saveBtnPressed: { opacity: 0.9 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});
