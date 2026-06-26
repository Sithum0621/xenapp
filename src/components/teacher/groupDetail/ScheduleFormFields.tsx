import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import type { AmPm, ScheduleDateParts, ScheduleTime12Parts } from '@/src/utils/scheduleFormParts';
import { sanitizeNumericInput } from '@/src/utils/scheduleFormParts';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const BORDER = '#E2E8F0';
const PAGE_SURFACE = '#F8FAFC';
const TEXT_MUTED = '#64748B';

type DateFieldsProps = {
  value: ScheduleDateParts;
  onChange: (next: ScheduleDateParts) => void;
  labels: { year: string; month: string; day: string };
  placeholders: { year: string; month: string; day: string };
  editable?: boolean;
};

export function ScheduleDateFields({
  value,
  onChange,
  labels,
  placeholders,
  editable = true,
}: DateFieldsProps) {
  return (
    <View style={styles.splitRow}>
      <View style={styles.splitColWide}>
        <Text style={styles.splitLabel}>{labels.year}</Text>
        <TextInput
          value={value.year}
          onChangeText={(t) => onChange({ ...value, year: sanitizeNumericInput(t, 4) })}
          placeholder={placeholders.year}
          placeholderTextColor={TEXT_MUTED}
          keyboardType="number-pad"
          maxLength={4}
          editable={editable}
          style={styles.input}
        />
      </View>
      <View style={styles.splitCol}>
        <Text style={styles.splitLabel}>{labels.month}</Text>
        <TextInput
          value={value.month}
          onChangeText={(t) => onChange({ ...value, month: sanitizeNumericInput(t, 2) })}
          placeholder={placeholders.month}
          placeholderTextColor={TEXT_MUTED}
          keyboardType="number-pad"
          maxLength={2}
          editable={editable}
          style={styles.input}
        />
      </View>
      <View style={styles.splitCol}>
        <Text style={styles.splitLabel}>{labels.day}</Text>
        <TextInput
          value={value.day}
          onChangeText={(t) => onChange({ ...value, day: sanitizeNumericInput(t, 2) })}
          placeholder={placeholders.day}
          placeholderTextColor={TEXT_MUTED}
          keyboardType="number-pad"
          maxLength={2}
          editable={editable}
          style={styles.input}
        />
      </View>
    </View>
  );
}

type Time12FieldsProps = {
  value: ScheduleTime12Parts;
  onChange: (next: ScheduleTime12Parts) => void;
  labels: { hour: string; minute: string; ampm: string };
  placeholders: { hour: string; minute: string };
  ampmLabels: { am: string; pm: string };
  editable?: boolean;
};

export function ScheduleTime12Fields({
  value,
  onChange,
  labels,
  placeholders,
  ampmLabels,
  editable = true,
}: Time12FieldsProps) {
  return (
    <View style={styles.splitRow}>
      <View style={styles.splitCol}>
        <Text style={styles.splitLabel}>{labels.hour}</Text>
        <TextInput
          value={value.hour}
          onChangeText={(t) => onChange({ ...value, hour: sanitizeNumericInput(t, 2) })}
          placeholder={placeholders.hour}
          placeholderTextColor={TEXT_MUTED}
          keyboardType="number-pad"
          maxLength={2}
          editable={editable}
          style={styles.input}
        />
      </View>
      <View style={styles.splitCol}>
        <Text style={styles.splitLabel}>{labels.minute}</Text>
        <TextInput
          value={value.minute}
          onChangeText={(t) => onChange({ ...value, minute: sanitizeNumericInput(t, 2) })}
          placeholder={placeholders.minute}
          placeholderTextColor={TEXT_MUTED}
          keyboardType="number-pad"
          maxLength={2}
          editable={editable}
          style={styles.input}
        />
      </View>
      <View style={styles.splitColAmPm}>
        <Text style={styles.splitLabel}>{labels.ampm}</Text>
        <View style={styles.ampmRow}>
          {(['AM', 'PM'] as AmPm[]).map((slot) => {
            const selected = value.ampm === slot;
            const label = slot === 'AM' ? ampmLabels.am : ampmLabels.pm;
            return (
              <Pressable
                key={slot}
                disabled={!editable}
                onPress={() => onChange({ ...value, ampm: slot })}
                style={({ pressed }) => [
                  styles.ampmChip,
                  selected && styles.ampmChipSelected,
                  pressed && editable && styles.ampmChipPressed,
                ]}>
                <Text style={[styles.ampmChipText, selected && styles.ampmChipTextSelected]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  splitRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  splitColWide: { flex: 1.4, minWidth: 0 },
  splitCol: { flex: 1, minWidth: 0 },
  splitColAmPm: { flex: 1.2, minWidth: 0 },
  splitLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_MUTED,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: PAGE_SURFACE,
    color: BRAND_BLUE_DARK,
    textAlign: 'center',
  },
  ampmRow: { flexDirection: 'row', gap: 6 },
  ampmChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 10,
    backgroundColor: PAGE_SURFACE,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {}),
  },
  ampmChipSelected: {
    borderColor: BRAND_BLUE,
    backgroundColor: '#EFF6FF',
  },
  ampmChipPressed: { opacity: 0.88 },
  ampmChipText: { fontSize: 13, fontWeight: '800', color: TEXT_MUTED },
  ampmChipTextSelected: { color: BRAND_BLUE_DARK },
});
