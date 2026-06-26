import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Text } from '@/src/theme/Text';
import type { AmPm, ScheduleDateParts, ScheduleTime12Parts } from '@/src/utils/scheduleFormParts';
import {
  combineDateParts,
  datePartsToIso,
  formatDatePartsDisplay,
  formatTime12PartsDisplay,
  isoToDateParts,
} from '@/src/utils/scheduleFormParts';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const BORDER = '#E2E8F0';
const BRAND_BLUE_BORDER = '#BFDBFE';
const PAGE_SURFACE = '#F8FAFC';
const TEXT_MUTED = '#64748B';
const WHEEL_ITEM_HEIGHT = 44;
const WHEEL_VISIBLE_ROWS = 5;

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const AMPM_OPTIONS: AmPm[] = ['AM', 'PM'];
const YEAR_OPTIONS = Array.from({ length: 101 }, (_, i) => String(2000 + i));
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1));

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function dayOptionsFor(parts: ScheduleDateParts): string[] {
  const year = Number(parts.year) || 2000;
  const month = Number(parts.month) || 1;
  const count = daysInMonth(year, month);
  return Array.from({ length: count }, (_, i) => String(i + 1));
}

function monthShortLabel(month: string, locale?: string): string {
  const m = Number(month);
  if (!Number.isFinite(m) || m < 1 || m > 12) return month;
  return new Date(2000, m - 1, 1).toLocaleDateString(locale, { month: 'short' });
}

function clampDateParts(parts: ScheduleDateParts): ScheduleDateParts {
  const year = Number(parts.year) || 2000;
  const month = Number(parts.month) || 1;
  const maxDay = daysInMonth(year, month);
  const day = Math.min(Math.max(1, Number(parts.day) || 1), maxDay);
  return {
    year: String(year),
    month: String(month),
    day: String(day),
  };
}

const WEB_INPUT_STYLE: CSSProperties = {
  width: '100%',
  border: `1.5px solid ${BORDER}`,
  borderRadius: 12,
  padding: '12px 14px',
  fontSize: 15,
  fontWeight: 600,
  color: BRAND_BLUE_DARK,
  backgroundColor: PAGE_SURFACE,
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

type DatePickerProps = {
  value: ScheduleDateParts;
  onChange: (next: ScheduleDateParts) => void;
  placeholder: string;
  doneLabel: string;
  cancelLabel?: string;
  locale?: string;
  editable?: boolean;
};

export function ScheduleDatePickerField({
  value,
  onChange,
  placeholder,
  doneLabel,
  cancelLabel = 'Cancel',
  locale,
  editable = true,
}: DatePickerProps) {
  const iso = datePartsToIso(value) ?? '';
  const display = formatDatePartsDisplay(value, locale);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webWrap}>
        {/* @ts-expect-error web date input */}
        <input
          type="date"
          value={iso}
          disabled={!editable}
          min="2000-01-01"
          max="2100-12-31"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            if (e.target.value) onChange(isoToDateParts(e.target.value));
          }}
          style={WEB_INPUT_STYLE}
        />
      </View>
    );
  }

  return (
    <NativeDatePickerTrigger
      display={display}
      placeholder={placeholder}
      editable={editable}
      doneLabel={doneLabel}
      cancelLabel={cancelLabel}
      locale={locale}
      pickerValue={value}
      onPick={onChange}
    />
  );
}

type TimePickerProps = {
  value: ScheduleTime12Parts;
  onChange: (next: ScheduleTime12Parts) => void;
  placeholder?: string;
  doneLabel?: string;
  cancelLabel?: string;
  ampmLabels?: { am: string; pm: string };
  locale?: string;
  editable?: boolean;
};

export function ScheduleTimePickerField({
  value,
  onChange,
  placeholder = 'Select time',
  doneLabel = 'Done',
  cancelLabel = 'Cancel',
  ampmLabels = { am: 'AM', pm: 'PM' },
  locale,
  editable = true,
}: TimePickerProps) {
  const display = formatTime12PartsDisplay(value, locale);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  const openPicker = () => {
    if (!editable) return;
    setDraft(value);
    setOpen(true);
  };

  const commit = () => {
    onChange(draft);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        disabled={!editable}
        onPress={openPicker}
        style={({ pressed }) => [
          styles.trigger,
          pressed && editable && styles.triggerPressed,
          !editable && styles.triggerDisabled,
        ]}>
        <Text style={[styles.triggerText, !display && styles.triggerPlaceholder]}>
          {display || placeholder}
        </Text>
        <Ionicons name="time-outline" size={20} color={editable ? BRAND_BLUE : TEXT_MUTED} />
      </Pressable>

      <TimeSpinnerSheet
        visible={open}
        value={draft}
        onChange={setDraft}
        onCancel={() => setOpen(false)}
        onDone={commit}
        doneLabel={doneLabel}
        cancelLabel={cancelLabel}
        ampmLabels={ampmLabels}
      />
    </>
  );
}

