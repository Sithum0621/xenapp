import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import { supabase } from '@/src/services/supabaseClient';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';

export default function TeacherPasswordSettings() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const updatePassword = async () => {
    const nextPassword = password.trim();
    if (nextPassword.length < 6) {
      appAlert('Password Management', 'New password must be at least 6 characters.');
      return;
    }
    if (nextPassword !== confirm.trim()) {
      appAlert('Password Management', 'Passwords do not match.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: nextPassword });
    setSaving(false);

    if (error) {
      appAlert('Password update failed', error.message);
      return;
    }

    setPassword('');
    setConfirm('');
    appAlert('Password updated', 'Your password was updated successfully.');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => routerBackOrReplace(router, appHref(AppRoutes.teacherDashboard))}
          style={({ pressed }) => [styles.backRow, pressed && { opacity: 0.75 }]}>
          <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Password Management</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.subtitle}>
          Set a new password for your account. Use at least 6 characters.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>New password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Enter new password"
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Confirm password"
            style={styles.input}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => void updatePassword()}
          disabled={saving}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.primaryBtnPressed,
            saving && styles.primaryBtnDisabled,
          ]}>
          <Ionicons name="key-outline" size={18} color="#FFFFFF" />
          <Text style={styles.primaryBtnText}>{saving ? 'Updating...' : 'Update Password'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12, alignSelf: 'flex-start' },
  backLabel: { fontSize: 16, fontWeight: '700', color: BRAND_BLUE_DARK },
  title: { fontSize: 22, fontWeight: '800', color: BRAND_BLUE_DARK, paddingHorizontal: 8 },
  card: {
    margin: 16,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_MUTED,
    lineHeight: 20,
    marginBottom: 8,
  },
  field: {
    marginTop: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 12,
    color: BRAND_BLUE_DARK,
    backgroundColor: '#FFFFFF',
  },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: BRAND_BLUE,
    borderRadius: 12,
    minHeight: 44,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryBtnPressed: {
    opacity: 0.85,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
