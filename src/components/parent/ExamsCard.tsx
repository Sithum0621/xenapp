import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import DashboardPremiumTile from '@/src/components/parent/dashboard/DashboardPremiumTile';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { parentInkSoft, parentTealBrand } from '@/src/theme/parentDashboardPalette';

function ExamsCard() {
  const { t } = useTranslation();

  return (
    <DashboardPremiumTile
      accent="exams"
      title={t('parentDashboard.examsTitle')}
      subtitle={t('parentDashboard.examsComingSoon')}
      minimal>
      <View style={styles.body}>
        <Ionicons name="school" size={36} color={parentTealBrand} />
        <Text style={styles.title}>{t('parentDashboard.examsPlaceholderTitle')}</Text>
        <Text style={styles.bodyText}>{t('parentDashboard.examsPlaceholderBody')}</Text>
      </View>
    </DashboardPremiumTile>
  );
}

export default memo(ExamsCard);

const styles = StyleSheet.create({
  body: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 13,
    fontFamily: FontFamily.bold,
    color: parentTealBrand,
    textAlign: 'center',
  },
  bodyText: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
    textAlign: 'center',
  },
});