type TimeSpinnerSheetProps = {
  visible: boolean;
  value: ScheduleTime12Parts;
  onChange: (next: ScheduleTime12Parts) => void;
  onCancel: () => void;
  onDone: () => void;
  doneLabel: string;
  cancelLabel: string;
  ampmLabels: { am: string; pm: string };
};

function TimeSpinnerSheet({
  visible,
  value,
  onChange,
  onCancel,
  onDone,
  doneLabel,
  cancelLabel,
  ampmLabels,
}: TimeSpinnerSheetProps) {
  return (
    <PickerSheetShell
      visible={visible}
      onCancel={onCancel}
      onDone={onDone}
      cancelLabel={cancelLabel}
      doneLabel={doneLabel}>
      <View style={styles.wheelWrap}>
        <View pointerEvents="none" style={styles.wheelHighlight} />
        <View style={styles.wheelRow}>
          <WheelColumn
            items={HOUR_OPTIONS}
            selected={value.hour}
            onSelect={(hour) => onChange({ ...value, hour })}
          />
          <Text style={styles.wheelColon}>:</Text>
          <WheelColumn
            items={MINUTE_OPTIONS}
            selected={value.minute.padStart(2, '0')}
            onSelect={(minute) => onChange({ ...value, minute })}
          />
          <WheelColumn
            items={AMPM_OPTIONS}
            selected={value.ampm}
            labelFor={(item) => (item === 'AM' ? ampmLabels.am : ampmLabels.pm)}
            onSelect={(ampm) => onChange({ ...value, ampm: ampm as AmPm })}
          />
        </View>
      </View>
    </PickerSheetShell>
  );
}

type PickerSheetShellProps = {
  visible: boolean;
  onCancel: () => void;
  onDone: () => void;
  cancelLabel: string;
  doneLabel: string;
  children: ReactNode;
};

