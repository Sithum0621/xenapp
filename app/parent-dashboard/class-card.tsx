import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import DigitalStudentIdCard from '@/src/components/parent/DigitalStudentIdCard';
import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import GenerateClassCardPdfButton from '@/src/components/parent/GenerateClassCardPdfButton';
import RequestPremiumClassCardButton from '@/src/components/parent/RequestPremiumClassCardButton';
import {
  fetchStudentClassCard,
  type StudentClassCardData,
} from '@/src/services/studentClassCardApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';

const BRAND_BLUE_DARK = '#0E2F63';
const BRAND_BLUE = '#123B7A';
const TEXT_MUTED = '#64748B';
const BORDER = '#E2E8F0';
const SURFACE = '#FFFFFF';
const SURFACE_ALT = '#F4F6FA';

export default function ParentClassCardScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ studentId?: string | string[] }>();
  const studentId = Array.isArray(params.studentId)
    ? params.studentId[0]
    : params.studentId;

  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<StudentClassCardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCard = useCallback(async () => {
    if (!studentId) {
      setLoading(false);
      setCard(null);
      setError(t('parentDashboard.myClassCardErrorNoStudent'));
      return;
    }

    setLoading(true);
    setError(null);

    const result = await fetchStudentClassCard(studentId);
    setLoading(false);

    if (result.ok) {
      setCard(result.card);
      return;
    }

    setCard(null);
    if (result.code === 'not_authorized') {
      setError(t('parentDashboard.myClassCardErrorNotAuthorized'));
    } else if (result.code === 'student_not_found') {
      setError(t('parentDashboard.myClassCardErrorNotFound'));
    } else {
      setError(t('parentDashboard.myClassCardErrorGeneric'));
    }
  }, [studentId, t]);

  useEffect(() => {
    void loadCard();
  }, [loadCard]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('appLock.back')}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}>
          <Ionicons name="chevron-back" size={22} color={BRAND_BLUE_DARK} />
          <Text style={styles.backLabel}>{t('appLock.back')}</Text>
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardExtraPadding={32}>
        <Text style={styles.screenTitle}>{t('parentDashboard.myClassCardTitle')}</Text>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={BRAND_BLUE} />
            <Text style={styles.statusText}>{t('parentDashboard.myClassCardLoading')}</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={styles.messageCard}>
            <Ionicons name="alert-circle-outline" size={28} color={BRAND_BLUE} />
            <Text style={styles.messageTitle}>{t('parentDashboard.myClassCardErrorTitle')}</Text>
            <Text style={styles.messageBody}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadCard()}
              style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}>
              <Text style={styles.retryLabel}>{t('parentDashboard.myClassCardRetry')}</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && card ? (
          <View style={styles.cardSection}>
            <DigitalStudentIdCard card={card} />
            <GenerateClassCardPdfButton card={card} />
            <Text style={styles.orDivider}>{t('parentDashboard.myClassCardOr')}</Text>
            <RequestPremiumClassCardButton studentUserId={studentId} />
          </View>
        ) : null}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: SURFACE_ALT },
  topBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: SURFACE,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  backBtnPressed: { opacity: 0.7 },
  backLabel: {
    fontSize: 15,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
  },
  scroll: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  screenTitle: {
    fontSize: 18,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    textAlign: 'center',
  },
  centered: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 40,
  },
  statusText: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
  },
  messageCard: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 10,
  },
  messageTitle: {
    fontSize: 17,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    textAlign: 'center',
  },
  messageBody: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
  },
  retryBtnPressed: { opacity: 0.88 },
  retryLabel: {
    fontSize: 14,
    fontFamily: FontFamily.bold,
    color: '#FFFFFF',
  },
  cardSection: {
    width: '100%',
    gap: 16,
    alignItems: 'stretch',
  },
  orDivider: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
    textAlign: 'center',
    marginVertical: 2,
  },
});
