import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScrollView } from '@/src/components/layout/scroll';

import type { AttendanceOccurrence } from '@/src/services/studentAttendanceApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import type { AttendanceDaySummary } from '@/src/utils/attendanceDaySummary';

const BRAND_BLUE_DARK = '#00101F';
const TEXT_MUTED = '#64748B';
const SURFACE = '#FFFFFF';
const BORDER = '#E2E8F0';
const PRESENT_COLOR = '#0F9D58';
const ABSENT_COLOR = '#B42318';

export type AttendanceDayTimelineSheetProps = {
  visible: boolean;
  onClose: () => void;
  groupName: string;
  daySummary: AttendanceDaySummary | null;
};

function formatDisplayDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map((p) => Number.parseInt(p, 10));
  if (!y || !m || !d) return dateKey;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime12h(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  let hours = Number.parseInt(m[1]!, 10);
  const minutes = m[2]!;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes} ${ampm}`;
}

function formatRecordedAt(iso: string | null): string | null {
  if (!iso) return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function slotEmoji(kind: AttendanceOccurrence['kind']): string {
  if (kind === 'one_time') return '📗';
  return '📘';
}

export default function AttendanceDayTimelineSheet({
  visible,
  onClose,
  groupName,
  daySummary,
}: AttendanceDayTimelineSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('appLock.back')} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          <Text style={styles.sheetTitle}>
            {daySummary
              ? t('parentDashboard.attendanceDaySheetTitle', {
                  date: formatDisplayDate(daySummary.date),
                })
              : t('parentDashboard.attendanceDaySheetTitleFallback')}
          </Text>
          <Text style={styles.sheetSubtitle}>{groupName}</Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}>
            {daySummary?.occurrences.map((occ, index) => (
              <TimelineRow
                key={`${occ.date}-${occ.startTime}-${index}`}
                groupName={groupName}
                occurrence={occ}
              />
            ))}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}>
            <Text style={styles.closeBtnText}>{t('parentDashboard.attendanceDaySheetClose')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function TimelineRow({
  groupName,
  occurrence,
}: {
  groupName: string;
  occurrence: AttendanceOccurrence;
}) {
  const { t } = useTranslation();
  const timeLabel = formatTime12h(occurrence.startTime);
  const title = `${groupName} (${timeLabel})`;
  const arrival = formatRecordedAt(occurrence.recordedAt);

  return (
    <View style={styles.row}>
      <Text style={styles.rowEmoji}>{slotEmoji(occurrence.kind)}</Text>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        {occurrence.present ? (
          <View style={styles.statusRow}>
            <Ionicons name="checkmark-circle" size={18} color={PRESENT_COLOR} />
            <Text style={[styles.statusText, styles.statusPresent]}>
              {t('parentDashboard.attendanceTimelinePresent')}
              {arrival
                ? t('parentDashboard.attendanceTimelineArrival', { time: arrival })
                : ''}
            </Text>
          </View>
        ) : (
          <View style={styles.statusRow}>
            <Ionicons name="close-circle" size={18} color={ABSENT_COLOR} />
            <Text style={[styles.statusText, styles.statusAbsent]}>
              {occurrence.hasMark
                ? t('parentDashboard.attendanceTimelineAbsentMarked')
                : t('parentDashboard.attendanceTimelineAbsentAuto')}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 47, 99, 0.35)',
  },
  sheet: {
    backgroundColor: SURFACE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: '78%',
    borderWidth: 1,
    borderColor: BORDER,
    borderBottomWidth: 0,
  },
  handleRow: { alignItems: 'center', paddingVertical: 10 },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    letterSpacing: -0.2,
  },
  sheetSubtitle: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
    marginTop: 4,
    marginBottom: 16,
  },
  scroll: { maxHeight: 320 },
  scrollContent: { gap: 14, paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: BORDER,
  },
  rowEmoji: { fontSize: 22, lineHeight: 28 },
  rowBody: { flex: 1, gap: 6 },
  rowTitle: {
    fontSize: 15,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    lineHeight: 20,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: {
    flex: 1,
    fontSize: 14,
    fontFamily: FontFamily.regular,
    lineHeight: 20,
  },
  statusPresent: { color: PRESENT_COLOR },
  statusAbsent: { color: ABSENT_COLOR },
  closeBtn: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: BRAND_BLUE_DARK,
  },
  closeBtnPressed: { opacity: 0.9 },
  closeBtnText: {
    fontSize: 15,
    fontFamily: FontFamily.bold,
    color: '#FFFFFF',
  },
});
