import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/theme/Text';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';

export type TeacherRegisterStudentCredentialsViewProps = {
  username: string;
  password: string;
  title: string;
  subtitle: string;
  usernameLabel: string;
  usernameFormatHint?: string;
  passwordLabel: string;
  doneLabel: string;
  onDone: () => void;
};

function TeacherRegisterStudentCredentialsView({
  username,
  password,
  title,
  subtitle,
  usernameLabel,
  usernameFormatHint,
  passwordLabel,
  doneLabel,
  onDone,
}: TeacherRegisterStudentCredentialsViewProps) {
  return (
    <View>
      <View style={styles.successIconWrap}>
        <Ionicons name="checkmark-circle" size={40} color="#16A34A" />
      </View>
      <Text style={styles.modalTitle}>{title}</Text>
      <Text style={styles.modalHint}>{subtitle}</Text>

      <Text style={styles.label}>{usernameLabel}</Text>
      <View style={styles.credentialBox}>
        <Text style={styles.credentialValue} selectable>
          {username}
        </Text>
      </View>
      {usernameFormatHint ? (
        <Text style={styles.formatHint}>{usernameFormatHint}</Text>
      ) : null}

      <Text style={styles.label}>{passwordLabel}</Text>
      <View style={styles.credentialBox}>
        <Text style={styles.credentialValue} selectable>
          {password}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onDone}
        style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.92 }]}>
        <Text style={styles.primaryBtnText}>{doneLabel}</Text>
      </Pressable>
    </View>
  );
}

export default memo(TeacherRegisterStudentCredentialsView);

const styles = StyleSheet.create({
  successIconWrap: {
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    marginBottom: 6,
    textAlign: 'center',
  },
  modalHint: {
    fontSize: 13,
    color: TEXT_MUTED,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 14,
    textAlign: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: TEXT_MUTED,
    marginBottom: 6,
    marginTop: 4,
  },
  credentialBox: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  credentialValue: {
    fontSize: 16,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    letterSpacing: 0.3,
  },
  formatHint: {
    fontSize: 11,
    color: TEXT_MUTED,
    fontWeight: '600',
    marginBottom: 4,
    marginTop: -4,
  },
  primaryBtn: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontWeight: '800',
    color: '#FFFFFF',
    fontSize: 14,
  },
});
