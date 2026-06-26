import type { ComponentType } from 'react';

import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';

export type { DateTimePickerEvent };

type PickerProps = {
  value: Date;
  mode: 'date' | 'time';
  display?: 'default' | 'spinner';
  is24Hour?: boolean;
  minimumDate?: Date;
  maximumDate?: Date;
  onChange: (event: DateTimePickerEvent, selected?: Date) => void;
  style?: object;
};

/** Web builds never render the native picker; stub keeps shared schedule UI type-safe. */
const DateTimePicker: ComponentType<PickerProps> | null = null;

export default DateTimePicker;
