import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { StyleProp, StyleSheet, TextStyle } from 'react-native';

import type { InstituteFormValues } from '@/src/utils/instituteFormValidation';

type Props = {
  values: InstituteFormValues;
  onChange: (patch: Partial<InstituteFormValues>) => void;
  editable?: boolean;
  fieldLabelStyle?: StyleProp<TextStyle>;
  inputStyle?: StyleProp<TextStyle>;
  showName?: boolean;
};

export default function InstituteDetailsFormFields({
  values,
  onChange,
  editable = true,
  fieldLabelStyle,
  inputStyle,
  showName = true,
}: Props) {
  const { t } = useTranslation();
  const labelStyle = fieldLabelStyle ?? styles.fieldLabel;
  const input = inputStyle ?? styles.input;

  return (
    <>
      {showName ? (
        <>
          <Text style={labelStyle}>{t('superAdmin.instituteNameLabel')}</Text>
          <TextInput
            value={values.name}
            onChangeText={(name) => onChange({ name })}
            placeholder={t('superAdmin.instituteNamePlaceholder')}
            placeholderTextColor="#94A3B8"
            style={input}
            editable={editable}
          />
        </>
      ) : null}

      <Text style={labelStyle}>{t('superAdmin.instituteAddressLine1Label')}</Text>
      <TextInput
        value={values.addressLine1}
        onChangeText={(addressLine1) => onChange({ addressLine1 })}
        placeholder={t('superAdmin.instituteAddressLine1Placeholder')}
        placeholderTextColor="#94A3B8"
        style={input}
        editable={editable}
        autoCapitalize="words"
      />

      <Text style={labelStyle}>{t('superAdmin.instituteAddressLine2Label')}</Text>
      <TextInput
        value={values.addressLine2}
        onChangeText={(addressLine2) => onChange({ addressLine2 })}
        placeholder={t('superAdmin.instituteAddressLine2Placeholder')}
        placeholderTextColor="#94A3B8"
        style={input}
        editable={editable}
        autoCapitalize="words"
      />

      <Text style={labelStyle}>{t('superAdmin.instituteEmailLabel')}</Text>
      <TextInput
        value={values.email}
        onChangeText={(email) => onChange({ email })}
        placeholder={t('superAdmin.instituteEmailPlaceholder')}
        placeholderTextColor="#94A3B8"
        style={input}
        editable={editable}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />

      <Text style={labelStyle}>{t('superAdmin.instituteContactNumberLabel')}</Text>
      <TextInput
        value={values.contactNumber}
        onChangeText={(contactNumber) => onChange({ contactNumber })}
        placeholder={t('superAdmin.instituteContactNumberPlaceholder')}
        placeholderTextColor="#94A3B8"
        style={input}
        editable={editable}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="phone-pad"
      />

      <Text style={labelStyle}>{t('superAdmin.instituteNotesLabel')}</Text>
      <TextInput
        value={values.notes}
        onChangeText={(notes) => onChange({ notes })}
        placeholder={t('superAdmin.instituteNotesPlaceholder')}
        placeholderTextColor="#94A3B8"
        style={input}
        editable={editable}
        multiline
      />
    </>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0E2F63',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    minHeight: 44,
    marginBottom: 4,
    textAlignVertical: 'top',
  },
});
