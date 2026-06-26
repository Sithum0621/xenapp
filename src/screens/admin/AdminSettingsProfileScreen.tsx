import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ScrollView } from '@/src/components/layout/scroll';

import { useAdminLayout } from '@/src/hooks/useAdminLayout';
import { supabase } from '@/src/services/supabaseClient';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const TEXT_MUTED = '#64748B';
const SUBTLE_BORDER = '#E2E8F0';

export default function AdminSettingsProfileScreen() {
  const { t } = useTranslation();
  const { contentPadding } = useAdminLayout();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!mounted) return;
      setEmail(user?.email ?? '');

      if (user?.id) {
        const { data: profile } = await supabase
          .from('profiles_core')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();
        if (!mounted) return;
        setFullName((profile?.full_name as string | undefined)?.trim() ?? '');
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={BRAND_BLUE} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, contentPadding]}>
      <Text style={styles.sectionLead}>{t('adminPortal.profileSubtitle')}</Text>

      <View style={styles.field}>
        <Text style={styles.label}>{t('adminPortal.profileEmailLabel')}</Text>
        <TextInput value={email} editable={false} style={[styles.input, styles.inputDisabled]} />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('adminPortal.profileNameLabel')}</Text>
        <TextInput value={fullName} editable={false} style={[styles.input, styles.inputDisabled]} />
      </View>

      <Text style={styles.note}>{t('adminPortal.profilePlaceholderNote')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scroll: { flex: 1 },
  content: { flexGrow: 1, width: '100%' },
  sectionLead: {
    fontSize: 15,
    color: TEXT_MUTED,
    marginBottom: 20,
    lineHeight: 22,
  },
  field: { marginBottom: 16, width: '100%' },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 16,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    width: '100%',
  },
  inputDisabled: {
    backgroundColor: '#F1F5F9',
    color: TEXT_MUTED,
  },
  note: {
    fontSize: 13,
    color: TEXT_MUTED,
    lineHeight: 20,
    marginTop: 8,
  },
});
