import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { AppScrollView } from '@/src/components/layout/AppScrollView';
import type { ClassDeliveryMode } from '@/src/services/teacherGroupsApi';
import { teacherCreatePersonalGroup } from '@/src/services/teacherGroupsApi';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import {
  appBorder,
  appBrandBlue,
  appBrandBlueDark,
  appPageSurface,
  appTextMuted,
} from '@/src/theme/appBrandPalette';
import { appAlert } from '@/src/utils/appAlert';
import type { WeekdayKey } from '@/src/utils/teacherGroupRouteParams';
import {
  nextDateForWeekday,
  SCHEDULE_DATE_RE,
  validateScheduleTimes,
} from '@/src/utils/weeklyClassSchedule';

const BRAND_BLUE = appBrandBlue;
const BRAND_BLUE_DARK = appBrandBlueDark;
const BORDER = appBorder;
const TEXT_MUTED = appTextMuted;
const PAGE_SURFACE = appPageSurface;
const WEEKDAY_KEYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

export default function TeacherCreatePersonalClassModal({ visible, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const [formName, setFormName] = useState('');
  const [formDeliveryMode, setFormDeliveryMode] = useState<ClassDeliveryMode>('physical');
  const [formFee, setFormFee] = useState('');
  const [formWeekday, setFormWeekday] = useState<WeekdayKey>('sat');
  const [formClassDate, setFormClassDate] = useState(() => nextDateForWeekday('sat'));
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('10:00');
  const [formBusy, setFormBusy] = useState(false);

  const resetForm = () => {
    const defaultDay: WeekdayKey = 'sat';
    setFormName('');
    setFormDeliveryMode('physical');
    setFormFee('');
    setFormWeekday(defaultDay);
    setFormClassDate(nextDateForWeekday(defaultDay));
    setFormStartTime('09:00');
    setFormEndTime('10:00');
  };

  const closeModal = () => {
    if (formBusy) return;
    onClose();
  };

  const onSelectWeekday = (day: WeekdayKey) => {
    setFormWeekday(day);
    setFormClassDate(nextDateForWeekday(day));
  };

  const submitModal = async () => {
    setFormBusy(true);
    const name = formName.trim();
    const fee = formFee.trim();
    if (!name) {
      setFormBusy(false);
      appAlert(t('teacherDashboard.groupsModalValidationTitle'), t('teacherDashboard.groupsNameRequired'));
      return;
    }
    if (!fee) {
      setFormBusy(false);
      appAlert(t('teacherDashboard.groupsModalValidationTitle'), t('teacherDashboard.groupsFeeRequired'));
      return;
    }

    const classDate = formClassDate.trim();
    if (!SCHEDULE_DATE_RE.test(classDate)) {
      setFormBusy(false);
      appAlert(
        t('teacherDashboard.groupsModalValidationTitle'),
        t('teacherDashboard.groupDetail.scheduleDateInvalid'),
      );
      return;
    }

    const timeErr = validateScheduleTimes(formStartTime, formEndTime);
    if (timeErr === 'invalid_time') {
      setFormBusy(false);
      appAlert(t('teacherDashboard.groupsModalValidationTitle'), t('adminPortal.scheduleInvalidTime'));
      return;
    }
    if (timeErr === 'end_before_start') {
      setFormBusy(false);
      appAlert(
        t('teacherDashboard.groupsModalValidationTitle'),
        t('adminPortal.scheduleEndBeforeStart'),
      );
      return;
    }

    const { error } = await teacherCreatePersonalGroup({
      name,
      deliveryMode: formDeliveryMode,
      monthlyFeeInput: fee,
      weeklySchedule: {
        weekday: formWeekday,
        classDate,
        startTime: formStartTime.trim(),
        endTime: formEndTime.trim(),
      },
    });
    setFormBusy(false);
    if (error) {
      const message =
        error === 'invalid_fee'
          ? t('teacherDashboard.groupsFeeInvalid')
          : error === 'schedule_day_mismatch'
            ? t('teacherDashboard.groupsScheduleDayMismatch', {
                day: t(`teacherDashboard.groupDetail.weekdayShort.${formWeekday}`),
              })
            : error === 'schedule_invalid_date'
              ? t('teacherDashboard.groupDetail.scheduleDateInvalid')
              : error;
      appAlert(t('teacherDashboard.groupsSaveErrorTitle'), message);
      return;
    }

    resetForm();
    onClose();
    onCreated?.();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={closeModal}
      onShow={resetForm}>
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.modalBackdrop} onPress={() => !formBusy && closeModal()} />
        <AppScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.modalScroll}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('teacherDashboard.groupsModalCreateClassTitle')}</Text>

            <Text style={styles.modalLabel}>{t('teacherDashboard.groupsClassNameLabel')}</Text>
            <TextInput
              value={formName}
              onChangeText={setFormName}
              placeholder={t('teacherDashboard.groupsClassNamePlaceholder')}
              placeholderTextColor="#94A3B8"
              editable={!formBusy}
              style={styles.modalInput}
            />

            <Text style={[styles.modalLabel, styles.modalLabelSp]}>
              {t('teacherDashboard.groupsDeliveryModeLabel')}
            </Text>
            <View style={styles.deliveryRow}>
              <Pressable
                disabled={formBusy}
                accessibilityRole="button"
                accessibilityState={{ selected: formDeliveryMode === 'physical' }}
                onPress={() => setFormDeliveryMode('physical')}
                style={({ pressed }) => [
                  styles.deliveryOption,
                  formDeliveryMode === 'physical' && styles.deliveryOptionSelected,
                  pressed && !formBusy && styles.deliveryOptionPressed,
                ]}>
                <Ionicons
                  name="location-outline"
                  size={18}
                  color={formDeliveryMode === 'physical' ? '#FFFFFF' : BRAND_BLUE_DARK}
                />
                <Text
                  style={[
                    styles.deliveryOptionText,
                    formDeliveryMode === 'physical' && styles.deliveryOptionTextSelected,
                  ]}>
                  {t('teacherDashboard.groupsDeliveryPhysical')}
                </Text>
              </Pressable>
              <Pressable
                disabled={formBusy}
                accessibilityRole="button"
                accessibilityState={{ selected: formDeliveryMode === 'online' }}
                onPress={() => setFormDeliveryMode('online')}
                style={({ pressed }) => [
                  styles.deliveryOption,
                  formDeliveryMode === 'online' && styles.deliveryOptionSelected,
                  pressed && !formBusy && styles.deliveryOptionPressed,
                ]}>
                <Ionicons
                  name="videocam-outline"
                  size={18}
                  color={formDeliveryMode === 'online' ? '#FFFFFF' : BRAND_BLUE_DARK}
                />
                <Text
                  style={[
                    styles.deliveryOptionText,
                    formDeliveryMode === 'online' && styles.deliveryOptionTextSelected,
                  ]}>
                  {t('teacherDashboard.groupsDeliveryOnline')}
                </Text>
              </Pressable>
            </View>

            <Text style={[styles.modalLabel, styles.modalLabelSp]}>
              {t('teacherDashboard.groupsClassFeeLabel')}
            </Text>
            <TextInput
              value={formFee}
              onChangeText={setFormFee}
              placeholder={t('teacherDashboard.groupsClassFeePlaceholder')}
              placeholderTextColor="#94A3B8"
              editable={!formBusy}
              keyboardType="decimal-pad"
              style={styles.modalInput}
            />
            <Text style={styles.modalHint}>{t('teacherDashboard.groupsClassFeeHint')}</Text>

            <View style={styles.modalDivider} />
            <Text style={styles.modalSectionTitle}>{t('teacherDashboard.groupsScheduleSectionTitle')}</Text>
            <Text style={styles.modalHint}>{t('teacherDashboard.groupsScheduleSectionHint')}</Text>

            <Text style={[styles.modalLabel, styles.modalLabelSp]}>
              {t('teacherDashboard.groupDetail.dayOfWeek')}
            </Text>
            <View style={styles.dayChips}>
              {WEEKDAY_KEYS.map((d) => {
                const selected = formWeekday === d;
                return (
                  <Pressable
                    key={d}
                    disabled={formBusy}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => onSelectWeekday(d)}
                    style={({ pressed }) => [
                      styles.dayChip,
                      selected && styles.dayChipSelected,
                      pressed && !formBusy && styles.dayChipPressed,
                    ]}>
                    <Text style={[styles.dayChipText, selected && styles.dayChipTextSelected]}>
                      {t(`teacherDashboard.groupDetail.weekdayShort.${d}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.modalLabel, styles.modalLabelSp]}>
              {t('teacherDashboard.groupsScheduleDateLabel')}
            </Text>
            <TextInput
              value={formClassDate}
              onChangeText={setFormClassDate}
              placeholder={t('teacherDashboard.groupDetail.datePlaceholder')}
              placeholderTextColor="#94A3B8"
              editable={!formBusy}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.modalInput}
            />
            <Text style={styles.modalHint}>{t('teacherDashboard.groupsScheduleDateHint')}</Text>

            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text style={styles.modalLabel}>{t('teacherDashboard.groupDetail.timeStart')}</Text>
                <TextInput
                  value={formStartTime}
                  onChangeText={setFormStartTime}
                  placeholder="09:00"
                  placeholderTextColor="#94A3B8"
                  editable={!formBusy}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.modalInput}
                />
              </View>
              <View style={styles.timeField}>
                <Text style={styles.modalLabel}>{t('teacherDashboard.groupDetail.timeEnd')}</Text>
                <TextInput
                  value={formEndTime}
                  onChangeText={setFormEndTime}
                  placeholder="10:00"
                  placeholderTextColor="#94A3B8"
                  editable={!formBusy}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.modalInput}
                />
              </View>
            </View>
            <Text style={styles.modalHint}>{t('adminPortal.scheduleTimeFormatHint')}</Text>

            <View style={styles.modalActions}>
              <Pressable
                disabled={formBusy}
                onPress={closeModal}
                style={({ pressed }) => [styles.modalSecondary, pressed && styles.modalSecondaryPressed]}>
                <Text style={styles.modalSecondaryText}>{t('teacherDashboard.groupsCancel')}</Text>
              </Pressable>
              <Pressable
                disabled={formBusy}
                onPress={() => void submitModal()}
                style={({ pressed }) => [
                  styles.modalPrimary,
                  pressed && !formBusy && styles.modalPrimaryPressed,
                ]}>
                {formBusy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalPrimaryText}>{t('teacherDashboard.groupsSave')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </AppScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalScroll: {
    maxHeight: '90%',
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
  modalSectionTitle: { fontSize: 15, fontWeight: '800', color: BRAND_BLUE_DARK, marginBottom: 4 },
  modalDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginVertical: 16,
  },
  modalLabel: { fontSize: 13, fontWeight: '700', color: BRAND_BLUE_DARK, marginBottom: 6 },
  modalLabelSp: { marginTop: 10 },
  dayChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  dayChipTextSelected: { color: BRAND_BLUE_DARK },
  timeRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  timeField: { flex: 1, minWidth: 0 },
  modalHint: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 4,
    lineHeight: 17,
  },
  deliveryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  deliveryOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: PAGE_SURFACE,
  },
  deliveryOptionSelected: {
    borderColor: BRAND_BLUE,
    backgroundColor: BRAND_BLUE,
  },
  deliveryOptionPressed: { opacity: 0.9 },
  deliveryOptionText: {
    fontSize: 13,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
  },
  deliveryOptionTextSelected: {
    color: '#FFFFFF',
  },
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
