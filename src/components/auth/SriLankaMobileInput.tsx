import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, type StyleProp, type TextStyle, View, type ViewStyle } from 'react-native';

import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import {
  isValidSriLankaMobile,
  sanitizeSriLankaMobileInput,
  validateSriLankaMobile,
} from '@/src/utils/sriLankaMobile';

type SriLankaMobileInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  onValidE164Change?: (e164: string | null) => void;
  label?: string;
  placeholder?: string;
  hint?: string;
  errorMessage?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  inputStyle?: StyleProp<TextStyle>;
  showHint?: boolean;
  validateOnBlur?: boolean;
  testID?: string;
};

export function SriLankaMobileInput({
  value,
  onChangeText,
  onValidE164Change,
  label,
  placeholder,
  hint,
  errorMessage,
  containerStyle,
  labelStyle,
  inputStyle,
  showHint = true,
  validateOnBlur = true,
  testID,
}: SriLankaMobileInputProps) {
  const { t } = useTranslation();
  const [touched, setTouched] = useState(false);

  const handleChange = (nextRaw: string) => {
    const sanitized = sanitizeSriLankaMobileInput(nextRaw);
    onChangeText(sanitized);
    const validation = validateSriLankaMobile(sanitized);
    onValidE164Change?.(validation.ok ? validation.e164 : null);
    if (touched && validation.ok) setTouched(false);
  };

  const handleBlur = () => {
    if (!validateOnBlur) return;
    if (value.trim()) setTouched(true);
  };

  const blurError =
    touched && value.trim() && !isValidSriLankaMobile(value)
      ? t('signup.errors.mobileInvalid')
      : null;

  const displayedError = errorMessage ?? blurError;
  const resolvedHint = hint ?? t('signup.usernameHint');
  const resolvedPlaceholder = placeholder ?? t('signup.usernamePlaceholder');

  return (
    <View style={containerStyle}>
      {label ? <Text style={labelStyle}>{label}</Text> : null}
      <TextInput
        testID={testID}
        value={value}
        onChangeText={handleChange}
        onBlur={handleBlur}
        placeholder={resolvedPlaceholder}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="phone-pad"
        maxLength={12}
        style={inputStyle}
        placeholderTextColor="#94A3B8"
      />
      {displayedError ? (
        <Text style={styles.fieldError}>{displayedError}</Text>
      ) : showHint && !displayedError ? (
        <Text style={styles.hint}>{resolvedHint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldError: {
    marginTop: 6,
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  hint: {
    marginTop: 6,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    lineHeight: 17,
  },
});

export default SriLankaMobileInput;
