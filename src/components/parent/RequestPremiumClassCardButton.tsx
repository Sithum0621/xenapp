import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { requestPremiumClassCard } from '@/src/services/parentPremiumCardApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';

const BRAND_BLUE_DARK = '#0E2F63';
const BRAND_BLUE = '#123B7A';
const SURFACE = '#FFFFFF';

type Props = {
  studentUserId: string;
};

export default function RequestPremiumClassCardButton({ studentUserId }: Props) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  const onPress = () => {
    if (!studentUserId.trim() || submitting) return;

    appAlert(
      t('parentDashboard.myClassCardRequestPremiumTitle'),
      t('parentDashboard.myClassCardRequestPremiumConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('parentDashboard.myClassCardRequestPremiumSubmit'),
          onPress: () => void submitRequest(),
        },
      ],
    );
  };

  const submitRequest = async () => {
    setSubmitting(true);
    const result = await requestPremiumClassCard(studentUserId);
    setSubmitting(false);

    if (result.ok) {
      appAlert(
        t('parentDashboard.myClassCardRequestPremiumSuccessTitle'),
        t('parentDashboard.myClassCardRequestPremiumSuccessBody'),
      );
      return;
    }

    if (result.code === 'pending_request_exists') {
      appAlert(
        t('parentDashboard.myClassCardRequestPremiumTitle'),
        t('parentDashboard.myClassCardRequestPremiumPending'),
      );
      return;
    }

    appAlert(
      t('parentDashboard.myClassCardRequestPremiumTitle'),
      t('parentDashboard.myClassCardRequestPremiumError'),
    );
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('parentDashboard.myClassCardRequestPremium')}
      disabled={submitting}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
        submitting && styles.buttonDisabled,
      ]}>
      {submitting ? (
        <ActivityIndicator color={BRAND_BLUE_DARK} size="small" />
      ) : (
        <Ionicons name="card-outline" size={20} color={BRAND_BLUE_DARK} />
      )}
      <Text style={styles.label}>{t('parentDashboard.myClassCardRequestPremium')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    backgroundColor: SURFACE,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: BRAND_BLUE,
    shadowColor: BRAND_BLUE_DARK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  buttonPressed: { opacity: 0.9 },
  buttonDisabled: { opacity: 0.65 },
  label: {
    fontSize: 16,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    letterSpacing: -0.2,
  },
});
