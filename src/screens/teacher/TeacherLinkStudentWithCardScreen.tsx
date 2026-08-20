import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import DashboardScreenShell from '@/src/components/layout/DashboardScreenShell';
import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import TeacherStudentQrScanner from '@/src/components/teacher/groupDetail/TeacherStudentQrScanner';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import { teacherStudentEnrollLinkByMobile } from '@/src/services/teacherStudentEnrollApi';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { FontFamily } from '@/src/theme/fonts';
import { PAGE_CONTENT_BOTTOM, PAGE_EDGE_INSET } from '@/src/theme/pageLayout';
import { appAlert } from '@/src/utils/appAlert';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';
import { parseSriLankaMobile, sanitizeSriLankaMobileInput } from '@/src/utils/sriLankaMobile';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const TEXT_MUTED = '#64748B';
const BORDER = '#E2E8F0';
const SURFACE = '#FFFFFF';

export default function TeacherLinkStudentWithCardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const ov = (k: string, opts?: Record<string, unknown>) =>
    t(`teacherDashboard.overview.${k}`, opts);
  const gd = (k: string) => t(`teacherDashboard.groupDetail.${k}`);

  const [cardToken, setCardToken] = useState<string | null>(null);
  const [mobile, setMobile] = useState('');
  const [busy, setBusy] = useState(false);

  const goHome = () => routerBackOrReplace(router, appHref(AppRoutes.teacherDashboard));

  const resetScan = () => {
    setCardToken(null);
    setMobile('');
  };

  const linkErrorMessage = (code: string | undefined) => {
    if (code === 'student_not_found') return gd('enrollErrMobileNotFound');
    if (code === 'card_already_linked') return gd('enrollErrCardAlreadyLinked');
    if (code === 'card_owned_by_other') return gd('enrollErrCardOwned');
    if (code === 'card_required') return gd('enrollErrCardRequired');
    if (code === 'invalid_username') return gd('enrollErrInvalidUsername');
    if (code === 'unauthorized') return gd('enrollErrSession');
    if (code === 'network_error' || code === 'invoke_failed' || code === 'edge_http_error') {
      return gd('enrollErrNetwork');
    }
    return gd('enrollErrGeneric');
  };

  const submit = async () => {
    const phone = parseSriLankaMobile(mobile);
    if (!phone) {
      appAlert(gd('registerValidationTitle'), gd('enrollErrInvalidUsername'));
      return;
    }
    if (!cardToken) {
      appAlert(gd('workspaceError'), gd('enrollErrCardRequired'));
      return;
    }

    setBusy(true);
    try {
      const { ok, error } = await teacherStudentEnrollLinkByMobile({
        mobile_number: phone,
        card_token: cardToken,
      });
      if (!ok) {
        appAlert(gd('workspaceError'), linkErrorMessage(error));
        return;
      }
      appAlert(ov('linkStudentWithCardSuccessTitle'), ov('linkStudentWithCardSuccessBody'));
      goHome();
    } catch {
      appAlert(gd('workspaceError'), gd('enrollErrNetwork'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardScreenShell
      showBack
      title={ov('linkStudentWithCardButton')}
      onBack={goHome}
      padContent={false}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardExtraPadding={32}>
        <View style={styles.card}>
          {busy ? (
            <View style={styles.busy}>
              <ActivityIndicator color={BRAND_BLUE} />
              <Text style={styles.busyText}>{gd('linkEnrolling')}</Text>
            </View>
          ) : cardToken ? (
            <>
              <Text style={styles.title}>{ov('linkStudentWithCardScannedTitle')}</Text>
              <Text style={styles.hint}>{ov('linkStudentWithCardScannedHint')}</Text>
              <Text style={styles.label}>{gd('linkMobileLabel')}</Text>
              <TextInput
                value={mobile}
                onChangeText={(text) => setMobile(sanitizeSriLankaMobileInput(text))}
                placeholder={gd('linkMobilePlaceholder')}
                keyboardType="phone-pad"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                style={styles.input}
              />
              <View style={styles.actions}>
                <Pressable onPress={resetScan} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryText}>{t('teacherDashboard.groupsCancel')}</Text>
                </Pressable>
                <Pressable onPress={() => void submit()} style={styles.primaryBtn}>
                  <Text style={styles.primaryText}>{gd('linkMobileSubmit')}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.hint}>{ov('linkStudentWithCardHint')}</Text>
              <TeacherStudentQrScanner
                hideIntro
                issuedCardsOnly
                onClose={goHome}
                onParsedId={() => undefined}
                onParsedIssuedCard={(token) => setCardToken(token)}
              />
            </>
          )}
        </View>
      </KeyboardAwareScrollView>
    </DashboardScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: 8,
    paddingBottom: PAGE_CONTENT_BOTTOM,
  },
  card: {
    backgroundColor: SURFACE,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 16,
  },
  title: {
    fontSize: 17,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    marginBottom: 6,
  },
  hint: {
    fontSize: 13,
    color: TEXT_MUTED,
    fontFamily: FontFamily.regular,
    lineHeight: 18,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontFamily: FontFamily.bold,
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
    color: BRAND_BLUE_DARK,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondaryBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: { fontFamily: FontFamily.bold, color: BRAND_BLUE_DARK, fontSize: 14 },
  primaryBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryText: { fontFamily: FontFamily.bold, color: '#FFFFFF', fontSize: 14 },
  busy: { paddingVertical: 40, alignItems: 'center', gap: 12 },
  busyText: { fontSize: 14, fontFamily: FontFamily.bold, color: TEXT_MUTED },
});
