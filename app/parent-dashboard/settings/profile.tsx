import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ParentProfileStudentsSection from '@/src/components/parent/ParentProfileStudentsSection';
import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import { supabase } from '@/src/services/supabaseClient';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

const BRAND_BLUE_DARK = '#0E2F63';
const BRAND_BLUE = '#123B7A';
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
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={BRAND_BLUE} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => routerBackOrReplace(router, appHref(AppRoutes.parentDashboard))}
          style={({ pressed }) => [styles.backRow, pressed && { opacity: 0.75 }]}>
          <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
          <Text style={styles.backLabel}>{t('appLock.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('parentDashboard.profileTitle')}</Text>
        <Text style={styles.subtitle}>{t('parentDashboard.profileSubtitle')}</Text>
      </View>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: SURFACE_ALT },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 12,
    backgroundColor: SURFACE,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  backLabel: { fontSize: 15, fontWeight: '700', color: BRAND_BLUE_DARK },
  title: { fontSize: 22, fontWeight: '900', color: BRAND_BLUE_DARK, letterSpacing: -0.2 },
  subtitle: { fontSize: 13.5, color: TEXT_MUTED, marginTop: 2 },
  content: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 32, gap: 14 },
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