function PickerSheetShell({
  visible,
  onCancel,
  onDone,
  cancelLabel,
  doneLabel,
  children,
}: PickerSheetShellProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.sheetOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Pressable onPress={onCancel} hitSlop={8}>
              <Text style={styles.sheetCancel}>{cancelLabel}</Text>
            </Pressable>
            <Pressable onPress={onDone} hitSlop={8}>
              <Text style={styles.sheetDone}>{doneLabel}</Text>
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

type DateSpinnerSheetProps = {
  visible: boolean;
  value: ScheduleDateParts;
  onChange: (next: ScheduleDateParts) => void;
  onCancel: () => void;
  onDone: () => void;
  doneLabel: string;
  cancelLabel: string;
  locale?: string;
};

function DateSpinnerSheet({
  visible,
  value,
  onChange,
  onCancel,
  onDone,
  doneLabel,
  cancelLabel,
  locale,
}: DateSpinnerSheetProps) {
  const dayOptions = useMemo(() => dayOptionsFor(value), [value.year, value.month]);

  const setMonth = (month: string) => {
    onChange(clampDateParts({ ...value, month }));
  };

  const setDay = (day: string) => {
    onChange(clampDateParts({ ...value, day }));
  };

  const setYear = (year: string) => {
    onChange(clampDateParts({ ...value, year }));
  };

  return (
    <PickerSheetShell
      visible={visible}
      onCancel={onCancel}
      onDone={onDone}
      cancelLabel={cancelLabel}
      doneLabel={doneLabel}>
      <View style={styles.wheelWrap}>
        <View pointerEvents="none" style={styles.wheelHighlight} />
        <View style={styles.wheelRow}>
          <WheelColumn
            items={MONTH_OPTIONS}
            selected={value.month}
            labelFor={(item) => monthShortLabel(item, locale)}
            onSelect={setMonth}
            width={88}
          />
          <WheelColumn
            items={dayOptions}
            selected={value.day}
            onSelect={setDay}
            width={56}
          />
          <WheelColumn
            items={YEAR_OPTIONS}
            selected={value.year}
            onSelect={setYear}
            width={80}
          />
        </View>
      </View>
    </PickerSheetShell>
  );
}

type WheelColumnProps = {
  items: readonly string[];
  selected: string;
  onSelect: (item: string) => void;
  labelFor?: (item: string) => string;
  width?: number;
};

function WheelColumn({ items, selected, onSelect, labelFor, width = 72 }: WheelColumnProps) {
  const scrollRef = useRef<ScrollView>(null);
  const selectedIndex = Math.max(0, items.indexOf(selected));

  useEffect(() => {
    if (selectedIndex < 0) return;
    scrollRef.current?.scrollTo({
      y: selectedIndex * WHEEL_ITEM_HEIGHT,
      animated: false,
    });
  }, [selectedIndex, items]);

  const snapToNearest = (y: number) => {
    const index = Math.min(items.length - 1, Math.max(0, Math.round(y / WHEEL_ITEM_HEIGHT)));
    onSelect(items[index] ?? items[0]);
    scrollRef.current?.scrollTo({ y: index * WHEEL_ITEM_HEIGHT, animated: true });
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    snapToNearest(e.nativeEvent.contentOffset.y);
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.wheelColumn, { width }]}
      contentContainerStyle={styles.wheelColumnContent}
      showsVerticalScrollIndicator={false}
      snapToInterval={WHEEL_ITEM_HEIGHT}
      decelerationRate="fast"
      onMomentumScrollEnd={onScrollEnd}
      onScrollEndDrag={onScrollEnd}
      nestedScrollEnabled>
      {items.map((item) => {
        const active = item === selected;
        const label = labelFor ? labelFor(item) : item;
        return (
          <Pressable
            key={item}
            onPress={() => onSelect(item)}
            style={({ pressed }) => [styles.wheelItem, pressed && styles.wheelItemPressed]}>
            <Text style={[styles.wheelItemText, active && styles.wheelItemTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

type NativeDatePickerTriggerProps = {
  display: string;
  placeholder: string;
  editable: boolean;
  doneLabel: string;
  cancelLabel: string;
  locale?: string;
  pickerValue: ScheduleDateParts;
  onPick: (parts: ScheduleDateParts) => void;
};

function NativeDatePickerTrigger({
  display,
  placeholder,
  editable,
  doneLabel,
  cancelLabel,
  locale,
  pickerValue,
  onPick,
}: NativeDatePickerTriggerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(pickerValue);

  const openPicker = () => {
    if (!editable) return;
    setDraft(clampDateParts(pickerValue));
    setOpen(true);
  };

  const commit = () => {
    const clamped = clampDateParts(draft);
    if (!('error' in combineDateParts(clamped))) {
      onPick(clamped);
    }
    setOpen(false);
  };

  return (
    <>
      <Pressable
        disabled={!editable}
        onPress={openPicker}
        style={({ pressed }) => [
          styles.trigger,
          pressed && editable && styles.triggerPressed,
          !editable && styles.triggerDisabled,
        ]}>
        <Text style={[styles.triggerText, !display && styles.triggerPlaceholder]}>
          {display || placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={20} color={editable ? BRAND_BLUE : TEXT_MUTED} />
      </Pressable>

      <DateSpinnerSheet
        visible={open}
        value={draft}
        onChange={setDraft}
        onCancel={() => setOpen(false)}
        onDone={commit}
        doneLabel={doneLabel}
        cancelLabel={cancelLabel}
        locale={locale}
      />
    </>
  );
}

const styles = StyleSheet.create({
  webWrap: { width: '100%' },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: PAGE_SURFACE,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {}),
  },
  triggerPressed: { borderColor: BRAND_BLUE, backgroundColor: '#EFF6FF' },
  triggerDisabled: { opacity: 0.55 },
  triggerText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  triggerPlaceholder: { color: TEXT_MUTED, fontWeight: '600' },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  sheetCancel: { fontSize: 16, fontWeight: '600', color: TEXT_MUTED },
  sheetDone: { fontSize: 16, fontWeight: '800', color: BRAND_BLUE },
  wheelWrap: {
    position: 'relative',
    height: WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ROWS,
    marginHorizontal: 12,
    marginTop: 8,
  },
  wheelHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: WHEEL_ITEM_HEIGHT * 2,
    height: WHEEL_ITEM_HEIGHT,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: BRAND_BLUE_BORDER,
    zIndex: 0,
  },
  wheelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    zIndex: 1,
  },
  wheelColumn: {
    height: WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ROWS,
  },
  wheelColumnContent: {
    paddingVertical: WHEEL_ITEM_HEIGHT * 2,
  },
  wheelItem: {
    height: WHEEL_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemPressed: { opacity: 0.75 },
  wheelItemText: {
    fontSize: 20,
    fontWeight: '600',
    color: TEXT_MUTED,
  },
  wheelItemTextActive: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
  },
  wheelColon: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    marginHorizontal: 4,
    marginBottom: 2,
  },
});
