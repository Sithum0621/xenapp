import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import DashboardPremiumTile from '@/src/components/parent/dashboard/DashboardPremiumTile';
import { parentTealBrand } from '@/src/theme/parentDashboardPalette';

function ExamsCard() {
  const { t } = useTranslation();

  return (
    <DashboardPremiumTile accent="exams" title={t('parentDashboard.examsTitle')} minimal>
      <View style={styles.iconWrap}>
        <Ionicons name="school" size={48} color={parentTealBrand} />
      </View>
    </DashboardPremiumTile>
  );
}

export default memo(ExamsCard);

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
