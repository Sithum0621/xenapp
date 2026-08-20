import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import ParentProfileStudentsSection from '@/src/components/parent/ParentProfileStudentsSection';
import DashboardScreenShell from '@/src/components/layout/DashboardScreenShell';
import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import { supabase } from '@/src/services/supabaseClient';
import { PAGE_CONTENT_BOTTOM, PAGE_EDGE_INSET } from '@/src/theme/pageLayout';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

const BRAND_BLUE_DARK = '#00101F';
const BRAND_BLUE = '#041830';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const SURFACE = '#FFFFFF';
const SURFACE_ALT = '#F8FAFC';

export default function ParentProfileSettings() {
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!mounted) return;
      setEmail(user?.email ?? '');

      if (user?.id) {
        const [coreRes, contactRes] = await Promise.all([
          supabase.from('profiles_core').select('full_name').eq('id', user.id).maybeSingle(),
          supabase.from('profiles_contact').select('mobile_number').eq('id', user.id).maybeSingle(),
        ]);
        if (!mounted) return;
        setFullName((coreRes.data?.full_name as string | undefined)?.trim() ?? '');
        setMobile((contactRes.data?.mobile_number as string | undefined)?.trim() ?? '');
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <DashboardScreenShell showBack title={t('parentDashboard.profileTitle')}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={BRAND_BLUE} />
        </View>
      </DashboardScreenShell>
    );
  }

  return (
    <DashboardScreenShell
      showBack
      title={t('parentDashboard.profileTitle')}
      subtitle={t('parentDashboard.profileSubtitle')}
      onBack={() => routerBackOrReplace(router, appHref(AppRoutes.parentDashboard))}
      padContent={false}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardExtraPadding={32}>
        <View style={styles.field}>
          <Text style={styles.label}>{t('parentDashboard.profileEmailLabel')}</Text>
          <TextInput
            value={email}
            editable={false}
            style={[styles.input, styles.inputDisabled]}
            accessibilityLabel={t('parentDashboard.profileEmailLabel')}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('parentDashboard.profileNameLabel')}</Text>
          <TextInput
            value={fullName}
            editable={false}
            style={[styles.input, styles.inputDisabled]}
            placeholder={t('parentDashboard.profilePlaceholderNote')}
            placeholderTextColor={TEXT_MUTED}
            accessibilityLabel={t('parentDashboard.profileNameLabel')}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('parentDashboard.profileMobileLabel')}</Text>
          <TextInput
            value={mobile}
            editable={false}
            style={[styles.input, styles.inputDisabled]}
            accessibilityLabel={t('parentDashboard.profileMobileLabel')}
          />
        </View>

        <Text style={styles.note}>{t('parentDashboard.profilePlaceholderNote')}</Text>

        <ParentProfileStudentsSection />
      </KeyboardAwareScrollView>
    </DashboardScreenShell>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: 12,
    paddingBottom: PAGE_CONTENT_BOTTOM,
    gap: 14,
  },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: BRAND_BLUE_DARK },
  input: {
    backgroundColor: SURFACE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14.5,
    color: BRAND_BLUE_DARK,
  },
  inputDisabled: { backgroundColor: SURFACE_ALT, color: TEXT_MUTED },
  note: { fontSize: 12.5, color: TEXT_MUTED, lineHeight: 18, marginTop: 6 },
});
